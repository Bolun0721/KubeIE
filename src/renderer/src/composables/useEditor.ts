import { computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CUSTOM_ITEM_MOD,
  MAX_CUSTOM_ITEMS,
  createEmptyArmorTier,
  createEmptyCustomItem,
  createEmptyCustomLibrary,
  createEmptyToolTier,
  customItemId,
  normalizeCustomLibrary,
  removeCustomItemById,
  upsertItemInList,
  validateArmorTier,
  validateCustomItem,
  validateToolTier,
  type CustomArmorTierDef,
  type CustomItemDef,
  type CustomItemKind,
  type CustomItemLibrary,
  type CustomToolTierDef
} from '@shared/customItems'
import { groupCustomRecords } from '@shared/customRecords'
import { groupCurioRecords } from '@shared/curioRecords'
import {
  CURIO_ITEM_MOD,
  MAX_CURIO_ATTRIBUTES,
  MAX_CURIO_EFFECTS,
  createEmptyAttribute,
  createEmptyCurio,
  createEmptyCurioLibrary,
  createEmptyEffect,
  createEmptySlotConfig,
  curioId,
  normalizeCurioLibrary,
  removeCurioById,
  upsertCurio,
  validateCurio,
  validateSlotConfig,
  type CustomCurioDef,
  type CurioLibrary,
  type CuriosSlotConfig
} from '@shared/curios'
import { MAX_CURIO_EVENTS, defaultEventParams, findEventCard } from '@shared/curioEvents'
import { groupEditRecords } from '@shared/editRecords'
import { DEFAULT_PROFILE_ID, getProfile } from '@shared/profiles'
import { groupRecipeRecords } from '@shared/recipeRecords'
import {
  cloneProperties,
  createEmptyProperties,
  normalizeProperties,
  propertiesFromEntry,
  withEffectDefaults
} from '@shared/properties'
import {
  RECIPE_GRID_CELLS,
  addDraftToEntry,
  addEntryToDraft,
  createEmptyRecipeAddDraft,
  createEmptyRecipeRemoveDraft,
  removeDraftToEntry,
  removeEntryToDraft,
  validateRecipeEntry
} from '@shared/recipes'
import { hasAnyProperty, hasFoodProperty, hasScriptProperty, isValidItemId, validateModification } from '@shared/validation'
import type {
  AppConfig,
  AppDataInfo,
  CurioRecord,
  CuriosStatus,
  CustomRecord,
  EditRecord,
  EditorMode,
  FoodTweakerStatus,
  ItemCategory,
  ItemEntry,
  ItemFacets,
  ItemModification,
  ItemProperties,
  LogEntry,
  QueueEntry,
  RecipeAddDraft,
  RecipeEntry,
  RecipeKind,
  RecipeRecord,
  RecipeRemoveDraft,
  RecipeTypeId,
  ScanResult,
  ScriptLocation,
  WriteResult
} from '@shared/types'

const api = window.api

interface Filters {
  keyword: string
  mod: string
  category: ItemCategory | ''
}

interface EditorState {
  loading: boolean
  config: AppConfig | null
  scan: ScanResult | null
  location: ScriptLocation | null
  facets: ItemFacets
  filters: Filters
  items: ItemEntry[]
  itemTotal: number
  selected: ItemEntry | null
  /** 正在编辑的队列下标，-1 表示新增模式 */
  editingIndex: number
  draft: ItemProperties
  queue: QueueEntry[]
  preview: string
  previewErrors: string[]
  previewWarnings: string[]
  /** FoodTweaker 配置预览（队列中没有食物修改时为空字符串） */
  foodPreview: string
  foodTargetPath: string
  foodWarnings: string[]
  /** FoodTweaker 模组与配置文件状态 */
  foodStatus: FoodTweakerStatus | null
  /** 编辑记录（物品属性写入历史，保存在数据目录下 KieJS/item-records.json） */
  records: EditRecord[]
  /** 编辑记录抽屉是否打开 */
  recordsVisible: boolean
  /** 配方记录（配方脚本写入历史，保存在数据目录下 KieJS/recipe-records.json） */
  recipeRecords: RecipeRecord[]
  /** 配方记录抽屉是否打开 */
  recipeRecordsVisible: boolean
  /** 自定义物品记录（自定义物品脚本写入历史，保存在数据目录下 KieJS/custom-records.json） */
  customRecords: CustomRecord[]
  /** 自定义物品记录抽屉是否打开 */
  customRecordsVisible: boolean
  /** 自定义饰品库（饰品定义 + Curios 栏位配置），保存在数据目录下 KieJS/curios-items.json */
  curioLibrary: CurioLibrary
  /** 自定义饰品：当前编辑的草稿 */
  curioDraft: CustomCurioDef
  /** 自定义饰品：正在编辑的下标，-1 表示新增 */
  curioEditingIndex: number
  curioPreview: string
  curioErrors: string[]
  curioWarnings: string[]
  /** 自定义饰品脚本目标路径（未选择游戏目录时为空） */
  curioTargetPath: string
  /** 饰品的 server_scripts 伴随脚本预览（服务端事件卡） */
  curioEventPreview: string
  /** 饰品的 server_scripts 伴随脚本目标路径 */
  curioEventTargetPath: string
  /** Curios 栏位配置对话框是否打开 */
  curiosConfigVisible: boolean
  /** 对话框中的栏位草稿（点「应用栏位配置」才落盘） */
  curiosConfigSlots: CuriosSlotConfig[]
  curiosConfigPreview: string
  curiosConfigErrors: string[]
  curiosConfigWarnings: string[]
  curiosConfigTargetPath: string
  /** Curios / kubejs_curios 模组与配置文件检测结果 */
  curiosStatus: CuriosStatus | null
  /** 自定义饰品记录（饰品脚本写入历史，保存在数据目录下 KieJS/curio-records.json） */
  curioRecords: CurioRecord[]
  /** 自定义饰品记录抽屉是否打开 */
  curioRecordsVisible: boolean
  /** 数据目录信息（便携模式 / 用户数据目录） */
  dataInfo: AppDataInfo | null
  /** 当前子界面：物品属性 / 物品配方 */
  mode: EditorMode
  /** 配方：当前操作种类（新建 / 删除） */
  recipeKind: RecipeKind
  recipeAddDraft: RecipeAddDraft
  recipeRemoveDraft: RecipeRemoveDraft
  /** 配方：正在编辑的队列下标，-1 表示新增模式 */
  recipeEditingIndex: number
  /** 配方：当前激活的槽位（点击左侧物品列表即填入该格） */
  recipeActiveSlot: string | null
  recipeQueue: RecipeEntry[]
  recipePreview: string
  recipeErrors: string[]
  recipeWarnings: string[]
  /** 配方脚本目标路径（未选择游戏目录时为空） */
  recipeTargetPath: string
  /** 自定义物品库（物品定义 + 自定义工具 / 盔甲等级），保存在数据目录下 KieJS/custom-items.json */
  customLibrary: CustomItemLibrary
  /** 自定义物品：当前编辑的草稿 */
  customDraft: CustomItemDef
  /** 自定义物品：正在编辑的物品下标，-1 表示新增 */
  customEditingIndex: number
  /** 自定义物品：正在编辑的自定义等级（工具 / 盔甲），null 表示未在编辑等级 */
  customTierDraft: { kind: 'tool' | 'armor'; index: number; def: CustomToolTierDef | CustomArmorTierDef } | null
  customPreview: string
  customErrors: string[]
  customWarnings: string[]
  /** 自定义物品脚本目标路径（未选择游戏目录时为空） */
  customTargetPath: string
  /** 最近一次操作结果（内联状态行，替代弹窗提示） */
  status: { level: LogEntry['level']; text: string } | null
  logs: LogEntry[]
  busy: boolean
  logVisible: boolean
}

const state = reactive<EditorState>({
  loading: true,
  config: null,
  scan: null,
  location: null,
  facets: { mods: [], categories: [], total: 0 },
  filters: { keyword: '', mod: '', category: '' },
  items: [],
  itemTotal: 0,
  selected: null,
  editingIndex: -1,
  draft: createEmptyProperties(),
  queue: [],
  preview: '',
  previewErrors: [],
  previewWarnings: [],
  foodPreview: '',
  foodTargetPath: '',
  foodWarnings: [],
  foodStatus: null,
  records: [],
  recordsVisible: false,
  recipeRecords: [],
  recipeRecordsVisible: false,
  customRecords: [],
  customRecordsVisible: false,
  curioLibrary: createEmptyCurioLibrary(),
  curioDraft: createEmptyCurio(),
  curioEditingIndex: -1,
  curioPreview: '',
  curioErrors: [],
  curioWarnings: [],
  curioTargetPath: '',
  curioEventPreview: '',
  curioEventTargetPath: '',
  curiosConfigVisible: false,
  curiosConfigSlots: [],
  curiosConfigPreview: '',
  curiosConfigErrors: [],
  curiosConfigWarnings: [],
  curiosConfigTargetPath: '',
  curiosStatus: null,
  curioRecords: [],
  curioRecordsVisible: false,
  dataInfo: null,
  mode: 'items',
  recipeKind: 'add',
  recipeAddDraft: createEmptyRecipeAddDraft(),
  recipeRemoveDraft: createEmptyRecipeRemoveDraft(),
  recipeEditingIndex: -1,
  recipeActiveSlot: null,
  recipeQueue: [],
  recipePreview: '',
  recipeErrors: [],
  recipeWarnings: [],
  recipeTargetPath: '',
  customLibrary: createEmptyCustomLibrary(),
  customDraft: createEmptyCustomItem(),
  customEditingIndex: -1,
  customTierDraft: null,
  customPreview: '',
  customErrors: [],
  customWarnings: [],
  customTargetPath: '',
  status: null,
  logs: [],
  busy: false,
  logVisible: true
})

