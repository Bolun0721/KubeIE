import fs from 'node:fs'
import path from 'node:path'
import type {
  FoodConfigPreview,
  FoodEffect,
  FoodProperties,
  FoodTweakerStatus,
  FoodWriteInfo,
  ItemModification
} from '@shared/types'
import { hasFoodProperty } from '@shared/validation'
import { atomicWriteText, backupFile, countBackups, isInside } from './fsUtils'

/**
 * FoodTweaker 配置模块（对应模组 foodtweaker-forge-1.0.0，作者 icywhenhot）。
 *
 * 配置位置与字段依据模组反编译结果（com.foodtweaker.FoodTweakerConfig）：
 *   <gameDir>/config/foodtweaker.json
 *   {
 *     "enabled": true, "logChanges": true,
 *     "foods": {
 *       "<物品ID>": {
 *         "nutrition": int, "saturation": float, "can_always_eat": bool,
 *         "eat_seconds": float,
 *         "effects": [ { "id", "amplifier", "duration_seconds", "probability",
 *                        "ambient", "show_particles", "show_icon" } ]
 *       }
 *     }
 *   }
 *
 * 关键语义（与模组行为一致）：
 * - 未写出的字段由模组保持为物品当前数值；
 * - saturation 是「饱和度倍率」，实际饱和度 = nutrition × saturation × 2；
 * - 写出 effects 会替换该物品原有的全部食用效果；
 * - 对当前不是食物的物品，nutrition 与 saturation 必须同时填写，否则模组跳过该条目
 *   （该提示只在属性编辑区显示，不再作为预览区警告）。
 */

export const FOOD_CONFIG_FILE = 'foodtweaker.json'
/** 备份文件扩展名（与脚本备份 .js.bak 命名风格保持一致） */
const FOOD_BACKUP_EXTENSION = '.json.bak'
const FOOD_BACKUP_BASE = 'foodtweaker'
/** 与模组 EffectEntry 的默认值一致：等于默认值时不写出该字段 */
const EFFECT_DEFAULTS = { ambient: false, showParticles: true, showIcon: true }
/** 新建配置时写入的说明（模组会忽略未知顶层字段） */
const NEW_FILE_COMMENT =
  'FoodTweaker config written by KubeJS Item Editor. 字段含义：nutrition 饥饿值、saturation 饱和度倍率（实际饱和度 = nutrition × saturation × 2）、can_always_eat 饥饿满时仍可食用、eat_seconds 食用秒数（≤0.8 为快速）、effects 食用效果（写出即替换原有全部效果）。'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 保留 4 位小数，避免 0.1 + 0.2 这类浮点噪声写进配置文件 */
function round(value: number): number {
  return Number(value.toFixed(4))
}

/** FoodTweaker 配置文件路径（未选择游戏目录时返回空字符串） */
export function resolveFoodConfigPath(gameDir: string): string {
  const dir = (gameDir ?? '').trim()
  if (!dir) return ''
  return path.join(path.resolve(dir), 'config', FOOD_CONFIG_FILE)
}

/** 在 mods 目录中查找 FoodTweaker 的 jar 文件名 */
function findFoodTweakerJar(modsDir: string): string | undefined {
  try {
    return fs
      .readdirSync(modsDir)
      .find((name) => name.toLowerCase().includes('foodtweaker') && name.toLowerCase().endsWith('.jar'))
  } catch {
    return undefined
  }
}

/** 检测 FoodTweaker 模组与配置文件状态（界面用于提示） */
export function detectFoodTweaker(gameDir: string, backupDir?: string): FoodTweakerStatus {
  const configPath = resolveFoodConfigPath(gameDir)
  const modsDir = configPath ? path.join(path.dirname(path.dirname(configPath)), 'mods') : ''
  const modJar = modsDir ? findFoodTweakerJar(modsDir) : undefined

  return {
    configPath,
    configExists: !!configPath && fs.existsSync(configPath),
    modInstalled: !!modJar,
    modJar,
    backupCount: backupDir ? countBackups(backupDir, FOOD_BACKUP_BASE, FOOD_BACKUP_EXTENSION) : 0
  }
}

