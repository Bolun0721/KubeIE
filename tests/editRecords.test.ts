import { describe, expect, it } from 'vitest'
import {
  FOOD_CONFIG_FILE_NAME,
  MAX_EDIT_RECORDS,
  buildEditRecords,
  groupEditRecords,
  sanitizeEditRecords,
  trimEditRecords
} from '../src/shared/editRecords'
import type { EditRecord, ItemModification } from '../src/shared/types'

const AT = '2026-09-18T02:00:00.000Z'
const SCRIPT_FILE = 'C:/mc/kubejs/startup_scripts/item_modifications.js'
const FOOD_FILE = 'C:/mc/config/foodtweaker.json'

function record(partial: Partial<EditRecord> & { itemId: string; at: string }): EditRecord {
  return {
    id: `${partial.at}-${partial.itemId}-${partial.target ?? 'script'}`,
    scriptName: 'item_modifications.js',
    filePath: SCRIPT_FILE,
    target: 'script',
    displayName: partial.itemId,
    properties: {},
    ...partial
  }
}

describe('buildEditRecords - 由写入清单构建记录', () => {
  const modifications: ItemModification[] = [
    { itemId: 'minecraft:apple', properties: { maxStackSize: 16, foodProperties: { nutrition: 8 } } },
    { itemId: 'minecraft:diamond_sword', properties: { tier: { attackDamageBonus: 5 } } },
    { itemId: 'minecraft:bread', properties: { foodProperties: { nutrition: 3 } } }
  ]

  const nameOf = (itemId: string): string => (itemId === 'minecraft:apple' ? '苹果' : itemId)

  it('脚本目标只收录含脚本属性的物品，食物目标只收录含食物属性的物品', () => {
    const scriptRecords = buildEditRecords({
      target: 'script',
      filePath: SCRIPT_FILE,
      scriptName: 'item_modifications.js',
      modifications,
      at: AT,
      nameOf
    })
    expect(scriptRecords.map((item) => item.itemId)).toEqual([
      'minecraft:apple',
      'minecraft:diamond_sword'
    ])

    const foodRecords = buildEditRecords({
      target: 'food',
      filePath: FOOD_FILE,
      scriptName: FOOD_CONFIG_FILE_NAME,
      modifications,
      at: AT,
      nameOf
    })
    expect(foodRecords.map((item) => item.itemId)).toEqual(['minecraft:apple', 'minecraft:bread'])
    expect(foodRecords.every((item) => item.target === 'food')).toBe(true)
    expect(foodRecords.every((item) => item.scriptName === FOOD_CONFIG_FILE_NAME)).toBe(true)
  })

  it('同时含脚本与食物属性的物品分别记入两个目标文件', () => {
    const scriptRecords = buildEditRecords({
      target: 'script',
      filePath: SCRIPT_FILE,
      scriptName: 'item_modifications.js',
      modifications,
      at: AT,
      nameOf
    })
    const foodRecords = buildEditRecords({
      target: 'food',
      filePath: FOOD_FILE,
      scriptName: FOOD_CONFIG_FILE_NAME,
      modifications,
      at: AT,
      nameOf
    })
    expect(scriptRecords.some((item) => item.itemId === 'minecraft:apple')).toBe(true)
    expect(foodRecords.some((item) => item.itemId === 'minecraft:apple')).toBe(true)
  })

  it('属性经规范化，不保留未填写的空字段', () => {
    const records = buildEditRecords({
      target: 'script',
      filePath: SCRIPT_FILE,
      scriptName: 'item_modifications.js',
      modifications: [
        {
          itemId: 'minecraft:apple',
          properties: { maxStackSize: 16, burnTime: null, tier: { speed: null } }
        }
      ],
      at: AT,
      nameOf
    })
    expect(records[0].properties).toEqual({ maxStackSize: 16 })
  })

  it('展示名称由 nameOf 提供，未知物品回退为物品 ID', () => {
    const records = buildEditRecords({
      target: 'script',
      filePath: SCRIPT_FILE,
      scriptName: 'item_modifications.js',
      modifications,
      at: AT,
      nameOf: () => ''
    })
    expect(records[0].displayName).toBe('minecraft:apple')
  })

  it('空清单或非法输入返回空数组，同批次 id 不重复', () => {
    expect(
      buildEditRecords({
        target: 'script',
        filePath: SCRIPT_FILE,
        scriptName: 'item_modifications.js',
        modifications: [],
        at: AT,
        nameOf
      })
    ).toEqual([])

    const records = buildEditRecords({
      target: 'script',
      filePath: SCRIPT_FILE,
      scriptName: 'item_modifications.js',
      modifications,
      at: AT,
      nameOf
    })
    expect(new Set(records.map((item) => item.id)).size).toBe(records.length)
  })

  it('不含任何有效属性的物品不会产生记录', () => {
    const records = buildEditRecords({
      target: 'script',
      filePath: SCRIPT_FILE,
      scriptName: 'item_modifications.js',
      modifications: [{ itemId: 'minecraft:stone', properties: {} }],
      at: AT,
      nameOf
    })
    expect(records).toEqual([])
  })
})

