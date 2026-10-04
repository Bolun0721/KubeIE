import type { CuriosSlotConfig } from './curios'

/**
 * Curios 栏位配置（config/curios-common.toml）纯文本处理。
 *
 * 官方语法（Curios 5.x / MC 1.20.1）：slots 是字符串数组，
 * 每个字符串内部用英文分号 `;` 分隔字段、条目之间用英文逗号分隔：
 *
 *   slots = [
 *     "id=ring;size=8",
 *     "id=charm;size=3;add_cosmetic=true"
 *   ]
 *
 * 写入策略：只替换文件中**未注释**的 `slots = [...]` 赋值，其余内容（含官方注释）原样保留；
 * 找不到时在文件末尾追加，避免覆盖模组生成的其他设置。
 */

/** 追加时写入的说明注释（替换已有 slots 时不插入，避免堆注释） */
export const CURIOS_TOML_HEADER = [
  '#Curios 栏位配置（由 KubeIE写入）',
  '#语法：每个条目内部用英文分号分隔字段，条目之间用英文逗号分隔；id 为必填项',
  '#字段：id、size、operation(SET/ADD/REMOVE)、order、icon、add_cosmetic、use_native_gui、render_toggle、drop_rule',
  '#提示：本文件在游戏加载时由服务端读取并同步给客户端；改完需重进世界或重启服务器'
].join('\n')

/** 单个栏位条目文本：id=ring;size=8;order=100 */
export function serializeSlotEntry(slot: CuriosSlotConfig): string {
  const parts = [`id=${(slot.id ?? '').trim()}`]
  if (slot.size != null) parts.push(`size=${Math.trunc(slot.size)}`)
  if (slot.operation) parts.push(`operation=${slot.operation}`)
  if (slot.order != null) parts.push(`order=${Math.trunc(slot.order)}`)
  const icon = (slot.icon ?? '').trim()
  if (icon) parts.push(`icon=${icon}`)
  // add_cosmetic 的默认值为 false，仅在开启时写出，保持条目简洁
  if (slot.addCosmetic === true) parts.push('add_cosmetic=true')
  if (slot.useNativeGui != null) parts.push(`use_native_gui=${slot.useNativeGui}`)
  if (slot.renderToggle != null) parts.push(`render_toggle=${slot.renderToggle}`)
  if (slot.dropRule) parts.push(`drop_rule=${slot.dropRule}`)
  return parts.join(';')
}

/** slots 赋值块（slots = [ ... ]） */
export function buildSlotsBlock(slots: CuriosSlotConfig[]): string {
  const list = (slots ?? []).map((slot) => `  "${serializeSlotEntry(slot)}"`)
  if (list.length === 0) return 'slots = []'
  return `slots = [\n${list.join(',\n')}\n]`
}

/** 不区分注释与字符串的简易扫描：返回 `[` 对应的 `]` 下标（找不到返回 -1） */
function findArrayEnd(text: string, openIndex: number): number {
  let depth = 0
  let inString = false
  let inComment = false
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i]
    if (inComment) {
      if (char === '\n') inComment = false
      continue
    }
    if (inString) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '#') {
      inComment = true
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 定位未注释的 `slots = ...` 赋值区间（含整行）；找不到返回 null */
export function findSlotsAssignment(text: string): { start: number; end: number } | null {
  const lines = text.split('\n')
  let offset = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('#') && /^slots\s*=/.test(trimmed)) {
      const start = offset + line.indexOf('slots')
      const equals = offset + line.indexOf('=')
      const rest = text.slice(equals + 1)
      const firstChar = rest.search(/[^\s]/)
      if (firstChar >= 0 && rest[firstChar] === '[') {
        const end = findArrayEnd(text, equals + 1 + firstChar)
        if (end >= 0) {
          const lineEnd = text.indexOf('\n', end)
          return { start, end: lineEnd >= 0 ? lineEnd : text.length }
        }
      }
      const lineEnd = text.indexOf('\n', offset)
      return { start, end: lineEnd >= 0 ? lineEnd : text.length }
    }
    offset += line.length + 1
  }

  return null
}

/**
 * 把栏位配置合并进现有文件文本：
 * - 已有未注释的 slots 赋值 → 原样替换该赋值，其余内容保留；
 * - 没有（或只有被注释的示例）→ 在末尾追加说明注释 + slots 赋值。
 */
export function mergeCuriosToml(existing: string | null, slots: CuriosSlotConfig[]): string {
  const block = buildSlotsBlock(slots)
  const text = (existing ?? '').replace(/\r\n?/g, '\n')
  const range = findSlotsAssignment(text)

  if (range) {
    const merged = `${text.slice(0, range.start)}${block}${text.slice(range.end)}`
    return merged.endsWith('\n') ? merged : `${merged}\n`
  }

  const base = text.replace(/\s+$/, '')
  if (!base) return `${CURIOS_TOML_HEADER}\n\n${block}\n`
  return `${base}\n\n${CURIOS_TOML_HEADER}\n\n${block}\n`
}
