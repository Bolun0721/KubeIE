import { RECIPE_GRID_SIZE, isRecipeRegex, recipeRemoveModeInfo, recipeTypeInfo } from '@shared/recipes'
import type { RecipeAddEntry, RecipeEntry, RecipeRemoveEntry } from '@shared/types'

/**
 * 配方脚本生成（开发方案配方模块）。
 * 依据 KubeJS 6 / MC 1.20.1 的 ServerEvents.recipes 写法生成，
 * 输出到 kubejs/server_scripts/，可用 /kubejs reload server_scripts 热重载。
 *
 * 顺序约定：**先删除、后新增** —— 否则自己新增的配方可能被同文件里的 remove 规则删掉。
 */

const HEADER: string[] = [
  '// KubeJS 配方脚本（由 KubeIE生成）',
  '// 目标环境：Minecraft 1.20.1 + Forge + KubeJS 6',
  '// 生效方式：游戏内执行 /kubejs reload server_scripts 或 /reload（无需重启游戏）',
  '//',
  '// 说明：本文件内的「删除配方」规则先执行、「新增配方」后执行，避免新配方被误删；',
  '//       文件为整体覆盖写入，请用配方队列一次性配置好所有配方。'
]

/** 网格字符表：最多 9 格，因此最多 9 个不同材料 */
const PATTERN_LETTERS = 'ABCDEFGHI'

/** JS 字符串字面量（物品 ID / 标签均由校验保证安全，这里仅做兜底转义） */
function quote(value: string): string {
  return `'${(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 产物写法：数量 > 1 时用 Item.of(id, count)，否则直接用字符串（字符串形式不支持数量） */
function stackLiteral(entry: RecipeAddEntry): string {
  if (entry.outputCount && entry.outputCount > 1) {
    return `Item.of(${quote(entry.output)}, ${entry.outputCount})`
  }
  return quote(entry.output)
}

interface ShapedLayout {
  /** 裁剪后的图案行 */
  rows: string[]
  /** 字符 → 材料（按首次出现顺序） */
  keys: { char: string; id: string }[]
}

/**
 * 由 3×3 材料网格生成 KubeJS 的字符图案：
 * 裁掉四周的空行空列（得到最小包围盒），材料按首次出现顺序分配 A/B/C…，
 * 同一物品出现在多格时共用同一个字符。
 */
export function shapedLayout(entry: RecipeAddEntry): ShapedLayout | null {
  const cells = entry.grid ?? []
  let minRow = RECIPE_GRID_SIZE
  let maxRow = -1
  let minColumn = RECIPE_GRID_SIZE
  let maxColumn = -1

  for (let index = 0; index < RECIPE_GRID_SIZE * RECIPE_GRID_SIZE; index += 1) {
    if (!(cells[index] ?? '').trim()) continue
    const row = Math.floor(index / RECIPE_GRID_SIZE)
    const column = index % RECIPE_GRID_SIZE
    minRow = Math.min(minRow, row)
    maxRow = Math.max(maxRow, row)
    minColumn = Math.min(minColumn, column)
    maxColumn = Math.max(maxColumn, column)
  }

  if (maxRow < 0) return null

  const assigned = new Map<string, string>()
  const rows: string[] = []

  for (let row = minRow; row <= maxRow; row += 1) {
    let line = ''
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const value = (cells[row * RECIPE_GRID_SIZE + column] ?? '').trim()
      if (!value) {
        line += ' '
        continue
      }
      let char = assigned.get(value)
      if (!char) {
        char = PATTERN_LETTERS[assigned.size] ?? '?'
        assigned.set(value, char)
      }
      line += char
    }
    rows.push(line)
  }

  return {
    rows,
    keys: [...assigned.entries()].map(([id, char]) => ({ char, id }))
  }
}

/** 删除规则：正则按字面量输出，其余按字符串 */
function removeValueLiteral(value: string): string {
  return isRecipeRegex(value) ? value.trim() : quote(value)
}

function generateRemove(entry: RecipeRemoveEntry): string[] {
  const info = recipeRemoveModeInfo(entry.mode)
  const suffix = entry.typeFilter ? `（限定配方类型 ${entry.typeFilter}）` : ''
  const fields = [`${entry.mode}: ${removeValueLiteral(entry.value)}`]
  if (entry.typeFilter) fields.push(`type: ${quote(entry.typeFilter)}`)
  return [`  // 删除配方：${info.label} —— ${entry.value}${suffix}`, `  event.remove({ ${fields.join(', ')} })`]
}

function generateAdd(entry: RecipeAddEntry): string[] {
  const info = recipeTypeInfo(entry.type)
  const countText = entry.outputCount && entry.outputCount > 1 ? ` ×${entry.outputCount}` : ''
  const lines = [`  // ${info.label}：${entry.output}${countText}`]

  switch (entry.type) {
    case 'shaped': {
      const layout = shapedLayout(entry)
      if (!layout) {
        lines.push('  // 材料格子为空，已跳过该配方')
        return lines
      }
      lines.push(`  event.shaped(${stackLiteral(entry)}, [`)
      layout.rows.forEach((row, index) => {
        lines.push(`    '${row}'${index < layout.rows.length - 1 ? ',' : ''}`)
      })
      lines.push('  ], {')
      layout.keys.forEach((key, index) => {
        lines.push(`    ${key.char}: ${quote(key.id)}${index < layout.keys.length - 1 ? ',' : ''}`)
      })
      lines.push('  })')
      return lines
    }

    case 'shapeless': {
      const items = entry.ingredients ?? []
      if (items.length === 0) {
        lines.push('  // 材料为空，已跳过该配方')
        return lines
      }
      lines.push(`  event.shapeless(${stackLiteral(entry)}, [`)
      items.forEach((item, index) => {
        lines.push(`    ${quote(item)}${index < items.length - 1 ? ',' : ''}`)
      })
      lines.push('  ])')
      return lines
    }

    case 'smithing': {
      lines.push('  event.smithing(')
      lines.push(`    ${stackLiteral(entry)},`)
      lines.push(`    ${quote(entry.template)},`)
      lines.push(`    ${quote(entry.base)},`)
      lines.push(`    ${quote(entry.addition)}`)
      lines.push('  )')
      return lines
    }

    default: {
      // 熔炉 / 高炉 / 烟熏炉 / 篝火 / 切石机：单一输入材料
      lines.push(`  event.${info.method}(${stackLiteral(entry)}, ${quote(entry.input)})`)
      return lines
    }
  }
}

/** 生成完整的配方脚本内容 */
export function generateRecipeScript(entries: RecipeEntry[]): string {
  const list = Array.isArray(entries) ? entries : []
  const removes = list.filter((entry): entry is RecipeRemoveEntry => entry?.kind === 'remove')
  const adds = list.filter((entry): entry is RecipeAddEntry => entry?.kind === 'add')

  const body: string[] = []

  if (removes.length > 0) {
    body.push(`  // ===== 删除配方（${removes.length} 条）：先做减法，避免自己的新配方被误删 =====`)
    removes.forEach((entry, index) => {
      if (index > 0) body.push('')
      body.push(...generateRemove(entry))
    })
  }

  if (adds.length > 0) {
    if (body.length > 0) body.push('')
    body.push(`  // ===== 新增配方（${adds.length} 条）=====`)
    adds.forEach((entry, index) => {
      if (index > 0) body.push('')
      body.push(...generateAdd(entry))
    })
  }

  if (body.length === 0) {
    body.push('  // 配方队列为空：配置好配方后这里会自动生成代码')
  }

  return [...HEADER, 'ServerEvents.recipes(event => {', ...body, '})', ''].join('\n')
}