const activeProfile = computed(() => getProfile(state.config?.profileId ?? DEFAULT_PROFILE_ID))

/** 当前编辑目标（新选物品或队列中正在编辑的条目） */
const currentTarget = computed<{ itemId: string; displayName: string; entry: ItemEntry } | null>(() => {
  if (state.selected) {
    return { itemId: state.selected.id, displayName: state.selected.name, entry: state.selected }
  }
  if (state.editingIndex >= 0) {
    const entry = state.queue[state.editingIndex]
    if (entry) {
      return { itemId: entry.itemId, displayName: entry.displayName, entry: resolveEntry(entry.itemId, entry.displayName) }
    }
  }
  return null
})

/** 当前草稿的即时校验结果（renderer 侧预校验，主进程写入前会再校验一次） */
const draftValidation = computed(() => {
  const target = currentTarget.value
  if (!target) return { errors: [], warnings: [] }
  return validateModification(
    { itemId: target.itemId, properties: normalizeProperties(state.draft) },
    state.config?.profileId
  )
})

/** 估算实际饱和度：营养值 × 饱和度倍率 × 2（FoodTweaker 与原生算法一致） */
const saturationEstimate = computed(() => {
  const food = state.draft.foodProperties
  if (!food || food.nutrition == null || food.saturation == null) return null
  return Number((food.nutrition * food.saturation * 2).toFixed(2))
})

/** 编辑记录按所属脚本名称分组（记录界面用） */
const recordGroups = computed(() => groupEditRecords(state.records))

/** 配方记录按所属脚本名称分组（记录界面用） */
const recipeRecordGroups = computed(() => groupRecipeRecords(state.recipeRecords))

/** 自定义物品记录按所属脚本名称分组（记录界面用） */
const customRecordGroups = computed(() => groupCustomRecords(state.customRecords))

/** 自定义饰品记录按所属脚本名称分组（记录界面用） */
const curioRecordGroups = computed(() => groupCurioRecords(state.curioRecords))

/** 当前配方草稿对应的队列条目（即时校验与摘要用） */
const recipeDraftEntry = computed<RecipeEntry>(() =>
  state.recipeKind === 'remove'
    ? removeDraftToEntry(state.recipeRemoveDraft, 'draft')
    : addDraftToEntry(state.recipeAddDraft, 'draft')
)

/** 配方草稿的即时校验结果（主进程写入前会再校验一次） */
const recipeDraftValidation = computed(() => validateRecipeEntry(recipeDraftEntry.value))

function pushLog(level: LogEntry['level'], message: string): void {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  state.logs.unshift({
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    level,
    message
  })
  if (state.logs.length > 300) state.logs.length = 300
}

/**
 * 记录一条操作结果：同时写入底部日志面板与内联状态行（界面不再使用弹窗提示）。
 */
function setStatus(level: LogEntry['level'], message: string): void {
  state.status = { level, text: message }
  pushLog(level, message)
}

function resolveEntry(itemId: string, displayName: string): ItemEntry {
  const found = state.items.find((item) => item.id === itemId)
  if (found) return found
  return {
    id: itemId,
    name: displayName || itemId,
    mod: itemId.split(':')[0] ?? 'minecraft',
    category: 'general',
    edible: false,
    toolLike: false
  }
}

function queueModifications(): ItemModification[] {
  return state.queue
    .map((entry) => ({ itemId: entry.itemId, properties: normalizeProperties(entry.properties) }))
    .filter((modification) => hasAnyProperty(modification.properties))
}

