import { app, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_CUSTOM_FILE_NAME,
  normalizeCustomLibrary,
  validateCustomLibrary
} from '@shared/customItems'
import { buildCurioRecords } from '@shared/curioRecords'
import {
  DEFAULT_CURIO_FILE_NAME,
  curioId,
  normalizeCurioLibrary,
  normalizeSlotList,
  validateCurioLibrary
} from '@shared/curios'
import { buildCustomRecords } from '@shared/customRecords'
import { buildEditRecords } from '@shared/editRecords'
import { getProfile, isMcVersionSupported } from '@shared/profiles'
import { buildRecipeRecords } from '@shared/recipeRecords'
import { normalizeRecipeEntries, validateRecipeEntries } from '@shared/recipes'
import type {
  AppConfig,
  AppDataInfo,
  CurioPreviewResult,
  CurioWritePayload,
  CuriosConfigWritePayload,
  CustomItemPreviewResult,
  CustomItemWritePayload,
  EditRecord,
  ItemModification,
  ItemQuery,
  KubeJsProfileId,
  PortableToggleResult,
  PreviewResult,
  RecipePreviewResult,
  RecipeWritePayload,
  WritePayload,
  WriteResult
} from '@shared/types'
import { outputSubDir } from '@shared/outputLayout'
import { sanitizeScriptFileName, validateModifications } from '@shared/validation'
import {
  getDataDir,
  getExeDir,
  getPortableDir,
  getPortableMarkerState,
  getPortableToggleAvailability,
  setPortableMode
} from './appData'
import { detectCurios, getCuriosConfigTargetInfo, previewCuriosConfig, writeCuriosConfig } from './curiosConfig'
import { generateCurioEventScript, generateCurioScript, hasServerEventCards } from './curioGenerator'
import { CurioStore } from './curioStore'
import { getConfigStore } from './configStore'
import { generateCustomItemScript } from './customItemGenerator'
import { CustomItemStore } from './customItemStore'
import { getCodeTargetInfo, getTargetInfo, writeCodeFile } from './fileWriter'
import { detectFoodTweaker, previewFoodConfig } from './foodTweakerConfig'
import { findItem, getFacets, queryItems, setCurioItems, setCustomItems } from './itemDatabase'
import { inspectDirectory, pickDirectory, scanDirectories } from './pathDetector'
import { RECORD_DIR_NAME, RecordStore } from './recordStore'
import { generateRecipeScript } from './recipeGenerator'
import { generateScript } from './scriptGenerator'
import { writeCoordinated } from './writeCoordinator'

/**
 * IPC 消息路由与参数校验（开发方案 4.1 逻辑层）。
 * 渲染进程不直接接触 fs，所有文件操作均在主进程完成。
 */

const CONFIG_KEYS: (keyof AppConfig)[] = [
  'gameDir',
  'startupScriptsDir',
  'serverScriptsDir',
  'recipeFileName',
  'customFileName',
  'curioFileName',
  'backupDir',
  'mcVersion',
  'profileId',
  'outputFileName',
  'backupEnabled'
]

/** 模板与检测到的 MC 版本不匹配时给出提示 */
function profileWarnings(profileId?: KubeJsProfileId): string[] {
  const config = getConfigStore().get()
  const profile = getProfile(profileId ?? config.profileId)
  const version = config.mcVersion
  if (!version) return []
  if (!isMcVersionSupported(profile, version)) {
    return [
      `当前模板「${profile.label}」适配 MC ${profile.mcVersions}，与检测到的 MC ${version} 不一致，生成的代码可能无法生效`
    ]
  }
  return []
}

/**
 * 结合内置物品库判断属性是否适用于该物品类型。
 * KubeJS 的部分 setter 对类型有要求（digSpeed 仅 DiggerItem、attackDamage 不支持盔甲、tier 仅 TieredItem），
 * 类型不符会抛异常并中断整个 modification 事件，因此这里提前提示。
 */
