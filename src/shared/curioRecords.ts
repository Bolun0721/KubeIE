import { curiosSlotLabel, curioId, summarizeCurio, type CustomCurioDef } from './curios'
import type { CurioRecord, CurioRecordGroup } from './types'

/**
 * 自定义饰品记录（写入历史）：每次「应用修改」成功写入 Curios 饰品脚本后，
 * 把写入的饰品逐个留存，记录界面按所属脚本名称分组展示。
 *
 * 存储顺序约定：记录文件中的 records 为**最新在前**。
 */

/** 自定义饰品记录最多保留的条数（超出后丢弃最旧的） */
export const MAX_CURIO_RECORDS = 300

/** 由一次写入的饰品清单构建记录（同一次写入共享时间与备份路径，id 带序号保证唯一） */
export function buildCurioRecords(options: {
  items: CustomCurioDef[]
  scriptName: string
  filePath: string
  at: string
  backupPath?: string
}): CurioRecord[] {
  const { items, scriptName, filePath, at, backupPath } = options
  if (!Array.isArray(items) || items.length === 0) return []

  return items.map((def, index) => ({
    id: `${at}|${filePath}|${index}`,
    at,
    scriptName,
    filePath,
    backupPath,
    itemId: curioId(def),
    displayName: (def.displayName ?? '').trim() || def.name || curioId(def),
    slotLabel: curiosSlotLabel(def.slot),
    summary: summarizeCurio(def)
  }))
}

/** 取路径中的文件名（记录文件里脚本名缺失时用文件路径兜底） */
function baseName(filePath: string): string {
  const parts = (filePath ?? '').split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

/**
 * 反序列化容错：过滤掉结构非法的条目（记录文件可能被手工改动或来自旧版本）。
 * 同一 id 只保留第一条。
 */
export function sanitizeCurioRecords(input: unknown): CurioRecord[] {
  if (!Array.isArray(input)) return []

  const records: CurioRecord[] = []
  const seen = new Set<string>()

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Record<string, unknown>
    const at = typeof candidate.at === 'string' ? candidate.at : ''
    if (!at) continue
    const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : ''
    if (!itemId) continue

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

    const record: CurioRecord = {
      id,
      at,
      scriptName,
      filePath,
      itemId,
      displayName:
        typeof candidate.displayName === 'string' && candidate.displayName
          ? candidate.displayName
          : itemId,
      slotLabel: typeof candidate.slotLabel === 'string' ? candidate.slotLabel : '',
      summary: Array.isArray(candidate.summary)
        ? (candidate.summary as unknown[]).filter((tag): tag is string => typeof tag === 'string')
        : []
    }
    if (typeof candidate.backupPath === 'string' && candidate.backupPath) {
      record.backupPath = candidate.backupPath
    }
    records.push(record)
  }

  return records
}

/** 上限裁剪：保留最新的 max 条（入参需为最新在前） */
export function trimCurioRecords(
  records: CurioRecord[],
  max: number = MAX_CURIO_RECORDS
): CurioRecord[] {
  if (!Array.isArray(records)) return []
  const limit = Math.max(0, Math.floor(max))
  return records.slice(0, limit)
}

/** 按所属脚本名称分组：组间按组内最新写入时间倒序，组内按写入时间倒序 */
export function groupCurioRecords(records: CurioRecord[]): CurioRecordGroup[] {
  const groups = new Map<string, CurioRecordGroup>()

  for (const record of records ?? []) {
    if (!record || !record.itemId) continue
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