/** 解析并校验 FoodTweaker 配置目标路径（写入与写入前预检共用） */
export function resolveFoodTarget(
  gameDir: string
): { ok: true; filePath: string } | { ok: false; error: string } {
  const dir = (gameDir ?? '').trim()
  if (!dir) return { ok: false, error: '尚未选择游戏目录，无法写入 FoodTweaker 配置' }

  const filePath = resolveFoodConfigPath(dir)
  if (!isInside(dir, filePath)) {
    return { ok: false, error: `FoodTweaker 配置路径不在游戏目录范围内，已拒绝写入：${filePath}` }
  }
  return { ok: true, filePath }
}

export interface ReadFoodConfigResult {
  config: JsonObject
  /** 原始文本（文件存在时），用于提示与排查 */
  raw: string | null
  error?: string
}

/**
 * 读取现有配置；文件缺失或 JSON 非法都不抛异常：
 * - 文件不存在 → config 为空对象，无 error；
 * - JSON 非法 → config 为空对象，error 说明原文件将被覆盖（写入前会先备份）。
 */
export function readFoodConfig(filePath: string): ReadFoodConfigResult {
  if (!filePath) return { config: {}, raw: null }

  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch {
    return { config: {}, raw: null }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isObject(parsed)) {
      return { config: {}, raw, error: '现有 config/foodtweaker.json 顶层不是 JSON 对象，已忽略原有内容' }
    }
    return { config: parsed, raw }
  } catch (error) {
    return {
      config: {},
      raw,
      error: `现有 config/foodtweaker.json 不是合法 JSON（${reason(error)}），写入将覆盖它（原文件会先备份）`
    }
  }
}

/** 由界面属性构造模组识别的 foods 条目（字段顺序与模组文档一致） */
function buildFoodEntry(food: FoodProperties): JsonObject | null {
  const entry: JsonObject = {}
  if (food.nutrition != null) entry.nutrition = Math.trunc(food.nutrition)
  if (food.saturation != null) entry.saturation = round(food.saturation)
  if (food.canAlwaysEat != null) entry.can_always_eat = food.canAlwaysEat
  if (food.eatSeconds != null) entry.eat_seconds = round(food.eatSeconds)

  const effects = (food.effects ?? []).filter((effect) => !!effect?.id).map(buildEffectEntry)
  if (effects.length > 0) entry.effects = effects

  return Object.keys(entry).length > 0 ? entry : null
}

function buildEffectEntry(effect: FoodEffect): JsonObject {
  const entry: JsonObject = {
    id: effect.id,
    amplifier: Math.trunc(effect.amplifier ?? 0),
    duration_seconds: round(effect.durationSeconds ?? 30),
    probability: round(effect.probability ?? 1)
  }
  // 与模组默认值相同的显示开关不再写出，保持配置简洁
  if (typeof effect.ambient === 'boolean' && effect.ambient !== EFFECT_DEFAULTS.ambient) {
    entry.ambient = effect.ambient
  }
  if (typeof effect.showParticles === 'boolean' && effect.showParticles !== EFFECT_DEFAULTS.showParticles) {
    entry.show_particles = effect.showParticles
  }
  if (typeof effect.showIcon === 'boolean' && effect.showIcon !== EFFECT_DEFAULTS.showIcon) {
    entry.show_icon = effect.showIcon
  }
  return entry
}

export interface MergeFoodResult {
  /** 合并后的完整配置对象（可直接序列化） */
  config: JsonObject
  warnings: string[]
  /** 实际新增/更新/移除的物品条目数 */
  changed: number
}

/**
 * 把队列中的食物修改合并进现有配置：
 * - 保留原有 enabled / logChanges 与自定义顶层字段（含模组生成的说明字段）；
 * - 保留未在本次队列中出现的既有物品条目；
 * - `remove` 表示删除该物品的覆盖项（恢复原版数值）；
 * - foods 键按字典序排列，保证重复写入的差异稳定。
 */
