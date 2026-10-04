import { describe, expect, it } from 'vitest'
import { createEmptyCustomItem } from '../src/shared/customItems'
import {
  MAX_CUSTOM_RECORDS,
  buildCustomRecords,
  groupCustomRecords,
  sanitizeCustomRecords,
  trimCustomRecords
} from '../src/shared/customRecords'

/** 自定义物品记录：由一次写入构建、容错解析、上限裁剪、按脚本名分组 */

const AT = '2026-09-29T12:00:00.000Z'
const FILE = 'D:\\mc\\kubejs\\startup_scripts\\custom_items.js'

function build(items: ReturnType<typeof createEmptyCustomItem>[], at = AT) {
  return buildCustomRecords({
    items,
    scriptName: 'custom_items.js',
    filePath: FILE,
    at,
    backupPath: 'D:\\mc\\kubejs\\backup\\custom_items_20260929.js.bak'
  })
}

describe('自定义物品记录：构建', () => {
  it('每个物品一条记录，共享时间与备份路径', () => {
    const records = build([
      { ...createEmptyCustomItem('sword'), name: 'blade', displayName: '测试之剑' },
      { ...createEmptyCustomItem(), name: 'ruby' }
    ])

    expect(records).toHaveLength(2)
    expect(records[0].itemId).toBe('kubejs:blade')
    expect(records[0].displayName).toBe('测试之剑')
    expect(records[0].kindLabel).toBe('武器 · 剑')
    expect(records[0].scriptName).toBe('custom_items.js')
    expect(records[0].backupPath).toContain('.bak')
    expect(records[1].itemId).toBe('kubejs:ruby')
    expect(records[1].displayName).toBe('ruby')
    expect(records[0].id).not.toBe(records[1].id)
    expect(records[0].at).toBe(AT)
  })

  it('摘要标签包含类型与关键属性', () => {
    const records = build([
      { ...createEmptyCustomItem('pickaxe'), name: 'pick', tier: 'iron', digSpeed: 12 }
    ])
    expect(records[0].summary).toContain('工具 · 镐')
    expect(records[0].summary).toContain('kubejs:pick')
    expect(records[0].summary).toContain('等级 iron')
    expect(records[0].summary).toContain('挖掘速度 12')
  })

  it('空清单不产生记录', () => {
    expect(build([])).toEqual([])
  })
})

describe('自定义物品记录：容错解析', () => {
  it('过滤非法条目并补齐缺省字段', () => {
    const records = sanitizeCustomRecords([
      { at: AT, itemId: 'kubejs:a' },
      { at: AT },
      { itemId: 'kubejs:b' },
      null,
      'x',
      { at: AT, itemId: 'kubejs:c', scriptName: 'custom_items.js', summary: ['x', 1] }
    ])

    expect(records.map((record) => record.itemId)).toEqual(['kubejs:a', 'kubejs:c'])
    expect(records[0].displayName).toBe('kubejs:a')
    expect(records[0].summary).toEqual([])
    // 非法标签被丢弃，只保留字符串
    expect(records[1].summary).toEqual(['x'])
  })

  it('缺少脚本名时用文件路径的文件名兜底', () => {
    const records = sanitizeCustomRecords([{ at: AT, itemId: 'kubejs:a', filePath: FILE }])
    expect(records[0].scriptName).toBe('custom_items.js')
  })

  it('非数组输入返回空数组', () => {
    expect(sanitizeCustomRecords(null)).toEqual([])
    expect(sanitizeCustomRecords({ records: [] })).toEqual([])
  })

  it('同一 id 只保留第一条', () => {
    const records = sanitizeCustomRecords([
      { id: 'same', at: AT, itemId: 'kubejs:a' },
      { id: 'same', at: AT, itemId: 'kubejs:b' }
    ])
    expect(records).toHaveLength(1)
    expect(records[0].itemId).toBe('kubejs:a')
  })
})

describe('自定义物品记录：上限与分组', () => {
  it('上限裁剪保留最新在前的前 N 条', () => {
    const records = build([{ ...createEmptyCustomItem(), name: 'a' }])
    const many = Array.from({ length: MAX_CUSTOM_RECORDS + 20 }, (_, index) => ({
      ...records[0],
      id: `id-${index}`
    }))
    expect(trimCustomRecords(many)).toHaveLength(MAX_CUSTOM_RECORDS)
    expect(trimCustomRecords(many)[0].id).toBe('id-0')
    expect(trimCustomRecords(null as unknown as [])).toEqual([])
  })

  it('按脚本名称分组，组内按写入时间倒序', () => {
    const older = build([{ ...createEmptyCustomItem(), name: 'a' }], '2026-09-28T10:00:00.000Z')
    const newer = buildCustomRecords({
      items: [
        { ...createEmptyCustomItem(), name: 'b' },
        { ...createEmptyCustomItem(), name: 'c' }
      ],
      scriptName: 'other_items.js',
      filePath: 'D:\\mc\\kubejs\\startup_scripts\\other_items.js',
      at: '2026-09-29T10:00:00.000Z'
    })

    const groups = groupCustomRecords([...newer, ...older])
    expect(groups.map((group) => group.scriptName)).toEqual(['other_items.js', 'custom_items.js'])
    expect(groups[0].records).toHaveLength(2)
    expect(groups[0].latestAt).toBe('2026-09-29T10:00:00.000Z')
    expect(groups[1].records[0].itemId).toBe('kubejs:a')
  })

  it('空记录返回空分组', () => {
    expect(groupCustomRecords([])).toEqual([])
  })
})