function capabilityWarnings(modifications: ItemModification[]): string[] {
  const warnings: string[] = []

  for (const modification of modifications) {
    const entry = findItem(modification.itemId)
    const tier = modification.properties?.tier
    const armor = modification.properties?.armor

    if (tier && (entry || tier.speed != null || tier.attackDamageBonus != null || tier.attackSpeed != null)) {
      if (entry) {
        if (tier.speed != null && !entry.diggerLike) {
          warnings.push(
            `${modification.itemId}：该物品不是挖掘类工具（镐/斧/锹/锄），KubeJS 无法设置挖掘速度，生成脚本时会忽略该项`
          )
        }
        if (tier.attackDamageBonus != null) {
          if (entry.diggerLike) {
            warnings.push(
              `${modification.itemId}：挖掘类工具（镐/斧/锹/锄）在 KubeJS 6 下没有 attackDamage 映射，设置会报错并中断整个事件，生成脚本时会忽略该项`
            )
          } else if (entry.category === 'armor') {
            warnings.push(
              `${modification.itemId}：KubeJS 不支持对盔甲类物品设置攻击伤害，生成脚本时会忽略该项`
            )
          }
        }
        const hasTierOnly = tier.level != null || !!tier.repairIngredient
        if (hasTierOnly && !entry.toolLike) {
          warnings.push(
            `${modification.itemId}：该物品不是工具类物品（TieredItem），KubeJS 的 tier 回调会报错，生成脚本时会忽略挖掘等级 / 修复材料`
          )
        }
      }
      if (tier.attackSpeed != null) {
        if (entry?.category === 'armor') {
          warnings.push(`${modification.itemId}：KubeJS 不支持对盔甲类物品设置攻击速度，生成脚本时会忽略该项`)
        } else if (!entry || entry.diggerLike) {
          warnings.push(
            `${modification.itemId}：该物品类型的攻击速度支持情况未经实测，脚本已加 try/catch 保护（失败时只跳过该行）`
          )
        }
      }
    }

    if (armor && (armor.protection != null || armor.toughness != null)) {
      if (!entry) {
        warnings.push(
          `${modification.itemId}：该物品不在内置库中，护甲属性已加 try/catch 保护（非盔甲物品会被跳过）`
        )
      } else if (!entry.armorLike) {
        warnings.push(
          `${modification.itemId}：该物品不是盔甲（ArmorItem，如盾牌 / 鞘翅），KubeJS 的 armorProtection / armorToughness 会报错，生成脚本时会忽略`
        )
      }
    }
  }

  return [...new Set(warnings)]
}

function normalizeModifications(input: unknown): ItemModification[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is ItemModification => !!item && typeof item === 'object')
    .map((item) => ({
      itemId: String((item as ItemModification).itemId ?? '').trim(),
      properties: (item as ItemModification).properties ?? {}
    }))
}

/** 配方脚本目标（server_scripts）信息 */
function recipeTarget(config: AppConfig): { filePath: string; exists: boolean; backupCount: number } {
  return getCodeTargetInfo({
    gameDir: config.gameDir,
    scriptsDir: config.serverScriptsDir,
    backupDir: config.backupDir,
    fileName: config.recipeFileName,
    subDir: outputSubDir('recipes')
  })
}

/** 自定义物品脚本目标（startup_scripts）信息 */
function customTarget(config: AppConfig): { filePath: string; exists: boolean; backupCount: number } {
  return getCodeTargetInfo({
    gameDir: config.gameDir,
    scriptsDir: config.startupScriptsDir,
    backupDir: config.backupDir,
    fileName: config.customFileName || DEFAULT_CUSTOM_FILE_NAME,
    subDir: outputSubDir('items')
  })
}

/** 随包分发的使用手册文件名（打包后位于 exe 同目录） */
const MANUAL_FILE_NAME = '使用手册.md'

