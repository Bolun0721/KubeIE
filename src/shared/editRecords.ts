import { normalizeProperties } from './properties'
import { hasFoodProperty, hasScriptProperty, isValidItemId } from './validation'
import type { EditRecord, EditRecordGroup, EditRecordTarget, ItemModification } from './types'

/**
 * 编辑记录（写入历史）：每次「应用修改」成功后，把写入每个目标文件的物品逐条记录，
 * 记录界面按所属脚本名称分组展示。
 *
 * 存储顺序约定：config.json 中的 editRecords 为**最新在前**。
 */

/** FoodTweaker 配置文件名固定，作为该类记录的分组名称 */
export const FOOD_CONFIG_FILE_NAME = 'foodtweaker.json'

/** 编辑记录最多保留的条数（超出后丢弃最旧的） */
export const MAX_EDIT_RECORDS = 300

const TARGETS: EditRecordTarget[] = ['script', 'food']

function isTarget(value: unknown): value is EditRecordTarget {
  return typeof value === 'string' && (TARGETS as string[]).includes(value)
}

function targetPredicate(target: EditRecordTarget): (properties: ItemModification['properties']) => boolean {
  return target === 'script' ? hasScriptProperty : hasFoodProperty
}

/**
 * 由一次写入的物品清单构建编辑记录。
 * 只保留属于该目标文件的物品（脚本属性 / 食物属性分别归属不同文件），
 * 属性经 normalizeProperties 清理，避免把未填写的 null 一并存入。
 */
export function buildEditRecords(options: {
  target: EditRecordTarget
  filePath: string
  scriptName: string
  modifications: ItemModification[]
  at: string
  /** 物品 ID → 展示名称（不在内置库中时通常回退为 ID） */
  nameOf: (itemId: string) => string
}): EditRecord[] {
  const { target, filePath, scriptName, modifications, at, nameOf } = options
  if (!Array.isArray(modifications) || modifications.length === 0) return []

  const matches = targetPredicate(target)
  const records: EditRecord[] = []

  modifications.forEach((modification, index) => {
    const itemId = String(modification?.itemId ?? '').trim()
    if (!itemId || !matches(modification?.properties)) return
    records.push({
      id: `${at}|${target}|${index}|${itemId}`,
      at,
      scriptName,
      filePath,
      target,
      itemId,
      displayName: nameOf(itemId) || itemId,
      properties: normalizeProperties(modification.properties)
    })
  })

  return records
}

/**
 * 反序列化容错：过滤掉结构非法的条目（配置文件可能被手工改动或来自旧版本）。
 * 同一 id 只保留第一条。
 */
export function sanitizeEditRecords(input: unknown): EditRecord[] {
  if (!Array.isArray(input)) return []

  const records: EditRecord[] = []
  const seen = new Set<string>()

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Partial<EditRecord>
    const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : ''
    if (!isValidItemId(itemId)) continue
    if (!isTarget(candidate.target)) continue
    if (typeof candidate.at !== 'string' || !candidate.at) continue

    const at = candidate.at
    const scriptName =
      typeof candidate.scriptName === 'string' && candidate.scriptName ? candidate.scriptName : ''
    const filePath = typeof candidate.filePath === 'string' ? candidate.filePath : ''
    const id =
      typeof candidate.id === 'string' && candidate.id
        ? candidate.id
        : `${at}|${candidate.target}|${itemId}`
    if (seen.has(id)) continue
    seen.add(id)

    records.push({
      id,
      at,
      scriptName: scriptName || (candidate.target === 'food' ? FOOD_CONFIG_FILE_NAME : ''),
      filePath,
      target: candidate.target,
      itemId,
      displayName:
        typeof candidate.displayName === 'string' && candidate.displayName
          ? candidate.displayName
          : itemId,
      properties: normalizeProperties(candidate.properties)
    })
  }

  return records
}

/** 上限裁剪：保留最新的 max 条（入参需为最新在前） */
export function trimEditRecords(records: EditRecord[], max: number = MAX_EDIT_RECORDS): EditRecord[] {
  if (!Array.isArray(records)) return []
  const limit = Math.max(0, Math.floor(max))
  return records.slice(0, limit)
}

/**
 * 按所属脚本名称分组：组间按组内最新写入时间倒序，组内按写入时间倒序。
 * 同一脚本名下若存在脚本 / 配置两类记录（理论上不会），以出现顺序较新的一条决定组的目标类型。
 */
export function groupEditRecords(records: EditRecord[]): EditRecordGroup[] {
  const groups = new Map<string, EditRecordGroup>()

  for (const record of records ?? []) {
    if (!record || typeof record.itemId !== 'string') continue
    const key = record.scriptName || record.filePath || '未命名'
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        scriptName: key,
        target: record.target,
        filePath: record.filePath,
        latestAt: record.at,
        records: [record]
      })
      continue
    }
    existing.records.push(record)
    if (record.at > existing.latestAt) {
      existing.latestAt = record.at
      existing.target = record.target
      existing.filePath = record.filePath
    }
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.records.sort((a, b) => (a.at === b.at ? a.itemId.localeCompare(b.itemId) : b.at.localeCompare(a.at)))
  }
  list.sort((a, b) =>
    a.latestAt === b.latestAt ? a.scriptName.localeCompare(b.scriptName) : b.latestAt.localeCompare(a.latestAt)
  )
  return list
}