async function bootstrap(): Promise<void> {
  state.loading = true
  try {
    const config = await api.config.get()
    state.config = config

    // 编辑记录（写入历史）持久化在配置文件中，启动时读回
    await loadRecords()
    await loadDataInfo(true)

    // 自定义物品库（物品定义 + 自定义等级）从数据目录读回，并与物品列表合并
    try {
      state.customLibrary = normalizeCustomLibrary(await api.custom.get())
      await refreshCustomPreview()
    } catch (error) {
      pushLog('warning', `自定义物品库读取失败：${error instanceof Error ? error.message : String(error)}`)
    }

    try {
      state.curioLibrary = normalizeCurioLibrary(await api.curios.get())
      await refreshCuriosPreview()
    } catch (error) {
      pushLog('warning', `自定义饰品库读取失败：${error instanceof Error ? error.message : String(error)}`)
    }

    if (config.gameDir) {
      const inspection = await api.detection.inspect(config.gameDir)
      const matched = inspection.locations.find(
        (location) => location.startupScriptsDir === config.startupScriptsDir
      )
      if (matched) {
        state.location = matched
        pushLog('info', `已恢复上次的游戏目录：${matched.startupScriptsDir}`)
        // 旧版本配置没有 server_scripts 目录（配方脚本用），这里补齐
        if (config.serverScriptsDir !== matched.serverScriptsDir) {
          state.config = await api.config.set({ serverScriptsDir: matched.serverScriptsDir })
        }
      } else {
        pushLog('warning', '上次记录的游戏目录已失效，请重新选择')
      }
    }

    // 前置模组检测（Curios / kubejs_curios）：仅在启动时执行一次，结果写进操作日志
    if (config.gameDir) await detectModsOnStartup()

    state.facets = await api.items.facets()

    if (state.location) {
      await search()
      await loadFoodStatus()
      await refreshPreview()
      await refreshRecipePreview()
    }
  } catch (error) {
    pushLog('error', `初始化失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    state.loading = false
  }
}

/** 读取 FoodTweaker 模组与配置文件状态（界面头部与食物属性区提示用） */
async function loadFoodStatus(): Promise<void> {
  try {
    const status = await api.food.info()
    state.foodStatus = status
    if (status.configPath && !status.modInstalled) {
      pushLog('warning', '未在 mods 目录中检测到 FoodTweaker，食物属性写入后需要安装该模组才会生效')
    } else if (status.modInstalled) {
      pushLog(
        'info',
        `已检测到 ${status.modJar}；食物配置：${status.configPath}${status.configExists ? '' : '（尚未生成，写入时会自动创建）'}`
      )
    }
  } catch (error) {
    pushLog('warning', `FoodTweaker 状态检测失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 读取写入记录（属性 / 配方 / 自定义物品 / 自定义饰品记录，存放在数据目录下的 KieJS/） */
async function loadRecords(): Promise<void> {
  try {
    state.records = await api.records.list()
    state.recipeRecords = await api.records.listRecipes()
    state.customRecords = await api.records.listCustom()
    state.curioRecords = await api.records.listCurios()
  } catch (error) {
    pushLog('warning', `写入记录读取失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 读取数据目录信息；withLog 为真时同时写入启动日志（便携模式会标注） */
async function loadDataInfo(withLog = false): Promise<void> {
  try {
    const info = await api.app.info()
    state.dataInfo = info
    if (!withLog) return
    pushLog('info', `数据目录：${info.dataDir}${info.portable ? '（便携模式）' : ''}`)
    if (info.fallbackReason) pushLog('warning', info.fallbackReason)
  } catch (error) {
    pushLog('warning', `数据目录读取失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 切换便携模式：只创建/删除 exe 同目录的 portable.txt，重启后生效 */
async function setPortable(enabled: boolean): Promise<boolean> {
  const result = await api.app.setPortable(enabled)
  state.dataInfo = result.info
  setStatus(result.ok ? 'success' : 'warning', result.message)
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok
}

/** 立即重启软件（用于应用数据目录变更） */
async function relaunchApp(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将立即重启软件以应用数据目录变更；未添加到队列的编辑内容会丢失。',
      '重启软件',
      { confirmButtonText: '立即重启', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  pushLog('info', '正在重启软件…')
  await api.app.relaunch()
}

/** 打开编辑记录抽屉 */
function openRecords(): void {
  state.recordsVisible = true
}

/** 打开配方记录抽屉 */
function openRecipeRecords(): void {
  state.recipeRecordsVisible = true
}

/** 打开自定义物品记录抽屉（读取 KieJS/custom-records.json） */
async function openCustomRecords(): Promise<void> {
  state.customRecords = await api.records.listCustom()
  state.customRecordsVisible = true
}

/** 清空编辑记录（只影响本地历史，不影响已写入的脚本与配置） */
async function clearRecords(): Promise<void> {
  if (state.records.length === 0) return
  try {
    await ElMessageBox.confirm(
      `将删除全部 ${state.records.length} 条属性记录（仅清除本机历史，不影响已写入的脚本与配置）。`,
      '清空编辑记录',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  state.records = await api.records.clear()
  setStatus('info', '已清空编辑记录')
}

/** 清空配方记录（只影响本地历史，不影响已写入的配方脚本） */
async function clearRecipeRecords(): Promise<void> {
  if (state.recipeRecords.length === 0) return
  try {
    await ElMessageBox.confirm(
      `将删除全部 ${state.recipeRecords.length} 条配方记录（仅清除本机历史，不影响已写入的配方脚本）。`,
      '清空配方记录',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  state.recipeRecords = await api.records.clearRecipes()
  setStatus('info', '已清空配方记录')
}

/** 清空自定义物品记录（只影响本地历史，不影响已写入的自定义物品脚本） */
async function clearCustomRecords(): Promise<void> {
  if (state.customRecords.length === 0) return
  try {
    await ElMessageBox.confirm(
      `将删除全部 ${state.customRecords.length} 条自定义物品记录（仅清除本机历史，不影响已写入的自定义物品脚本）。`,
      '清空编辑记录',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  state.customRecords = await api.records.clearCustom()
  setStatus('info', '已清空自定义物品记录')
}

/** 打开自定义饰品记录抽屉（读取 KieJS/curio-records.json） */
async function openCurioRecords(): Promise<void> {
  state.curioRecords = await api.records.listCurios()
  state.curioRecordsVisible = true
}

/** 清空自定义饰品记录（只影响本地历史，不影响已写入的饰品脚本） */
async function clearCurioRecords(): Promise<void> {
  if (state.curioRecords.length === 0) return
  try {
    await ElMessageBox.confirm(
      `将删除全部 ${state.curioRecords.length} 条自定义饰品记录（仅清除本机历史，不影响已写入的饰品脚本）。`,
      '清空编辑记录',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  state.curioRecords = await api.records.clearCurios()
  setStatus('info', '已清空自定义饰品记录')
}

async function scanDirs(): Promise<void> {
  state.busy = true
  try {
    state.scan = await api.detection.scan()
    pushLog(
      'info',
      state.scan.anyUsable
        ? `已扫描 ${state.scan.candidates.length} 个候选目录，其中存在可用 KubeJS 目录`
        : '未自动找到可用的 KubeJS 目录，请手动选择游戏目录'
    )
  } finally {
    state.busy = false
  }
}

async function inspectDir(dir: string): Promise<ScriptLocation[]> {
  const inspection = await api.detection.inspect(dir)
  pushLog(inspection.usable ? 'success' : 'warning', `${inspection.dir}：${inspection.message}`)
  return inspection.locations
}

async function pickDir(): Promise<ScriptLocation[]> {
  const inspection = await api.detection.pick()
  if (!inspection) return []
  pushLog(inspection.usable ? 'success' : 'warning', `${inspection.dir}：${inspection.message}`)
  return inspection.locations
}

async function useLocation(location: ScriptLocation): Promise<void> {
  const profileId = location.suggestedProfileId ?? state.config?.profileId ?? DEFAULT_PROFILE_ID
  state.config = await api.config.set({
    gameDir: location.gameDir,
    startupScriptsDir: location.startupScriptsDir,
    serverScriptsDir: location.serverScriptsDir,
    backupDir: location.backupDir,
    mcVersion: location.mcVersion ?? '',
    profileId
  })
  state.location = location
  pushLog('success', `已选择脚本目录：${location.startupScriptsDir}`)
  if (location.mcVersion) {
    pushLog('info', `检测到 Minecraft ${location.mcVersion}${location.kubejsJar ? `，${location.kubejsJar}` : ''}`)
  }
  await search()
  await loadFoodStatus()
  await refreshPreview()
  await refreshRecipePreview()
}

async function applyConfigPatch(patch: Partial<AppConfig>): Promise<void> {
  state.config = await api.config.set(patch)
}

async function changeProfile(profileId: AppConfig['profileId']): Promise<void> {
  await applyConfigPatch({ profileId })
  pushLog('info', `已切换生成模板：${getProfile(profileId).label}`)
  await refreshPreview()
}

async function search(): Promise<void> {
  const result = await api.items.query({
    keyword: state.filters.keyword,
    mod: state.filters.mod,
    category: state.filters.category,
    offset: 0,
    limit: 300
  })
  state.items = result.items
  state.itemTotal = result.total
}

function selectItem(entry: ItemEntry): void {
  state.selected = entry
  state.editingIndex = -1
  state.draft = propertiesFromEntry(entry)
}

function selectById(rawId: string): void {
  const itemId = rawId.trim()
  if (!isValidItemId(itemId)) {
    ElMessage.warning('请输入合法的物品 ID，例如 minecraft:ender_pearl')
    return
  }
  const found = state.items.find((item) => item.id === itemId)
  if (found) {
    selectItem(found)
    return
  }
  state.selected = {
    id: itemId,
    name: itemId,
    mod: itemId.split(':')[0] ?? 'minecraft',
    category: 'general',
    edible: false,
    toolLike: false
  }
  state.editingIndex = -1
  state.draft = createEmptyProperties()
  pushLog('warning', `${itemId} 不在内置数据库中，已切换为手动编辑模式`)
}

function resetDraft(): void {
  state.selected = null
  state.editingIndex = -1
  state.draft = createEmptyProperties()
}

/** 返回引导页重新选择游戏目录 */
function backToSetup(): void {
  state.location = null
  pushLog('info', '已返回目录选择页，可重新选择游戏目录')
}

function upsertQueue(): void {
  const target = currentTarget.value
  if (!target) {
    ElMessage.warning('请先选择要修改的物品')
    return
  }

  const properties = normalizeProperties(state.draft)
  const validation = validateModification({ itemId: target.itemId, properties }, state.config?.profileId)

  if (validation.errors.length > 0) {
    ElMessage.error(validation.errors[0])
    setStatus('error', validation.errors[0])
    return
  }
  if (!hasAnyProperty(properties)) {
    ElMessage.warning('尚未填写任何属性，未添加到队列')
    setStatus('warning', '尚未填写任何属性，未添加到队列')
    return
  }

  const entry: QueueEntry = {
    itemId: target.itemId,
    displayName: target.displayName,
    properties
  }

  const existingIndex = state.queue.findIndex((item) => item.itemId === entry.itemId)
  if (state.editingIndex >= 0) {
    state.queue.splice(state.editingIndex, 1, entry)
    ElMessage.success('已更新队列项')
    setStatus('success', `已更新队列中的 ${entry.itemId}`)
  } else if (existingIndex >= 0) {
    state.queue.splice(existingIndex, 1, entry)
    ElMessage.success('已覆盖队列中已有的该项')
    setStatus('success', `已覆盖队列中已有的 ${entry.itemId}`)
  } else {
    state.queue.push(entry)
    ElMessage.success('已添加到队列')
    setStatus('success', `已添加到队列：${entry.itemId}`)
  }

  state.editingIndex = -1
  void refreshPreview()
}

function editQueue(index: number): void {
  const entry = state.queue[index]
  if (!entry) return
  const empty = createEmptyProperties()
  const source = cloneProperties(entry.properties)
  state.editingIndex = index
  state.selected = null
  state.draft = {
    ...empty,
    ...source,
    tier: { ...empty.tier, ...(source.tier ?? {}) },
    foodProperties: {
      ...empty.foodProperties,
      ...(source.foodProperties ?? {}),
      // 补齐显示开关默认值，避免界面与实际生效值不一致
      effects: (source.foodProperties?.effects ?? []).map(withEffectDefaults)
    }
  }
}

function removeQueue(index: number): void {
  const entry = state.queue[index]
  if (!entry) return
  state.queue.splice(index, 1)
  if (state.editingIndex === index) {
    resetDraft()
  } else if (state.editingIndex > index) {
    state.editingIndex -= 1
  }
  pushLog('info', `已从队列移除：${entry.itemId}`)
  void refreshPreview()
}

function clearQueue(): void {
  state.queue = []
  resetDraft()
  pushLog('info', '已清空修改队列')
  void refreshPreview()
}

async function refreshPreview(): Promise<void> {
  const modifications = queueModifications()
  const result = await api.script.preview(modifications, state.config?.profileId)
  state.preview = result.code
  state.previewErrors = result.errors
  state.previewWarnings = result.warnings
  state.foodPreview = result.food?.code ?? ''
  state.foodTargetPath = result.food?.filePath ?? ''
  state.foodWarnings = result.food?.warnings ?? []
}

async function writeScript(): Promise<WriteResult> {
  const modifications = queueModifications()
  const fallback: WriteResult = { ok: false, errors: [], warnings: [], message: '已取消' }

  if (modifications.length === 0) {
    ElMessage.warning('修改队列为空，请先添加要修改的物品')
    setStatus('warning', '修改队列为空，请先添加要修改的物品')
    return fallback
  }
  if (!state.location) {
    ElMessage.warning('尚未选择游戏目录')
    setStatus('warning', '尚未选择游戏目录')
    return fallback
  }

  const scriptCount = modifications.filter((item) => hasScriptProperty(item.properties)).length
  const foodCount = modifications.filter((item) => hasFoodProperty(item.properties)).length

  // 写入前确认：列出目标文件（新建 / 覆盖）、备份状态，以及会被忽略的属性提示
  try {
    const targetInfo = await api.script.targetInfo()
    const lines: string[] = []

    if (scriptCount > 0) {
      lines.push(
        targetInfo.filePath
          ? targetInfo.exists
            ? `KubeJS 脚本（${scriptCount} 项）将覆盖：${targetInfo.filePath}${
                targetInfo.backupCount > 0 ? `（已有 ${targetInfo.backupCount} 个历史备份）` : ''
              }`
            : `将新建 KubeJS 脚本：${targetInfo.filePath}`
          : '尚未确定脚本输出路径，请先选择游戏目录'
      )
    }
    if (foodCount > 0) {
      const foodPath = state.foodStatus?.configPath || state.foodTargetPath
      lines.push(
        foodPath
          ? `FoodTweaker 配置（${foodCount} 项）${state.foodStatus?.configExists ? '将覆盖' : '将新建'}：${foodPath}`
          : '尚未确定 FoodTweaker 配置路径，请先选择游戏目录'
      )
    }

    lines.push(`共 ${modifications.length} 项物品修改。`)
    lines.push(state.config?.backupEnabled ? '写入前将自动备份原文件。' : '当前已关闭自动备份（覆盖后不可恢复）。')

    // 预览区的黄色提示已移除，被忽略的属性改为在确认框与日志面板中给出
    if (state.previewWarnings.length > 0) {
      lines.push('')
      lines.push(`以下 ${state.previewWarnings.length} 项属性类型不受支持，生成脚本时会写成注释（详见日志面板）：`)
      lines.push(...state.previewWarnings.slice(0, 5).map((warning) => `· ${warning}`))
      if (state.previewWarnings.length > 5) lines.push(`· 其余 ${state.previewWarnings.length - 5} 项见日志面板`)
    }

    await ElMessageBox.confirm(lines.join('\n'), '确认写入', {
      confirmButtonText: '确认写入',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'write-confirm'
    })
  } catch {
    return fallback
  }

  state.busy = true
  try {
    const result = await api.script.write({
      modifications,
      fileName: state.config?.outputFileName,
      backup: state.config?.backupEnabled,
      profileId: state.config?.profileId
    })

    // 操作日志只记录操作结果与错误；属性类提示（tier 回调失效、数值超范围等）已在确认框与属性编辑区给出
    if (result.ok) {
      if (result.filePath) {
        pushLog('success', `KubeJS 脚本已写入：${result.filePath}`)
        if (result.backupPath) pushLog('info', `脚本备份：${result.backupPath}`)
      }
      if (result.food) {
        pushLog('success', `FoodTweaker 配置已写入：${result.food.filePath}`)
        if (result.food.backupPath) pushLog('info', `配置备份：${result.food.backupPath}`)
      }
      ElMessage.success(result.message)
      setStatus('success', result.message)
    } else {
      for (const error of result.errors) pushLog('error', error)
      ElMessage.error(result.message)
      setStatus('error', result.message)
    }

    await loadFoodStatus()
    await loadRecords()
    await refreshPreview()
    return result
  } finally {
    state.busy = false
  }
}

async function openPath(target: string): Promise<void> {
  const error = await api.shell.openPath(target)
  if (error) ElMessage.warning(error)
}

/** 打开使用手册（打包后与 exe 同目录） */
async function openManual(): Promise<void> {
  const error = await api.shell.openManual()
  if (error) ElMessage.warning(error)
}

/** 打开 FoodTweaker 配置文件所在目录（config/） */
async function openFoodConfigDir(): Promise<void> {
  const configPath = state.foodStatus?.configPath
  if (!configPath) {
    ElMessage.warning('尚未确定 FoodTweaker 配置路径，请先选择游戏目录')
    return
  }
  const dir = configPath.slice(0, Math.max(configPath.lastIndexOf('\\'), configPath.lastIndexOf('/')))
  await openPath(dir || configPath)
}

/* ------------------------------------------------------------------ */
/* 配方编辑                                                            */
/* ------------------------------------------------------------------ */

let recipeKeySeed = 0

function nextRecipeKey(): string {
  recipeKeySeed += 1
  return `recipe-${Date.now()}-${recipeKeySeed}`
}

/**
 * 转成普通对象后再交给 IPC：
 * Vue 的响应式 Proxy 无法被 Electron 的结构化克隆序列化（会报 "An object could not be cloned."）。
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/* ------------------------------------------------------------------ */
/* 自定义物品（子界面三）                                              */
/* ------------------------------------------------------------------ */

/** 自定义物品草稿的校验结果（实时显示在表单下方） */
const customDraftValidation = computed(() =>
  validateCustomItem(state.customDraft, state.customLibrary, state.customEditingIndex)
)

/** 自定义工具 / 盔甲等级草稿的校验结果 */
const customTierValidation = computed<{ errors: string[]; warnings: string[] }>(() => {
  const draft = state.customTierDraft
  if (!draft) return { errors: [], warnings: [] }
  return draft.kind === 'tool'
    ? validateToolTier(draft.def as CustomToolTierDef, state.customLibrary, draft.index)
    : validateArmorTier(draft.def as CustomArmorTierDef, state.customLibrary, draft.index)
})

/** 当前草稿是否正在编辑库中已有物品 */
const customDraftIsNew = computed(() => state.customEditingIndex < 0)

/** 物品列表与筛选器同步刷新（保存自定义物品后立即生效） */
async function refreshItemsAndFacets(): Promise<void> {
  state.facets = await api.items.facets()
  await search()
}

/** 落盘自定义物品库（内部统一入口：保存 → 刷新列表 → 刷新预览） */
async function persistCustomLibrary(next: CustomItemLibrary): Promise<void> {
  state.customLibrary = await api.custom.save(toPlain(next))
  await refreshItemsAndFacets()
  await refreshCustomPreview()
}

/** 切换自定义物品类型：保留 ID / 显示名 / 贴图，类型专属字段重建 */
function setCustomKind(kind: CustomItemKind): void {
  const draft = state.customDraft
  if (draft.kind === kind) return
  state.customDraft = {
    ...createEmptyCustomItem(kind),
    name: draft.name,
    namespace: draft.namespace,
    displayName: draft.displayName,
    texture: draft.texture
  }
}

function resetCustomDraft(): void {
  state.customDraft = createEmptyCustomItem(state.customDraft.kind)
  state.customEditingIndex = -1
}

/** 把草稿加入（或更新）物品库；成功后物品列表立即出现该物品 */
async function upsertCustomItem(): Promise<void> {
  const def = toPlain(state.customDraft) as CustomItemDef
  const validation = validateCustomItem(def, state.customLibrary, state.customEditingIndex)
  if (validation.errors.length > 0) {
    ElMessage.error(validation.errors[0])
    setStatus('error', validation.errors[0])
    return
  }
  if (state.customEditingIndex < 0 && state.customLibrary.items.length >= MAX_CUSTOM_ITEMS) {
    const message = `自定义物品最多 ${MAX_CUSTOM_ITEMS} 个，请先删除部分物品`
    ElMessage.warning(message)
    setStatus('warning', message)
    return
  }

  const id = customItemId(def)
  // 物品库（会写入脚本）与物品列表（左侧显示的已创建物品）各自独立维护：
  // 保存时两边同时写入，之后在任一侧删除都不会影响另一侧。
  await persistCustomLibrary({
    ...state.customLibrary,
    items: upsertItemInList(state.customLibrary.items, def),
    created: upsertItemInList(state.customLibrary.created, def)
  })

  const text = state.customEditingIndex >= 0 ? `已更新自定义物品：${id}` : `已添加自定义物品：${id}`
  ElMessage.success(text)
  setStatus('success', text)
  resetCustomDraft()
}

/** 载入库中物品到表单继续编辑 */
function editCustomItem(index: number): void {
  const def = state.customLibrary.items[index]
  if (!def) return
  state.customDraft = JSON.parse(JSON.stringify(def)) as CustomItemDef
  state.customEditingIndex = index
}

/** 从物品库移除：物品列表中的条目保留（两者互相独立） */
async function removeCustomItem(index: number): Promise<void> {
  const def = state.customLibrary.items[index]
  if (!def) return
  const items = [...state.customLibrary.items]
  items.splice(index, 1)
  await persistCustomLibrary({ ...state.customLibrary, items })
  if (state.customEditingIndex === index) resetCustomDraft()
  else if (state.customEditingIndex > index) state.customEditingIndex -= 1
  const text = `已从物品库移除：${customItemId(def)}（物品列表中仍保留）`
  pushLog('info', text)
  setStatus('info', text)
}

/**
 * 从物品选择列表移除（只删已创建物品记录，不影响物品库与已写入的脚本文件）。
 * 真正删除需要到脚本目录删除或覆盖对应脚本。
 */
async function removeCreatedItem(itemId: string): Promise<void> {
  const id = (itemId ?? '').trim()
  if (!id) return

  try {
    await ElMessageBox.confirm(
      `是否在列表中删除 ${id}？\n若需要真正删除请前往对应文件夹删除或覆盖。`,
      '从物品列表移除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  await persistCustomLibrary({
    ...state.customLibrary,
    created: removeCustomItemById(state.customLibrary.created, id)
  })
  pushLog('info', `已从物品列表移除：${id}`)
  setStatus('info', `已从物品列表移除：${id}`)
}

/** 清空物品库（已创建物品仍在物品列表中显示） */
async function clearCustomItems(): Promise<void> {
  if (state.customLibrary.items.length === 0) return
  try {
    await ElMessageBox.confirm(
      `将清空物品库中的 ${state.customLibrary.items.length} 个自定义物品定义（物品列表中的已创建物品仍会保留，不影响已写入游戏的脚本）。`,
      '清空自定义物品库',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  await persistCustomLibrary({ ...state.customLibrary, items: [] })
  resetCustomDraft()
  pushLog('info', '已清空自定义物品库（物品列表保留已创建物品）')
  setStatus('info', '已清空自定义物品库')
}

/** 新增 / 编辑自定义等级（kind 为 tool / armor，index < 0 表示新增） */
function editCustomTier(kind: 'tool' | 'armor', index: number): void {
  if (kind === 'tool') {
    const existing = index >= 0 ? state.customLibrary.toolTiers[index] : undefined
    state.customTierDraft = {
      kind,
      index,
      def: existing ? (JSON.parse(JSON.stringify(existing)) as CustomToolTierDef) : createEmptyToolTier()
    }
    return
  }
  const existing = index >= 0 ? state.customLibrary.armorTiers[index] : undefined
  const base = existing
    ? (JSON.parse(JSON.stringify(existing)) as CustomArmorTierDef)
    : createEmptyArmorTier()
  // 表单固定编辑 4 个部位的护甲值，缺失时补默认值
  state.customTierDraft = {
    kind,
    index,
    def: {
      ...base,
      slotProtections:
        base.slotProtections && base.slotProtections.length === 4 ? base.slotProtections : [2, 5, 6, 2]
    }
  }
}

function cancelCustomTier(): void {
  state.customTierDraft = null
}

/** 保存等级草稿到库中（物品引用它之前必须先保存） */
async function saveCustomTier(): Promise<void> {
  const draft = state.customTierDraft
  if (!draft) return
  const validation =
    draft.kind === 'tool'
      ? validateToolTier(draft.def as CustomToolTierDef, state.customLibrary, draft.index)
      : validateArmorTier(draft.def as CustomArmorTierDef, state.customLibrary, draft.index)
  if (validation.errors.length > 0) {
    ElMessage.error(validation.errors[0])
    setStatus('error', validation.errors[0])
    return
  }

  const label = draft.kind === 'tool' ? '工具等级' : '盔甲等级'
  if (draft.kind === 'tool') {
    const toolTiers = [...state.customLibrary.toolTiers]
    const def = draft.def as CustomToolTierDef
    if (draft.index >= 0) toolTiers.splice(draft.index, 1, def)
    else toolTiers.push(def)
    await persistCustomLibrary({ ...state.customLibrary, toolTiers })
  } else {
    const armorTiers = [...state.customLibrary.armorTiers]
    const def = draft.def as CustomArmorTierDef
    if (draft.index >= 0) armorTiers.splice(draft.index, 1, def)
    else armorTiers.push(def)
    await persistCustomLibrary({ ...state.customLibrary, armorTiers })
  }

  const text = `${label}已保存：${(draft.def as { name: string }).name}`
  ElMessage.success(text)
  setStatus('success', text)
  state.customTierDraft = null
}

/** 删除自定义等级（被物品引用时给出提示，但不阻止） */
async function removeCustomTier(kind: 'tool' | 'armor', index: number): Promise<void> {
  if (kind === 'tool') {
    const tier = state.customLibrary.toolTiers[index]
    if (!tier) return
    if (state.customTierDraft?.kind === 'tool' && state.customTierDraft.index === index) {
      state.customTierDraft = null
    }
    const toolTiers = [...state.customLibrary.toolTiers]
    toolTiers.splice(index, 1)
    await persistCustomLibrary({ ...state.customLibrary, toolTiers })
    pushLog('info', `已删除工具等级：${tier.name}`)
    return
  }
  const tier = state.customLibrary.armorTiers[index]
  if (!tier) return
  if (state.customTierDraft?.kind === 'armor' && state.customTierDraft.index === index) {
    state.customTierDraft = null
  }
  const armorTiers = [...state.customLibrary.armorTiers]
  armorTiers.splice(index, 1)
  await persistCustomLibrary({ ...state.customLibrary, armorTiers })
  pushLog('info', `已删除盔甲等级：${tier.name}`)
}

/** 重新生成自定义物品脚本预览 */
async function refreshCustomPreview(): Promise<void> {
  const result = await api.custom.preview(toPlain(state.customLibrary))
  state.customPreview = result.code
  state.customErrors = result.errors
  state.customWarnings = result.warnings
  state.customTargetPath = result.filePath
}

/** 写入自定义物品脚本（startup_scripts，需重启游戏生效） */
async function writeCustomItems(): Promise<WriteResult> {
  const fallback: WriteResult = { ok: false, errors: [], warnings: [], message: '已取消' }

  if (state.customLibrary.items.length === 0) {
    ElMessage.warning('物品库为空，请先添加自定义物品')
    setStatus('warning', '物品库为空，请先添加自定义物品')
    return fallback
  }
  if (!state.location) {
    ElMessage.warning('尚未选择游戏目录')
    setStatus('warning', '尚未选择游戏目录')
    return fallback
  }

  try {
    const targetInfo = await api.custom.targetInfo()
    const lines: string[] = []
    lines.push(
      targetInfo.filePath
        ? targetInfo.exists
          ? `自定义物品脚本将覆盖：${targetInfo.filePath}${
              targetInfo.backupCount > 0 ? `（已有 ${targetInfo.backupCount} 个历史备份）` : ''
            }`
          : `将新建自定义物品脚本：${targetInfo.filePath}`
        : '尚未确定脚本输出路径，请先选择游戏目录'
    )
    lines.push(
      `共 ${state.customLibrary.items.length} 个自定义物品` +
        (state.customLibrary.toolTiers.length + state.customLibrary.armorTiers.length > 0
          ? `，以及 ${state.customLibrary.toolTiers.length} 个工具等级 / ${state.customLibrary.armorTiers.length} 个盔甲等级`
          : '')
    )
    lines.push(state.config?.backupEnabled ? '写入前将自动备份原文件。' : '当前已关闭自动备份（覆盖后不可恢复）。')
    lines.push('生效方式：必须重启游戏（物品注册属于启动阶段，reload 不保证生效）。')
    if (state.customWarnings.length > 0) {
      lines.push('')
      lines.push('提示：')
      for (const warning of state.customWarnings.slice(0, 5)) lines.push(`· ${warning}`)
      if (state.customWarnings.length > 5) {
        lines.push(`· 其余 ${state.customWarnings.length - 5} 条提示见下方预览区`)
      }
    }

    await ElMessageBox.confirm(lines.join('\n'), '确认写入自定义物品脚本', {
      confirmButtonText: '确认写入',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'write-confirm'
    })
  } catch {
    return fallback
  }

  state.busy = true
  try {
    const result = await api.custom.write({
      library: toPlain(state.customLibrary),
      fileName: state.config?.customFileName,
      backup: state.config?.backupEnabled
    })

    if (result.ok) {
      if (result.filePath) {
        pushLog('success', `自定义物品脚本已写入：${result.filePath}`)
        if (result.backupPath) pushLog('info', `脚本备份：${result.backupPath}`)
      }
      ElMessage.success(result.message)
      setStatus('success', result.message)
      await refreshItemsAndFacets()
      await loadRecords()
    } else {
      for (const error of result.errors) pushLog('error', error)
      ElMessage.error(result.message)
      setStatus('error', result.message)
    }

    await refreshCustomPreview()
    return result
  } finally {
    state.busy = false
  }
}

/* ------------------------------------------------------------------ */
/* 自定义饰品（Curios，子界面四）                                      */
/* ------------------------------------------------------------------ */

/** 饰品草稿的校验结果（实时显示在表单下方） */
const curioDraftValidation = computed(() =>
  validateCurio(state.curioDraft, state.curioLibrary, state.curioEditingIndex)
)

/** Curios 栏位草稿的校验结果 */
const curiosConfigValidation = computed<{ errors: string[]; warnings: string[] }>(() => {
  const slots = state.curiosConfigSlots
  const errors: string[] = []
  const warnings: string[] = []
  slots.forEach((slot, index) => {
    const result = validateSlotConfig(slot, { ...state.curioLibrary, slots }, index)
    const prefix = `第 ${index + 1} 个栏位：`
    for (const error of result.errors) errors.push(`${prefix}${error}`)
    for (const warning of result.warnings) warnings.push(`${prefix}${warning}`)
  })
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
})

/** 当前草稿是否正在编辑库中已有饰品 */
const curioDraftIsNew = computed(() => state.curioEditingIndex < 0)

/** 落盘饰品库（保存 → 刷新列表 → 刷新脚本预览） */
async function persistCurioLibrary(next: CurioLibrary): Promise<void> {
  state.curioLibrary = await api.curios.save(toPlain(next))
  await refreshItemsAndFacets()
  await refreshCuriosPreview()
}

function resetCurioDraft(): void {
  state.curioDraft = createEmptyCurio()
  state.curioEditingIndex = -1
}

/** 把草稿加入（或更新）饰品库；应用修改后才会进入物品列表 */
async function upsertCurioItem(): Promise<void> {
  const def = toPlain(state.curioDraft) as CustomCurioDef
  const validation = validateCurio(def, state.curioLibrary, state.curioEditingIndex)
  if (validation.errors.length > 0) {
    ElMessage.error(validation.errors[0])
    setStatus('error', validation.errors[0])
    return
  }

  await persistCurioLibrary({
    ...state.curioLibrary,
    items: upsertCurio(state.curioLibrary.items, def)
  })

  const id = curioId(def)
  const text = state.curioEditingIndex >= 0 ? `已更新自定义饰品：${id}` : `已添加自定义饰品：${id}`
  ElMessage.success(text)
  setStatus('success', text)
  resetCurioDraft()
}

/** 载入库中饰品到表单继续编辑 */
function editCurio(index: number): void {
  const def = state.curioLibrary.items[index]
  if (!def) return
  state.curioDraft = JSON.parse(JSON.stringify(def)) as CustomCurioDef
  state.curioEditingIndex = index
}

/** 从饰品库移除（物品列表中的已创建饰品保留） */
async function removeCurio(index: number): Promise<void> {
  const def = state.curioLibrary.items[index]
  if (!def) return
  await persistCurioLibrary({
    ...state.curioLibrary,
    items: removeCurioById(state.curioLibrary.items, curioId(def))
  })
  if (state.curioEditingIndex === index) resetCurioDraft()
  else if (state.curioEditingIndex > index) state.curioEditingIndex -= 1
  const text = `已从饰品库移除：${curioId(def)}（物品列表中仍保留）`
  pushLog('info', text)
  setStatus('info', text)
}

/** 从物品选择列表移除（应用修改后加入的饰品） */
async function removeCreatedCurio(itemId: string): Promise<void> {
  const id = (itemId ?? '').trim()
  if (!id) return

  try {
    await ElMessageBox.confirm(
      `是否在列表中删除 ${id}？\n若需要真正删除请前往对应文件夹删除或覆盖。`,
      '从物品列表移除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  await persistCurioLibrary({
    ...state.curioLibrary,
    created: removeCurioById(state.curioLibrary.created, id)
  })
  pushLog('info', `已从物品列表移除：${id}`)
  setStatus('info', `已从物品列表移除：${id}`)
}

/** 清空饰品库（已创建饰品仍在物品列表中显示） */
async function clearCurios(): Promise<void> {
  if (state.curioLibrary.items.length === 0) return
  try {
    await ElMessageBox.confirm(
      `将清空饰品库中的 ${state.curioLibrary.items.length} 个饰品定义（物品列表中的已创建饰品仍会保留，不影响已写入游戏的脚本）。`,
      '清空自定义饰品库',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  await persistCurioLibrary({ ...state.curioLibrary, items: [] })
  resetCurioDraft()
  pushLog('info', '已清空自定义饰品库（物品列表保留已创建饰品）')
  setStatus('info', '已清空自定义饰品库')
}

/** 添加 / 删除属性加成行 */
function addCurioAttribute(): void {
  if (state.curioDraft.attributes.length >= MAX_CURIO_ATTRIBUTES) return
  state.curioDraft.attributes.push(createEmptyAttribute())
}

function removeCurioAttribute(index: number): void {
  state.curioDraft.attributes.splice(index, 1)
}

/** 添加 / 删除每 tick 效果行 */
function addCurioEffect(): void {
  if (state.curioDraft.effects.length >= MAX_CURIO_EFFECTS) return
  state.curioDraft.effects.push(createEmptyEffect())
}

function removeCurioEffect(index: number): void {
  state.curioDraft.effects.splice(index, 1)
}

/** 添加一张事件卡（同一张卡不能重复添加） */
function addCurioEvent(cardId: string): void {
  const card = findEventCard(cardId)
  if (!card) return
  if (state.curioDraft.events.length >= MAX_CURIO_EVENTS) return
  if (state.curioDraft.events.some((selection) => selection.cardId === cardId)) return
  state.curioDraft.events.push({ cardId, params: defaultEventParams(card) })
}

function removeCurioEvent(index: number): void {
  state.curioDraft.events.splice(index, 1)
}

/** 重新生成饰品脚本预览 */
async function refreshCuriosPreview(): Promise<void> {
  const result = await api.curios.preview(toPlain(state.curioLibrary))
  state.curioPreview = result.code
  state.curioErrors = result.errors
  state.curioWarnings = result.warnings
  state.curioTargetPath = result.filePath
  state.curioEventPreview = result.eventCode
  state.curioEventTargetPath = result.eventFilePath
}

/** 写入饰品脚本（startup_scripts，需重启游戏生效）；成功后饰品进入物品列表 */
async function writeCurios(): Promise<WriteResult> {
  const fallback: WriteResult = { ok: false, errors: [], warnings: [], message: '已取消' }

  if (state.curioLibrary.items.length === 0) {
    ElMessage.warning('饰品库为空，请先添加饰品')
    setStatus('warning', '饰品库为空，请先添加饰品')
    return fallback
  }
  if (!state.location) {
    ElMessage.warning('尚未选择游戏目录')
    setStatus('warning', '尚未选择游戏目录')
    return fallback
  }

  try {
    const targetInfo = await api.curios.targetInfo()
    const lines: string[] = []
    lines.push(
      targetInfo.filePath
        ? targetInfo.exists
          ? `自定义饰品脚本将覆盖：${targetInfo.filePath}${
              targetInfo.backupCount > 0 ? `（已有 ${targetInfo.backupCount} 个历史备份）` : ''
            }`
          : `将新建自定义饰品脚本：${targetInfo.filePath}`
        : '尚未确定脚本输出路径，请先选择游戏目录'
    )
    lines.push(`共 ${state.curioLibrary.items.length} 个自定义饰品`)
    lines.push('前置条件：必须同时安装 Curios 与 kubejs_curios。')
    lines.push(state.config?.backupEnabled ? '写入前将自动备份原文件。' : '当前已关闭自动备份（覆盖后不可恢复）。')
    lines.push('生效方式：必须重启游戏（物品注册属于启动阶段，reload 不保证生效）。')

    await ElMessageBox.confirm(lines.join('\n'), '确认写入自定义饰品脚本', {
      confirmButtonText: '确认写入',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'write-confirm'
    })
  } catch {
    return fallback
  }

  state.busy = true
  try {
    const result = await api.curios.write({
      library: toPlain(state.curioLibrary),
      fileName: state.config?.curioFileName,
      backup: state.config?.backupEnabled
    })

    if (result.ok) {
      if (result.filePath) {
        pushLog('success', `自定义饰品脚本已写入：${result.filePath}`)
        if (result.backupPath) pushLog('info', `脚本备份：${result.backupPath}`)
      }
      ElMessage.success(result.message)
      setStatus('success', result.message)
      // 应用修改成功：主进程已把饰品并入物品列表，这里重新读取饰品库
      state.curioLibrary = normalizeCurioLibrary(await api.curios.get())
      await refreshItemsAndFacets()
      await loadRecords()
    } else {
      for (const error of result.errors) pushLog('error', error)
      ElMessage.error(result.message)
      setStatus('error', result.message)
    }

    await refreshCuriosPreview()
    return result
  } finally {
    state.busy = false
  }
}

/* ---------------------------- Curios 栏位配置 ---------------------------- */

/** 读取 Curios 模组与配置文件状态（静默刷新，不写日志） */
async function loadCuriosStatus(): Promise<void> {
  try {
    state.curiosStatus = await api.curios.info()
  } catch (error) {
    pushLog('warning', `Curios 状态检测失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 把 Curios / kubejs_curios 检测结果写入操作日志（未安装时黄字提醒） */
function logCuriosStatus(status: CuriosStatus): void {
  if (status.curiosInstalled) {
    pushLog('success', `前置模组检测：已安装 Curios${status.curiosJar ? `（${status.curiosJar}）` : ''}`)
  } else {
    pushLog(
      'warning',
      '前置模组检测：未检测到 Curios 本体 —— 自定义饰品无法放入栏位，请安装 Curios（Minecraft 1.20.1 / Forge 版）'
    )
  }

  if (status.bridgeInstalled) {
    pushLog(
      'success',
      `前置模组检测：已安装 kubejs_curios${status.bridgeJar ? `（${status.bridgeJar}）` : ''}`
    )
  } else {
    pushLog(
      'warning',
      '前置模组检测：未检测到 kubejs_curios 桥接模组 —— 缺少它时 attachCuriosCapability 不存在，饰品脚本会直接报错，请安装 kubejs_curios'
    )
  }

  if (status.curiosInstalled && status.bridgeInstalled) {
    pushLog('info', 'Curios 前置齐全，自定义饰品功能可用')
  }
}

/**
 * 启动时的一次性前置模组检测（仅在打开软件时执行）。
 * 结果写入操作日志：已安装为绿字，未安装为黄字安装提醒。
 */
async function detectModsOnStartup(): Promise<void> {
  try {
    const status = await api.curios.info()
    state.curiosStatus = status
    logCuriosStatus(status)
  } catch (error) {
    pushLog('warning', `前置模组检测失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 刷新栏位配置（curios-common.toml）预览 */
async function refreshCuriosConfigPreview(): Promise<void> {
  const result = await api.curios.configPreview(toPlain(state.curiosConfigSlots))
  state.curiosConfigPreview = result.code
  state.curiosConfigErrors = result.errors
  state.curiosConfigWarnings = result.warnings
  state.curiosConfigTargetPath = result.filePath
}

/** 打开「Curios 栏位配置」对话框（以库中已保存的栏位为草稿） */
async function openCuriosConfig(): Promise<void> {
  state.curiosConfigSlots = JSON.parse(JSON.stringify(state.curioLibrary.slots)) as CuriosSlotConfig[]
  await loadCuriosStatus()
  await refreshCuriosConfigPreview()
  state.curiosConfigVisible = true
}

function addCuriosSlot(): void {
  state.curiosConfigSlots.push(createEmptySlotConfig())
}

function removeCuriosSlot(index: number): void {
  state.curiosConfigSlots.splice(index, 1)
}

/** 写入 config/curios-common.toml，并把栏位配置保存进饰品库 */
async function writeCuriosConfig(): Promise<WriteResult> {
  const fallback: WriteResult = { ok: false, errors: [], warnings: [], message: '已取消' }

  if (state.curiosConfigSlots.length === 0) {
    ElMessage.warning('栏位列表为空，请先添加栏位')
    return fallback
  }
  if (!state.location) {
    ElMessage.warning('尚未选择游戏目录')
    setStatus('warning', '尚未选择游戏目录')
    return fallback
  }

  try {
    const targetInfo = await api.curios.configTargetInfo()
    const lines: string[] = []
    lines.push(
      targetInfo.filePath
        ? targetInfo.exists
          ? `将更新 Curios 栏位配置：${targetInfo.filePath}${
              targetInfo.backupCount > 0 ? `（已有 ${targetInfo.backupCount} 个历史备份）` : ''
            }`
          : `将新建 Curios 栏位配置：${targetInfo.filePath}`
        : '尚未确定配置输出路径，请先选择游戏目录'
    )
    lines.push(`共 ${state.curiosConfigSlots.length} 个栏位：${state.curiosConfigSlots.map((slot) => slot.id).join('、')}`)
    lines.push('写入策略：只替换文件中未被注释的 slots 赋值，其余内容原样保留。')
    lines.push('生效方式：重进世界或重启服务器（多人服务器请改服务端存档内的 curios-server.toml）。')
    if (!state.curiosStatus?.curiosInstalled) {
      lines.push('提示：未检测到 Curios 本体，配置可能不生效。')
    }

    await ElMessageBox.confirm(lines.join('\n'), '确认写入 Curios 栏位配置', {
      confirmButtonText: '确认写入',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'write-confirm'
    })
  } catch {
    return fallback
  }

  state.busy = true
  try {
    const result = await api.curios.configWrite({
      slots: toPlain(state.curiosConfigSlots),
      backup: state.config?.backupEnabled
    })

    if (result.ok) {
      if (result.filePath) pushLog('success', `Curios 栏位配置已写入：${result.filePath}`)
      if (result.backupPath) pushLog('info', `配置备份：${result.backupPath}`)
      ElMessage.success(result.message)
      setStatus('success', result.message)
      state.curioLibrary = normalizeCurioLibrary(await api.curios.get())
      state.curiosConfigSlots = JSON.parse(
        JSON.stringify(state.curioLibrary.slots)
      ) as CuriosSlotConfig[]
    } else {
      for (const error of result.errors) pushLog('error', error)
      ElMessage.error(result.message)
      setStatus('error', result.message)
    }

    await refreshCuriosConfigPreview()
    return result
  } finally {
    state.busy = false
  }
}

/** 切换子界面（物品属性 / 物品配方 / 自定义物品 / 自定义饰品） */
function switchMode(mode: EditorMode): void {
  if (state.mode === mode) return
  state.mode = mode
  if (mode === 'recipes') void refreshRecipePreview()
  if (mode === 'custom') void refreshCustomPreview()
  if (mode === 'curios') {
    void refreshCuriosPreview()
    void loadCuriosStatus()
  }
}

function setRecipeKind(kind: RecipeKind): void {
  if (state.recipeKind === kind) return
  state.recipeKind = kind
  state.recipeEditingIndex = -1
  state.recipeActiveSlot = null
}

/** 切换配方类型（保留已填内容，仅改变生成方式） */
function setRecipeType(type: RecipeTypeId): void {
  state.recipeAddDraft.type = type
  state.recipeActiveSlot = null
}

function resetRecipeDraft(): void {
  state.recipeActiveSlot = null
  state.recipeEditingIndex = -1
  if (state.recipeKind === 'remove') {
    state.recipeRemoveDraft = createEmptyRecipeRemoveDraft()
    return
  }
  state.recipeAddDraft = createEmptyRecipeAddDraft(state.recipeAddDraft.type)
}

/** 标记当前编辑的槽位：随后点击左侧物品列表即填入该格 */
function setRecipeActiveSlot(slot: string): void {
  state.recipeActiveSlot = slot
}

/** 把物品 ID 填入当前激活的槽位，返回是否成功 */
function applyRecipeItem(itemId: string): boolean {
  const slot = state.recipeActiveSlot
  if (!slot) return false
  const draft = state.recipeAddDraft

  if (slot.startsWith('grid-')) {
    const index = Number(slot.slice('grid-'.length))
    if (!Number.isInteger(index) || index < 0 || index >= RECIPE_GRID_CELLS) return false
    draft.grid[index] = itemId
    return true
  }

  if (slot.startsWith('ingredient-')) {
    const index = Number(slot.slice('ingredient-'.length))
    if (!Number.isInteger(index) || index < 0) return false
    while (draft.ingredients.length <= index) draft.ingredients.push('')
    draft.ingredients[index] = itemId
    return true
  }

  switch (slot) {
    case 'output':
      draft.output = itemId
      return true
    case 'input':
      draft.input = itemId
      return true
    case 'template':
      draft.template = itemId
      return true
    case 'base':
      draft.base = itemId
      return true
    case 'addition':
      draft.addition = itemId
      return true
    default:
      return false
  }
}

/** 左侧物品列表点击：配方界面下填入当前激活的格子，否则走物品属性编辑流程 */
function pickItem(entry: ItemEntry): void {
  if (state.mode === 'curios') {
    // 自定义饰品子界面：点 KubeCurios 模组的饰品即载入表单继续编辑
    if (entry.mod === CURIO_ITEM_MOD) {
      const index = state.curioLibrary.items.findIndex((item) => curioId(item) === entry.id)
      if (index >= 0) {
        editCurio(index)
        return
      }
      // 已从饰品库移除但仍在物品列表中的饰品：载入表单，保存后可重新加入饰品库
      const created = state.curioLibrary.created.find((item) => curioId(item) === entry.id)
      if (created) {
        state.curioDraft = JSON.parse(JSON.stringify(created)) as CustomCurioDef
        state.curioEditingIndex = -1
        ElMessage.info('该饰品已不在饰品库中，已载入表单；保存后会重新加入饰品库')
        return
      }
    }
    ElMessage.info('这里只能编辑「KubeCurios」模组下的自定义饰品；其他物品请到「物品属性」子界面修改')
    return
  }
  if (state.mode === 'custom') {
    // 自定义物品子界面：点「KubeIE」模组的物品即载入表单继续编辑，其他物品只作参考
    if (entry.mod === CUSTOM_ITEM_MOD) {
      const index = state.customLibrary.items.findIndex((item) => customItemId(item) === entry.id)
      if (index >= 0) {
        editCustomItem(index)
        return
      }
      // 已从物品库移除但仍在物品列表中的物品：载入表单，保存后可重新加入物品库
      const created = state.customLibrary.created.find((item) => customItemId(item) === entry.id)
      if (created) {
        state.customDraft = JSON.parse(JSON.stringify(created)) as CustomItemDef
        state.customEditingIndex = -1
        ElMessage.info('该物品已不在物品库中，已载入表单；保存后会重新加入物品库')
        return
      }
    }
    ElMessage.info('这里只能编辑「KubeIE」模组下的自定义物品；其他物品请到「物品属性」子界面修改')
    return
  }
  if (state.mode !== 'recipes') {
    selectItem(entry)
    return
  }
  // 填入成功不写操作日志：格子内容本身就可见，避免刷屏
  if (applyRecipeItem(entry.id)) return
  ElMessage.warning('请先点击要填充的格子（产物 / 材料格 / 输入格）')
}

function addIngredientSlot(): void {
  state.recipeAddDraft.ingredients.push('')
  state.recipeActiveSlot = `ingredient-${state.recipeAddDraft.ingredients.length - 1}`
}

function removeIngredientSlot(index: number): void {
  const list = state.recipeAddDraft.ingredients
  if (list.length <= 1) {
    list[0] = ''
    return
  }
  list.splice(index, 1)
  state.recipeActiveSlot = null
}

function clearRecipeGrid(): void {
  state.recipeAddDraft.grid = state.recipeAddDraft.grid.map(() => '')
  state.recipeActiveSlot = null
}

/** 把当前草稿加入配方队列（编辑模式下为更新） */
function upsertRecipeQueue(): void {
  const entry =
    state.recipeKind === 'remove'
      ? removeDraftToEntry(state.recipeRemoveDraft, nextRecipeKey())
      : addDraftToEntry(state.recipeAddDraft, nextRecipeKey())

  if (state.recipeEditingIndex >= 0) {
    const current = state.recipeQueue[state.recipeEditingIndex]
    if (current) entry.key = current.key
  }

  const validation = validateRecipeEntry(entry)
  if (validation.errors.length > 0) {
    ElMessage.error(validation.errors[0])
    setStatus('error', validation.errors[0])
    return
  }

  if (state.recipeEditingIndex >= 0) {
    state.recipeQueue.splice(state.recipeEditingIndex, 1, entry)
    ElMessage.success('已更新配方队列项')
    setStatus('success', '已更新配方队列项')
  } else {
    state.recipeQueue.push(entry)
    ElMessage.success('已添加到配方队列')
    setStatus('success', '已添加到配方队列')
  }

  resetRecipeDraft()
  void refreshRecipePreview()
}

function editRecipeQueue(index: number): void {
  const entry = state.recipeQueue[index]
  if (!entry) return
  state.recipeEditingIndex = index
  state.recipeActiveSlot = null
  if (entry.kind === 'remove') {
    state.recipeKind = 'remove'
    state.recipeRemoveDraft = removeEntryToDraft(entry)
  } else {
    state.recipeKind = 'add'
    state.recipeAddDraft = addEntryToDraft(entry)
  }
}

function removeRecipeQueue(index: number): void {
  const entry = state.recipeQueue[index]
  if (!entry) return
  state.recipeQueue.splice(index, 1)
  if (state.recipeEditingIndex === index) resetRecipeDraft()
  else if (state.recipeEditingIndex > index) state.recipeEditingIndex -= 1
  pushLog('info', '已从配方队列移除 1 项')
  void refreshRecipePreview()
}

function clearRecipeQueue(): void {
  state.recipeQueue = []
  resetRecipeDraft()
  pushLog('info', '已清空配方队列')
  void refreshRecipePreview()
}

async function refreshRecipePreview(): Promise<void> {
  const result = await api.recipe.preview(toPlain(state.recipeQueue))
  state.recipePreview = result.code
  state.recipeErrors = result.errors
  state.recipeWarnings = result.warnings
  state.recipeTargetPath = result.filePath
}

/** 应用配方修改：写入 kubejs/server_scripts/<配方脚本名>.js */
async function writeRecipes(): Promise<WriteResult> {
  const fallback: WriteResult = { ok: false, errors: [], warnings: [], message: '已取消' }

  if (state.recipeQueue.length === 0) {
    ElMessage.warning('配方队列为空，请先添加要新建或删除的配方')
    setStatus('warning', '配方队列为空，请先添加要新建或删除的配方')
    return fallback
  }
  if (!state.location) {
    ElMessage.warning('尚未选择游戏目录')
    setStatus('warning', '尚未选择游戏目录')
    return fallback
  }

  const addCount = state.recipeQueue.filter((entry) => entry.kind === 'add').length
  const removeCount = state.recipeQueue.length - addCount

  try {
    const targetInfo = await api.recipe.targetInfo()
    const lines: string[] = []
    lines.push(
      targetInfo.filePath
        ? targetInfo.exists
          ? `配方脚本将覆盖：${targetInfo.filePath}${
              targetInfo.backupCount > 0 ? `（已有 ${targetInfo.backupCount} 个历史备份）` : ''
            }`
          : `将新建配方脚本：${targetInfo.filePath}`
        : '尚未确定配方脚本输出路径，请先选择游戏目录'
    )
    lines.push(`共 ${state.recipeQueue.length} 条配方操作（新增 ${addCount} 条 / 删除 ${removeCount} 条）。`)
    lines.push(state.config?.backupEnabled ? '写入前将自动备份原文件。' : '当前已关闭自动备份（覆盖后不可恢复）。')
    lines.push('生效方式：游戏内执行 /kubejs reload server_scripts 或 /reload，无需重启游戏。')

    if (state.recipeWarnings.length > 0) {
      lines.push('')
      lines.push(`以下 ${state.recipeWarnings.length} 项需要注意：`)
      lines.push(...state.recipeWarnings.slice(0, 5).map((warning) => `· ${warning}`))
      if (state.recipeWarnings.length > 5) lines.push(`· 其余 ${state.recipeWarnings.length - 5} 项见预览区`)
    }

    await ElMessageBox.confirm(lines.join('\n'), '确认写入配方脚本', {
      confirmButtonText: '确认写入',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'write-confirm'
    })
  } catch {
    return fallback
  }

  state.busy = true
  try {
    const result = await api.recipe.write({
      entries: toPlain(state.recipeQueue),
      fileName: state.config?.recipeFileName,
      backup: state.config?.backupEnabled
    })

    if (result.ok) {
      if (result.filePath) {
        pushLog('success', `配方脚本已写入：${result.filePath}`)
        if (result.backupPath) pushLog('info', `脚本备份：${result.backupPath}`)
      }
      ElMessage.success(result.message)
      setStatus('success', result.message)
    } else {
      for (const error of result.errors) pushLog('error', error)
      ElMessage.error(result.message)
      setStatus('error', result.message)
    }

    await loadRecords()
    await refreshRecipePreview()
    return result
  } finally {
    state.busy = false
  }
}

/** 打开 server_scripts 目录 */
async function openServerScriptsDir(): Promise<void> {
  const target = state.location?.serverScriptsDir
  if (!target) {
    ElMessage.warning('尚未选择游戏目录')
    return
  }
  await openPath(target)
}

export function useEditor() {
  return {
    state,
    activeProfile,
    currentTarget,
    draftValidation,
    saturationEstimate,
    recordGroups,
    recipeRecordGroups,
    customRecordGroups,
    curioRecordGroups,
    recipeDraftEntry,
    recipeDraftValidation,
    pushLog,
    setStatus,
    bootstrap,
    scanDirs,
    inspectDir,
    pickDir,
    useLocation,
    applyConfigPatch,
    changeProfile,
    search,
    selectItem,
    selectById,
    resetDraft,
    backToSetup,
    upsertQueue,
    editQueue,
    removeQueue,
    clearQueue,
    refreshPreview,
    writeScript,
    openPath,
    openManual,
    loadFoodStatus,
    openFoodConfigDir,
    loadRecords,
    loadDataInfo,
    setPortable,
    relaunchApp,
    openRecords,
    clearRecords,
    openRecipeRecords,
    clearRecipeRecords,
    openCustomRecords,
    clearCustomRecords,
    openCurioRecords,
    clearCurioRecords,
    switchMode,
    setRecipeKind,
    setRecipeType,
    resetRecipeDraft,
    setRecipeActiveSlot,
    applyRecipeItem,
    pickItem,
    addIngredientSlot,
    removeIngredientSlot,
    clearRecipeGrid,
    upsertRecipeQueue,
    editRecipeQueue,
    removeRecipeQueue,
    clearRecipeQueue,
    refreshRecipePreview,
    writeRecipes,
    openServerScriptsDir,
    // 自定义物品
    customDraftValidation,
    customTierValidation,
    customDraftIsNew,
    setCustomKind,
    resetCustomDraft,
    upsertCustomItem,
    editCustomItem,
    removeCustomItem,
    removeCreatedItem,
    clearCustomItems,
    editCustomTier,
    cancelCustomTier,
    saveCustomTier,
    removeCustomTier,
    refreshCustomPreview,
    writeCustomItems,
    curioDraftValidation,
    curiosConfigValidation,
    curioDraftIsNew,
    resetCurioDraft,
    upsertCurioItem,
    editCurio,
    removeCurio,
    removeCreatedCurio,
    clearCurios,
    addCurioAttribute,
    removeCurioAttribute,
    addCurioEffect,
    removeCurioEffect,
    addCurioEvent,
    removeCurioEvent,
    refreshCuriosPreview,
    writeCurios,
    loadCuriosStatus,
    refreshCuriosConfigPreview,
    openCuriosConfig,
    addCuriosSlot,
    removeCuriosSlot,
    writeCuriosConfig
  }
}
