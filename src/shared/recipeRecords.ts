import { normalizeRecipeEntries } from './recipes'
import type { RecipeEntry, RecipeRecord, RecipeRecordGroup } from './types'

/**
 * 配方记录（写入历史）：每次「应用修改」成功写入配方脚本后，把写入的配方逐条留存，
 * 记录界面按所属脚本名称分组展示。
 *
 * 存储顺序约定：记录文件中的 records 为**最新在前**。
 */

/** 配方记录最多保留的条数（超出后丢弃最旧的） */
export const MAX_RECIPE_RECORDS = 300

/** 由一次写入的配方清单构建记录（同一次写入共享时间与备份路径，id 带序号保证唯一） */
export function buildRecipeRecords(options: {
  entries: RecipeEntry[]
  scriptName: string
  filePath: string
  at: string
  backupPath?: string
}): RecipeRecord[] {
  const { entries, scriptName, filePath, at, backupPath } = options
  if (!Array.isArray(entries) || entries.length === 0) return []

  return entries.map((entry, index) => ({
    id: `${at}|${filePath}|${index}`,
    at,
    scriptName,
    filePath,
    backupPath,
    entry
  }))
}

/** 取路径中的文件名（记录文件里脚本名缺失时用文件路径兜底，避免分组名过长） */
function baseName(filePath: string): string {
  const parts = (filePath ?? '').split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

/**
 * 反序列化容错：过滤掉结构非法的条目（记录文件可能被手工改动或来自旧版本）。
 * 条目内容经 normalizeRecipeEntries 规范化，同一 id 只保留第一条。
 */
export function sanitizeRecipeRecords(input: unknown): RecipeRecord[] {
  if (!Array.isArray(input)) return []

  const records: RecipeRecord[] = []
  const seen = new Set<string>()

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Record<string, unknown>
    const at = typeof candidate.at === 'string' ? candidate.at : ''
    if (!at) continue

    const rawEntry = candidate.entry as Record<string, unknown> | undefined
    if (!rawEntry || (rawEntry.kind !== 'add' && rawEntry.kind !== 'remove')) continue
    const entry = normalizeRecipeEntries([rawEntry])[0]
    if (!entry) continue

    const filePath = typeof candidate.filePath === 'string' ? candidate.filePath : ''
    const scriptName =
      typeof candidate.scriptName === 'string' && candidate.scriptName
        ? candidate.scriptName
        : filePath
          ? baseName(filePath)
          : '未命名'
    const id =
      typeof candidate.id === 'string' && candidate.id
        ? candidate.id
        : `${at}|${filePath}|${records.length}`
    if (seen.has(id)) continue
    seen.add(id)

    const record: RecipeRecord = { id, at, scriptName, filePath, entry }
    if (typeof candidate.backupPath === 'string' && candidate.backupPath) {
      record.backupPath = candidate.backupPath
    }
    records.push(record)
  }

  return records
}

/** 上限裁剪：保留最新的 max 条（入参需为最新在前） */
export function trimRecipeRecords(
  records: RecipeRecord[],
  max: number = MAX_RECIPE_RECORDS
): RecipeRecord[] {
  if (!Array.isArray(records)) return []
  const limit = Math.max(0, Math.floor(max))
  return records.slice(0, limit)
}

/** 按所属脚本名称分组：组间按组内最新写入时间倒序，组内按写入时间倒序 */
export function groupRecipeRecords(records: RecipeRecord[]): RecipeRecordGroup[] {
  const groups = new Map<string, RecipeRecordGroup>()

  for (const record of records ?? []) {
    if (!record || !record.entry) continue
    const key = record.scriptName || record.filePath || '未命名'
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        scriptName: key,
        filePath: record.filePath,
        latestAt: record.at,
        records: [record]
      })
      continue
    }
    existing.records.push(record)
    if (record.at > existing.latestAt) {
      existing.latestAt = record.at
      existing.filePath = record.filePath
    }
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.records.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : b.at.localeCompare(a.at)))
  }
  list.sort((a, b) =>
    a.latestAt === b.latestAt ? a.scriptName.localeCompare(b.scriptName) : b.latestAt.localeCompare(a.latestAt)
  )
  return list
}