/** 自定义饰品脚本目标（startup_scripts）信息 */
function curioTarget(config: AppConfig): { filePath: string; exists: boolean; backupCount: number } {
  return getCodeTargetInfo({
    gameDir: config.gameDir,
    scriptsDir: config.startupScriptsDir,
    backupDir: config.backupDir,
    fileName: config.curioFileName || DEFAULT_CURIO_FILE_NAME,
    subDir: outputSubDir('curios')
  })
}

/** 饰品的 server_scripts 伴随脚本名：curios_trinkets.js → curios_trinkets_events.js */
function curioEventScriptName(config: AppConfig): string {
  const base = (config.curioFileName || DEFAULT_CURIO_FILE_NAME).replace(/\.js$/i, '')
  return `${base}_events.js`
}

/** 饰品的 server_scripts 伴随脚本目标（含击杀/受伤/破坏方块等事件卡）信息 */
function curioEventTarget(config: AppConfig): { filePath: string; exists: boolean; backupCount: number } {
  return getCodeTargetInfo({
    gameDir: config.gameDir,
    scriptsDir: config.serverScriptsDir,
    backupDir: config.backupDir,
    fileName: curioEventScriptName(config),
    subDir: outputSubDir('curios')
  })
}

/** 数据目录信息（含便携模式开关状态） */
function appDataInfo(): AppDataInfo {
  const resolution = getDataDir()
  const exeDir = getExeDir()
  const marker = getPortableMarkerState()
  const toggle = getPortableToggleAvailability()
  return {
    dataDir: resolution.dir,
    recordDir: path.join(resolution.dir, RECORD_DIR_NAME),
    portable: resolution.portable,
    source: resolution.source,
    fallbackReason: resolution.fallbackReason,
    exeDir,
    markerPath: marker.markerPath,
    markerExists: marker.markerExists,
    portableDir: getPortableDir(),
    toggleAvailable: toggle.available,
    toggleReason: toggle.reason
  }
}

