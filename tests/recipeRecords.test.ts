import { describe, expect, it } from 'vitest'
import {
  MAX_RECIPE_RECORDS,
  buildRecipeRecords,
  groupRecipeRecords,
  sanitizeRecipeRecords,
  trimRecipeRecords
} from '../src/shared/recipeRecords'
import { addDraftToEntry, createEmptyRecipeAddDraft, createEmptyRecipeRemoveDraft, removeDraftToEntry } from '../src/shared/recipes'
import type { RecipeEntry, RecipeRecord } from '../src/shared/types'

const AT = '2026-09-20T02:00:00.000Z'
const FILE = 'D:/mc/kubejs/server_scripts/recipes.js'

function addEntry(output: string): RecipeEntry {
  const draft = createEmptyRecipeAddDraft('shapeless')
  draft.output = output
  draft.ingredients = ['minecraft:stick']
  return addDraftToEntry(draft, `k-${output}`)
}

function removeEntry(value: string): RecipeEntry {
  return removeDraftToEntry({ ...createEmptyRecipeRemoveDraft(), value }, `r-${value}`)
}

function record(partial: Partial<RecipeRecord> & { id: string; at: string; entry: RecipeEntry }): RecipeRecord {
  return {
    scriptName: 'recipes.js',
    filePath: FILE,
    ...partial
  }
}

describe('buildRecipeRecords - 由写入清单构建记录', () => {
  it('每条配方生成一条记录，共享写入时间与备份路径', () => {
    const entries = [addEntry('minecraft:stone_button'), removeEntry('minecraft:iron_pickaxe')]
    const records = buildRecipeRecords({
      entries,
      scriptName: 'recipes.js',
      filePath: FILE,
      at: AT,
      backupPath: 'D:/mc/kubejs/backup/recipes_20260920-100000.js.bak'
    })

    expect(records).toHaveLength(2)
    expect(records[0].entry).toBe(entries[0])
    expect(records.every((item) => item.at === AT)).toBe(true)
    expect(records.every((item) => item.scriptName === 'recipes.js')).toBe(true)
    expect(records.every((item) => item.filePath === FILE)).toBe(true)
    expect(records[0].backupPath).toContain('recipes_20260920-100000.js.bak')
    expect(new Set(records.map((item) => item.id)).size).toBe(2)
  })

  it('空清单返回空数组', () => {
    expect(
      buildRecipeRecords({ entries: [], scriptName: 'recipes.js', filePath: FILE, at: AT })
    ).toEqual([])
  })
})

describe('sanitizeRecipeRecords - 反序列化容错', () => {
  const sample = buildRecipeRecords({
    entries: [addEntry('minecraft:stone_button')],
    scriptName: 'recipes.js',
    filePath: FILE,
    at: AT
  })[0]

  it('非数组输入返回空数组', () => {
    expect(sanitizeRecipeRecords(null)).toEqual([])
    expect(sanitizeRecipeRecords({ records: [sample] })).toEqual([])
  })

  it('过滤缺少时间 / 条目非法 / 条目类型非法的记录', () => {
    const result = sanitizeRecipeRecords([
      sample,
      null,
      'not-an-object',
      { scriptName: 'recipes.js', entry: sample.entry },
      { at: AT, scriptName: 'recipes.js', entry: {} },
      { at: AT, scriptName: 'recipes.js', entry: { kind: 'unknown' } }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(sample.id)
  })

  it('补全脚本名称与 id，并保留备份路径', () => {
    const result = sanitizeRecipeRecords([
      { at: AT, filePath: FILE, backupPath: 'D:/bak.js.bak', entry: addEntry('minecraft:stick') }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].scriptName).toBe('recipes.js')
    expect(result[0].id).toBe(`${AT}|${FILE}|0`)
    expect(result[0].backupPath).toBe('D:/bak.js.bak')
  })

  it('脚本名称与文件路径都缺失时归入「未命名」', () => {
    const result = sanitizeRecipeRecords([{ at: AT, entry: removeEntry('minecraft:stick') }])
    expect(result[0].scriptName).toBe('未命名')
  })

  it('条目内容经规范化（补齐网格长度、去掉空格）', () => {
    const result = sanitizeRecipeRecords([
      {
        at: AT,
        scriptName: 'recipes.js',
        filePath: FILE,
        entry: {
          kind: 'add',
          type: 'shaped',
          output: ' minecraft:chest ',
          grid: [' minecraft:iron_ingot ', '', '', 'minecraft:stick'],
          ingredients: []
        }
      }
    ])
    expect(result[0].entry.kind).toBe('add')
    const entry = result[0].entry
    if (entry.kind !== 'add') throw new Error('应为新建配方')
    expect(entry.output).toBe('minecraft:chest')
    expect(entry.grid).toHaveLength(9)
    expect(entry.grid[0]).toBe('minecraft:iron_ingot')
    expect(entry.grid[3]).toBe('minecraft:stick')
    expect(entry.ingredients).toEqual([])
  })

  it('同一 id 只保留第一条', () => {
    expect(sanitizeRecipeRecords([sample, { ...sample }])).toHaveLength(1)
  })
})

describe('trimRecipeRecords - 上限裁剪', () => {
  it('保留最新的前 N 条', () => {
    const records = Array.from({ length: 6 }, (_value, index) =>
      record({ id: `r${index}`, at: AT, entry: addEntry(`minecraft:item_${index}`) })
    )
    expect(trimRecipeRecords(records, 3).map((item) => item.id)).toEqual(['r0', 'r1', 'r2'])
    expect(trimRecipeRecords(records, 0)).toEqual([])
  })

  it('默认上限为 MAX_RECIPE_RECORDS', () => {
    const many = Array.from({ length: MAX_RECIPE_RECORDS + 10 }, (_value, index) =>
      record({ id: `r${index}`, at: AT, entry: addEntry('minecraft:stick') })
    )
    expect(trimRecipeRecords(many)).toHaveLength(MAX_RECIPE_RECORDS)
  })
})

describe('groupRecipeRecords - 按所属脚本名称分组', () => {
  it('按脚本名称分组并携带文件路径与最新时间', () => {
    const groups = groupRecipeRecords([
      record({ id: 'a', at: '2026-09-20T02:00:00.000Z', entry: addEntry('minecraft:stick') }),
      record({
        id: 'b',
        at: '2026-09-20T04:00:00.000Z',
        scriptName: 'my_recipes.js',
        filePath: 'D:/mc/kubejs/server_scripts/my_recipes.js',
        entry: removeEntry('minecraft:apple')
      })
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].scriptName).toBe('my_recipes.js')
    expect(groups[0].filePath).toBe('D:/mc/kubejs/server_scripts/my_recipes.js')
    expect(groups[0].latestAt).toBe('2026-09-20T04:00:00.000Z')
    expect(groups[1].scriptName).toBe('recipes.js')
  })

  it('组内与组间均按写入时间倒序', () => {
    const groups = groupRecipeRecords([
      record({ id: 'a', at: '2026-09-20T02:00:00.000Z', entry: addEntry('minecraft:a') }),
      record({ id: 'b', at: '2026-09-20T03:00:00.000Z', entry: addEntry('minecraft:b') }),
      record({
        id: 'c',
        at: '2026-09-20T05:00:00.000Z',
        scriptName: 'other.js',
        filePath: 'D:/other.js',
        entry: addEntry('minecraft:c')
      })
    ])

    expect(groups.map((group) => group.scriptName)).toEqual(['other.js', 'recipes.js'])
    expect(groups[1].records.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('空数组返回空分组', () => {
    expect(groupRecipeRecords([])).toEqual([])
  })
})