export function mergeFoodConfig(existing: JsonObject | null, modifications: ItemModification[]): MergeFoodResult {
  const base: JsonObject = isObject(existing) ? existing : {}
  const foods: JsonObject = isObject(base.foods) ? { ...(base.foods as JsonObject) } : {}
  const warnings: string[] = []
  let changed = 0

  for (const modification of modifications ?? []) {
    const itemId = (modification?.itemId ?? '').trim()
    if (!itemId || !hasFoodProperty(modification?.properties)) continue

    const food = modification.properties?.foodProperties
    if (!food || typeof food !== 'object') continue

    if (food.remove) {
      if (itemId in foods) {
        delete foods[itemId]
        changed += 1
      }
      continue
    }

    const entry = buildFoodEntry(food)
    if (!entry) {
      warnings.push(`${itemId}：食物属性为空，已跳过该物品`)
      continue
    }

    foods[itemId] = entry
    changed += 1
  }

  const extra: JsonObject = {}
  for (const [key, value] of Object.entries(base)) {
    if (key === 'foods' || key === 'enabled' || key === 'logChanges') continue
    extra[key] = value
  }

  const config: JsonObject = {}
  if (Object.keys(base).length === 0) config._comment = NEW_FILE_COMMENT
  else if (typeof extra._comment === 'string') config._comment = extra._comment
  delete extra._comment

  config.enabled = typeof base.enabled === 'boolean' ? base.enabled : true
  config.logChanges = typeof base.logChanges === 'boolean' ? base.logChanges : true
  for (const [key, value] of Object.entries(extra)) config[key] = value

  const sortedFoods: JsonObject = {}
  for (const key of Object.keys(foods).sort()) sortedFoods[key] = foods[key]
  config.foods = sortedFoods

  return { config, warnings, changed }
}

/** 序列化为配置文件文本（2 空格缩进 + 结尾换行，与模组默认文件风格一致） */
export function serializeFoodConfig(config: JsonObject): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

/** 生成食物配置预览；队列中没有食物修改时返回 null */
export function previewFoodConfig(gameDir: string, modifications: ItemModification[]): FoodConfigPreview | null {
  const foodModifications = (modifications ?? []).filter((item) => hasFoodProperty(item?.properties))
  if (foodModifications.length === 0) return null

  const filePath = resolveFoodConfigPath(gameDir)
  const warnings: string[] = []
  if (!filePath) warnings.push('尚未选择游戏目录，无法确定 config/foodtweaker.json 的位置')

  const read = readFoodConfig(filePath)
  if (read.error) warnings.push(read.error)

  const merged = mergeFoodConfig(read.config, foodModifications)
  warnings.push(...merged.warnings)
  if (merged.changed === 0) warnings.push('队列中没有需要写入的食物修改')

  return { filePath, code: serializeFoodConfig(merged.config), warnings: [...new Set(warnings)] }
}

export interface FoodWriteRequest {
  gameDir: string
  backupDir: string
  modifications: ItemModification[]
  backupEnabled: boolean
}

export type FoodWriteResult =
  | { ok: true; info: FoodWriteInfo; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[]; message: string }

/**
 * 写入 config/foodtweaker.json：
 * 路径校验 → 读取并合并现有配置 → 备份 → 原子写入（临时文件 + 重命名）→ UTF-8。
 */
export function writeFoodConfig(request: FoodWriteRequest): FoodWriteResult {
  const target = resolveFoodTarget(request?.gameDir ?? '')
  if (!target.ok) {
    return { ok: false, errors: [target.error], warnings: [], message: '路径校验失败' }
  }
  const filePath = target.filePath

  const foodModifications = (request.modifications ?? []).filter((item) => hasFoodProperty(item?.properties))
  if (foodModifications.length === 0) {
    return { ok: false, errors: ['队列中没有食物修改'], warnings: [], message: '没有可写入的内容' }
  }

  const read = readFoodConfig(filePath)
  const warnings: string[] = []
  if (read.error) warnings.push(read.error)

  const merged = mergeFoodConfig(read.config, foodModifications)
  warnings.push(...merged.warnings)

  if (merged.changed === 0) {
    return { ok: false, errors: ['没有需要写入的食物修改'], warnings, message: '没有可写入的内容' }
  }

  const code = serializeFoodConfig(merged.config)

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    const backupPath = backupFile({
      targetPath: filePath,
      backupDir: request.backupDir || path.join(path.dirname(filePath), 'backup'),
      baseName: FOOD_BACKUP_BASE,
      extension: FOOD_BACKUP_EXTENSION,
      enabled: request.backupEnabled
    })

    atomicWriteText(filePath, code)

    return {
      ok: true,
      info: {
        filePath,
        backupPath,
        code,
        message: backupPath ? `写入成功，原文件已备份至 ${backupPath}` : '写入成功'
      },
      warnings
    }
  } catch (error) {
    return {
      ok: false,
      errors: [`FoodTweaker 配置写入失败：${reason(error)}`],
      warnings,
      message: '写入失败'
    }
  }
}