export function registerIpcHandlers(): void {
  const store = getConfigStore()

  let recordStore: RecordStore | null = null
  /** 记录存储：数据目录下 KieJS/ 里的属性记录与配方记录文件（首次运行时迁移旧配置里的记录） */
  const records = (): RecordStore => {
    if (!recordStore) {
      recordStore = new RecordStore(
        path.join(getDataDir().dir, RECORD_DIR_NAME),
        store.takeLegacyEditRecords()
      )
    }
    return recordStore
  }

  /** 自定义物品库：数据目录下 KieJS/custom-items.json，启动即并入物品列表（KubeIE 模组） */
  const customStore = new CustomItemStore(path.join(getDataDir().dir, RECORD_DIR_NAME))
  const syncCustomItems = (): void => setCustomItems(customStore.get())
  syncCustomItems()

  /** 自定义饰品库：数据目录下 KieJS/curios-items.json，启动即并入物品列表（KubeCurios 模组） */
  const curioStore = new CurioStore(path.join(getDataDir().dir, RECORD_DIR_NAME))
  const syncCurioItems = (): void => setCurioItems(curioStore.get())
  syncCurioItems()

  ipcMain.handle('app:info', (): AppDataInfo => appDataInfo())

  ipcMain.handle('app:set-portable', (_event, enabled: unknown): PortableToggleResult => {
    const result = setPortableMode(enabled === true)
    return { ...result, info: appDataInfo() }
  })

  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('config:get', () => store.get())

  ipcMain.handle('config:set', (_event, patch: Partial<AppConfig>) => {
    const safePatch: Partial<AppConfig> = {}
    if (patch && typeof patch === 'object') {
      for (const key of CONFIG_KEYS) {
        const value = (patch as Record<string, unknown>)[key as string]
        if (value === undefined) continue
        if (key === 'backupEnabled') {
          if (typeof value === 'boolean') safePatch.backupEnabled = value
        } else if (typeof value === 'string') {
          ;(safePatch as Record<string, unknown>)[key as string] = value
        }
      }
    }
    return store.set(safePatch)
  })

  ipcMain.handle('detect:scan', () => scanDirectories())

  ipcMain.handle('detect:inspect', (_event, dir: unknown) => {
    if (typeof dir !== 'string' || dir.trim() === '') {
      return { dir: '', exists: false, usable: false, locations: [], message: '目录参数非法' }
    }
    return inspectDirectory(dir)
  })

  ipcMain.handle('detect:pick', () => pickDirectory())

  ipcMain.handle('items:query', (_event, query: ItemQuery) => {
    const safeQuery: ItemQuery =
      query && typeof query === 'object' ? query : { keyword: '', mod: '', category: '' }
    return queryItems(safeQuery)
  })

  ipcMain.handle('items:facets', () => getFacets())

  ipcMain.handle('script:preview', (_event, rawModifications: unknown, profileId?: KubeJsProfileId): PreviewResult => {
    const modifications = normalizeModifications(rawModifications)
    const effectiveProfileId = profileId ?? store.get().profileId
    const validation = validateModifications(modifications, effectiveProfileId)
    return {
      code: generateScript(modifications, { profileId: effectiveProfileId }),
      errors: validation.errors,
      warnings: [
        ...new Set([
          ...validation.warnings,
          ...capabilityWarnings(modifications),
          ...profileWarnings(effectiveProfileId)
        ])
      ],
      profileId: effectiveProfileId,
      // 食物修改写入 FoodTweaker 的 config/foodtweaker.json，与 KubeJS 脚本互相独立
      food: previewFoodConfig(store.get().gameDir, modifications)
    }
  })

  ipcMain.handle('food:info', () => {
    const config = store.get()
    return detectFoodTweaker(config.gameDir, config.backupDir)
  })

  ipcMain.handle('records:list', () => records().getEditRecords())

  ipcMain.handle('records:clear', () => records().clearEditRecords())

  ipcMain.handle('records:list-recipes', () => records().getRecipeRecords())

  ipcMain.handle('records:clear-recipes', () => records().clearRecipeRecords())

  ipcMain.handle('records:list-custom', () => records().getCustomRecords())

  ipcMain.handle('records:clear-custom', () => records().clearCustomRecords())

  ipcMain.handle('records:list-curios', () => records().getCurioRecords())

  ipcMain.handle('records:clear-curios', () => records().clearCurioRecords())

  ipcMain.handle('script:target-info', () => {
    const config = store.get()
    return getTargetInfo({
      gameDir: config.gameDir,
      startupScriptsDir: config.startupScriptsDir,
      backupDir: config.backupDir,
      fileName: config.outputFileName
    })
  })

  ipcMain.handle('script:write', (_event, payload: WritePayload): WriteResult => {
    const config = store.get()
    const modifications = normalizeModifications(payload?.modifications)
    const profileId = payload?.profileId ?? config.profileId

    if (modifications.length === 0) {
      return {
        ok: false,
        errors: ['修改队列为空，请先添加要修改的物品'],
        warnings: [],
        message: '没有可写入的内容'
      }
    }

    // 一次「应用修改」可能同时写入 KubeJS 脚本与 FoodTweaker 配置，由协调器统一处理
    const result = writeCoordinated({
      gameDir: config.gameDir,
      startupScriptsDir: config.startupScriptsDir,
      backupDir: config.backupDir,
      outputFileName: config.outputFileName,
      backupEnabled: config.backupEnabled,
      profileId,
      modifications,
      fileName: payload?.fileName,
      backup: payload?.backup
    })

    if (result.ok && result.filePath && result.scriptItemCount > 0) {
      store.addGenerated({
        filePath: result.filePath,
        at: new Date().toISOString(),
        itemCount: result.scriptItemCount,
        backupPath: result.backupPath
      })
    }

    // 编辑记录：把本次写入各目标文件的物品逐条留存，供「编辑记录」界面按脚本名称分组查看
    if (result.ok) {
      const at = new Date().toISOString()
      const nameOf = (itemId: string): string => findItem(itemId)?.name ?? itemId
      const newRecords: EditRecord[] = []

      if (result.filePath && result.scriptItemCount > 0) {
        newRecords.push(
          ...buildEditRecords({
            target: 'script',
            filePath: result.filePath,
            scriptName: path.basename(result.filePath),
            modifications,
            at,
            nameOf
          })
        )
      }
      if (result.food) {
        newRecords.push(
          ...buildEditRecords({
            target: 'food',
            filePath: result.food.filePath,
            scriptName: path.basename(result.food.filePath),
            modifications,
            at,
            nameOf
          })
        )
      }
      records().addEditRecords(newRecords)
    }

    return {
      ok: result.ok,
      filePath: result.filePath,
      backupPath: result.backupPath,
      code: result.code,
      errors: result.errors,
      warnings: [
        ...new Set([...result.warnings, ...capabilityWarnings(modifications), ...profileWarnings(profileId)])
      ],
      message: result.message,
      food: result.food
    }
  })

  /* ------------------------------ 配方编辑 ------------------------------ */

  ipcMain.handle('recipe:preview', (_event, rawEntries: unknown): RecipePreviewResult => {
    const config = store.get()
    const entries = normalizeRecipeEntries(rawEntries)
    const validation = validateRecipeEntries(entries)
    return {
      code: generateRecipeScript(entries),
      errors: validation.errors,
      warnings: validation.warnings,
      filePath: recipeTarget(config).filePath
    }
  })

  ipcMain.handle('recipe:target-info', () => recipeTarget(store.get()))

  ipcMain.handle('recipe:write', (_event, payload: RecipeWritePayload): WriteResult => {
    const config = store.get()
    const entries = normalizeRecipeEntries(payload?.entries)

    if (entries.length === 0) {
      return {
        ok: false,
        errors: ['配方队列为空，请先添加要新建或删除的配方'],
        warnings: [],
        message: '没有可写入的内容'
      }
    }

    const validation = validateRecipeEntries(entries)
    if (validation.errors.length > 0) {
      return {
        ok: false,
        errors: validation.errors,
        warnings: validation.warnings,
        message: '配方校验未通过，已取消写入'
      }
    }

    const result = writeCodeFile({
      gameDir: config.gameDir,
      scriptsDir: config.serverScriptsDir,
      backupDir: config.backupDir,
      fileName: sanitizeScriptFileName(payload?.fileName ?? '') || config.recipeFileName,
      subDir: outputSubDir('recipes'),
      code: generateRecipeScript(entries),
      backupEnabled: payload?.backup ?? config.backupEnabled
    })

    // 配方记录：把本次写入的配方逐条留存，供「配方记录」界面按脚本名称分组查看
    if (result.ok && result.filePath) {
      records().addRecipeRecords(
        buildRecipeRecords({
          entries,
          scriptName: path.basename(result.filePath),
          filePath: result.filePath,
          at: new Date().toISOString(),
          backupPath: result.backupPath
        })
      )
    }

    return { ...result, warnings: [...new Set([...result.warnings, ...validation.warnings])] }
  })

  ipcMain.handle('custom:get', () => customStore.get())

  ipcMain.handle('custom:save', (_event, library: unknown) => {
    const saved = customStore.save(library)
    syncCustomItems()
    return saved
  })

  ipcMain.handle('custom:preview', (_event, library: unknown): CustomItemPreviewResult => {
    const normalized = normalizeCustomLibrary(library)
    const validation = validateCustomLibrary(normalized)
    return {
      code: generateCustomItemScript(normalized),
      errors: validation.errors,
      warnings: validation.warnings,
      filePath: customTarget(store.get()).filePath
    }
  })

  ipcMain.handle('custom:target-info', () => customTarget(store.get()))

  ipcMain.handle('custom:write', (_event, payload: CustomItemWritePayload): WriteResult => {
    const config = store.get()
    // 以落盘内容为准：先把物品库保存下来，再按保存后的内容生成脚本
    const library = customStore.save(payload?.library)
    syncCustomItems()

    if (library.items.length === 0) {
      return {
        ok: false,
        errors: ['自定义物品库为空，请先添加物品'],
        warnings: [],
        message: '没有可写入的内容'
      }
    }

    const validation = validateCustomLibrary(library)
    if (validation.errors.length > 0) {
      return {
        ok: false,
        errors: validation.errors,
        warnings: validation.warnings,
        message: '自定义物品校验未通过，已取消写入'
      }
    }

    const result = writeCodeFile({
      gameDir: config.gameDir,
      scriptsDir: config.startupScriptsDir,
      backupDir: config.backupDir,
      fileName: sanitizeScriptFileName(payload?.fileName ?? '') || config.customFileName,
      subDir: outputSubDir('items'),
      code: generateCustomItemScript(library),
      backupEnabled: payload?.backup ?? config.backupEnabled
    })

    if (result.ok && result.filePath) {
      const at = new Date().toISOString()
      store.addGenerated({
        filePath: result.filePath,
        at,
        itemCount: library.items.length,
        backupPath: result.backupPath
      })
      // 自定义物品记录：把本次写入的物品逐个留存，供「编辑记录」界面按脚本名称分组查看
      records().addCustomRecords(
        buildCustomRecords({
          items: library.items,
          scriptName: path.basename(result.filePath),
          filePath: result.filePath,
          at,
          backupPath: result.backupPath
        })
      )
    }

    return { ...result, warnings: [...new Set([...result.warnings, ...validation.warnings])] }
  })

  ipcMain.handle('curios:get', () => curioStore.get())

  ipcMain.handle('curios:save', (_event, library: unknown) => {
    const saved = curioStore.save(library)
    syncCurioItems()
    return saved
  })

  ipcMain.handle('curios:preview', (_event, library: unknown): CurioPreviewResult => {
    const normalized = normalizeCurioLibrary(library)
    const validation = validateCurioLibrary(normalized)
    return {
      code: generateCurioScript(normalized),
      eventCode: generateCurioEventScript(normalized),
      errors: validation.errors,
      warnings: validation.warnings,
      filePath: curioTarget(store.get()).filePath,
      eventFilePath: curioEventTarget(store.get()).filePath
    }
  })

  ipcMain.handle('curios:target-info', () => curioTarget(store.get()))

  ipcMain.handle('curios:write', (_event, payload: CurioWritePayload): WriteResult => {
    const config = store.get()
    // 以落盘内容为准：先把饰品库保存下来，再按保存后的内容生成脚本
    const library = curioStore.save(payload?.library)
    syncCurioItems()

    if (library.items.length === 0) {
      return {
        ok: false,
        errors: ['饰品库为空，请先添加饰品'],
        warnings: [],
        message: '没有可写入的内容'
      }
    }

    const validation = validateCurioLibrary(library)
    if (validation.errors.length > 0) {
      return {
        ok: false,
        errors: validation.errors,
        warnings: validation.warnings,
        message: '饰品校验未通过，已取消写入'
      }
    }

    const result = writeCodeFile({
      gameDir: config.gameDir,
      scriptsDir: config.startupScriptsDir,
      backupDir: config.backupDir,
      fileName: sanitizeScriptFileName(payload?.fileName ?? '') || config.curioFileName,
      subDir: outputSubDir('curios'),
      code: generateCurioScript(library),
      backupEnabled: payload?.backup ?? config.backupEnabled
    })

    if (result.ok && result.filePath) {
      const at = new Date().toISOString()
      store.addGenerated({
        filePath: result.filePath,
        at,
        itemCount: library.items.length,
        backupPath: result.backupPath
      })
      // 自定义饰品记录：把本次写入的饰品逐个留存，供「编辑记录」界面按脚本名称分组查看
      records().addCurioRecords(
        buildCurioRecords({
          items: library.items,
          scriptName: path.basename(result.filePath),
          filePath: result.filePath,
          at,
          backupPath: result.backupPath
        })
      )
      // 应用修改成功后，把饰品并入物品列表（created），界面按 KubeCurios 模组绿色高亮
      const created = [...library.created]
      for (const def of library.items) {
        const id = curioId(def)
        const index = created.findIndex((item) => curioId(item) === id)
        if (index >= 0) created.splice(index, 1, def)
        else created.push(def)
      }
      curioStore.save({ ...library, created })
      syncCurioItems()
    }

    // 服务端事件卡（击杀/受伤/破坏方块）必须写到 server_scripts 的伴随脚本里
    let curioEventsFile: WriteResult['curioEventsFile']
    if (result.ok && hasServerEventCards(library)) {
      const eventResult = writeCodeFile({
        gameDir: config.gameDir,
        scriptsDir: config.serverScriptsDir,
        backupDir: config.backupDir,
        fileName: curioEventScriptName(config),
        subDir: outputSubDir('curios'),
        code: generateCurioEventScript(library),
        backupEnabled: payload?.backup ?? config.backupEnabled
      })
      if (eventResult.ok && eventResult.filePath) {
        curioEventsFile = {
          filePath: eventResult.filePath,
          backupPath: eventResult.backupPath,
          code: generateCurioEventScript(library)
        }
        store.addGenerated({
          filePath: eventResult.filePath,
          at: new Date().toISOString(),
          itemCount: library.items.length,
          backupPath: eventResult.backupPath
        })
      } else {
        return {
          ...result,
          curioEventsFile,
          warnings: [...new Set([...result.warnings, ...validation.warnings, ...eventResult.errors])],
          message: `${result.message}；但事件脚本写入失败：${eventResult.message}`
        }
      }
    }

    return {
      ...result,
      curioEventsFile,
      warnings: [...new Set([...result.warnings, ...validation.warnings])]
    }
  })

  ipcMain.handle('curios:config-preview', (_event, slots: unknown) =>
    previewCuriosConfig(store.get().gameDir, normalizeSlotList(slots))
  )

  ipcMain.handle('curios:config-target-info', () => {
    const config = store.get()
    return getCuriosConfigTargetInfo(config.gameDir, config.backupDir)
  })

  ipcMain.handle('curios:config-write', (_event, payload: CuriosConfigWritePayload): WriteResult => {
    const config = store.get()
    const result = writeCuriosConfig({
      gameDir: config.gameDir,
      backupDir: config.backupDir,
      slots: normalizeSlotList(payload?.slots),
      backupEnabled: payload?.backup ?? config.backupEnabled
    })
    if (result.ok && result.filePath) {
      const pkg = curioStore.get()
      curioStore.save({ ...pkg, slots: normalizeSlotList(payload?.slots) })
      syncCurioItems()
    }
    return result
  })

  ipcMain.handle('curios:info', () => {
    const config = store.get()
    return detectCurios(config.gameDir, config.backupDir)
  })

  ipcMain.handle('shell:open-path', async (_event, target: unknown) => {
    if (typeof target !== 'string' || target.trim() === '') return '路径参数非法'
    const error = await shell.openPath(target)
    return error
  })

  /**
   * 打开随包分发的使用手册。
   * 打包后手册与 exe 同目录（electron-builder extraFiles）；开发态在项目根目录。
   */
  ipcMain.handle('shell:open-manual', async () => {
    const candidates = [
      path.join(getExeDir(), MANUAL_FILE_NAME),
      path.join(process.cwd(), MANUAL_FILE_NAME),
      path.join(app.getAppPath(), MANUAL_FILE_NAME)
    ]
    const target = candidates.find((candidate) => fs.existsSync(candidate))
    if (!target) return `未找到 ${MANUAL_FILE_NAME}（应与程序放在同一目录）`
    return shell.openPath(target)
  })
}