describe('sanitizeEditRecords - 反序列化容错', () => {
  const sample = record({ itemId: 'minecraft:apple', at: AT, displayName: '苹果' })

  it('非数组输入返回空数组', () => {
    expect(sanitizeEditRecords(null)).toEqual([])
    expect(sanitizeEditRecords(undefined)).toEqual([])
    expect(sanitizeEditRecords({ itemId: 'minecraft:apple' })).toEqual([])
  })

  it('过滤物品 ID 非法 / 目标类型非法 / 缺少写入时间的条目', () => {
    const result = sanitizeEditRecords([
      sample,
      null,
      'not-an-object',
      { itemId: 'BAD ID', at: AT, target: 'script' },
      { itemId: 'minecraft:stone', at: AT, target: 'unknown' },
      { itemId: 'minecraft:stone', target: 'script' }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].itemId).toBe('minecraft:apple')
  })

  it('补全缺失字段并清理属性中的空值', () => {
    const result = sanitizeEditRecords([
      {
        itemId: 'minecraft:stone',
        at: AT,
        target: 'food',
        properties: { maxStackSize: null, burnTime: 200 }
      }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].displayName).toBe('minecraft:stone')
    expect(result[0].scriptName).toBe(FOOD_CONFIG_FILE_NAME)
    expect(result[0].properties).toEqual({ burnTime: 200 })
    expect(result[0].id).toBe(`${AT}|food|minecraft:stone`)
  })

  it('同一 id 只保留第一条', () => {
    expect(sanitizeEditRecords([sample, { ...sample, displayName: '重复' }])).toHaveLength(1)
  })
})

describe('trimEditRecords - 上限裁剪', () => {
  const records = Array.from({ length: 12 }, (_value, index) =>
    record({ itemId: `minecraft:item_${index}`, at: `2026-09-18T02:00:${String(index).padStart(2, '0')}.000Z` })
  )

  it('保留最新的前 N 条', () => {
    expect(trimEditRecords(records, 5).map((item) => item.itemId)).toEqual(
      records.slice(0, 5).map((item) => item.itemId)
    )
    expect(trimEditRecords(records, 0)).toEqual([])
  })

  it('默认上限为 MAX_EDIT_RECORDS', () => {
    const many = Array.from({ length: MAX_EDIT_RECORDS + 20 }, (_value, index) =>
      record({ itemId: `minecraft:item_${index}`, at: AT })
    )
    expect(trimEditRecords(many)).toHaveLength(MAX_EDIT_RECORDS)
  })
})

describe('groupEditRecords - 按所属脚本名称分组', () => {
  it('按脚本名称分组并携带目标类型与文件路径', () => {
    const groups = groupEditRecords([
      record({ itemId: 'minecraft:apple', at: '2026-09-18T02:00:00.000Z' }),
      record({
        itemId: 'minecraft:bread',
        at: '2026-09-18T04:00:00.000Z',
        scriptName: FOOD_CONFIG_FILE_NAME,
        target: 'food',
        filePath: FOOD_FILE
      })
    ])

    expect(groups).toHaveLength(2)
    const food = groups.find((group) => group.scriptName === FOOD_CONFIG_FILE_NAME)
    expect(food?.target).toBe('food')
    expect(food?.filePath).toBe(FOOD_FILE)
    expect(food?.records).toHaveLength(1)
  })

  it('组内与组间均按写入时间倒序', () => {
    const groups = groupEditRecords([
      record({ itemId: 'minecraft:apple', at: '2026-09-18T02:00:00.000Z' }),
      record({ itemId: 'minecraft:bread', at: '2026-09-18T03:00:00.000Z' }),
      record({
        itemId: 'minecraft:cake',
        at: '2026-09-18T04:00:00.000Z',
        scriptName: FOOD_CONFIG_FILE_NAME,
        target: 'food',
        filePath: FOOD_FILE
      })
    ])

    expect(groups.map((group) => group.scriptName)).toEqual([
      FOOD_CONFIG_FILE_NAME,
      'item_modifications.js'
    ])
    expect(groups[0].latestAt).toBe('2026-09-18T04:00:00.000Z')
    expect(groups[1].latestAt).toBe('2026-09-18T03:00:00.000Z')
    expect(groups[1].records.map((item) => item.itemId)).toEqual([
      'minecraft:bread',
      'minecraft:apple'
    ])
  })

  it('脚本名称为空时回退到文件路径，二者都为空时归入「未命名」', () => {
    expect(
      groupEditRecords([record({ itemId: 'minecraft:stone', at: AT, scriptName: '', filePath: FOOD_FILE })])[0]
        .scriptName
    ).toBe(FOOD_FILE)

    expect(
      groupEditRecords([record({ itemId: 'minecraft:stone', at: AT, scriptName: '', filePath: '' })])[0]
        .scriptName
    ).toBe('未命名')
  })

  it('空数组返回空分组', () => {
    expect(groupEditRecords([])).toEqual([])
  })
})
