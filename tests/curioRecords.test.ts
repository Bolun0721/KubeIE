import { describe, expect, it } from 'vitest'
import { createEmptyCurio, createUuid, type CustomCurioDef } from '../src/shared/curios'
import {
  MAX_CURIO_RECORDS,
  buildCurioRecords,
  groupCurioRecords,
  sanitizeCurioRecords,
  trimCurioRecords
} from '../src/shared/curioRecords'

/** 自定义饰品记录：由一次写入构建、容错解析、上限裁剪、按脚本名分组 */

const AT = '2026-09-30T10:00:00.000Z'
const FILE = 'D:\\mc\\kubejs\\startup_scripts\\curios_trinkets.js'

function curio(patch: Partial<CustomCurioDef> = {}): CustomCurioDef {
  return { ...createEmptyCurio(), name: 'fire_charm', ...patch }
}

function build(items: CustomCurioDef[], at = AT) {
  return buildCurioRecords({
    items,
    scriptName: 'curios_trinkets.js',
    filePath: FILE,
    at,
    backupPath: 'D:\\mc\\kubejs\\backup\\curios_trinkets_20260930.js.bak'
  })
}

describe('自定义饰品记录：构建', () => {
  it('每个饰品一条记录，含槽位中文名与摘要', () => {
    const records = build([
      curio({
        displayName: '火焰护符',
        slot: 'charm',
        attributes: [{ id: 'minecraft:generic.max_health', uuid: createUuid(), value: 6, operation: 'addition' }]
      }),
      curio({ name: 'lucky_ring', slot: 'ring' })
    ])

    expect(records).toHaveLength(2)
    expect(records[0].itemId).toBe('kubejs:fire_charm')
    expect(records[0].displayName).toBe('火焰护符')
    expect(records[0].slotLabel).toContain('饰品')
    expect(records[0].scriptName).toBe('curios_trinkets.js')
    expect(records[0].backupPath).toContain('.bak')
    expect(records[0].summary).toContain('槽位 charm')
    expect(records[0].summary).toContain('最大生命值 +6')
    expect(records[1].itemId).toBe('kubejs:lucky_ring')
    expect(records[1].displayName).toBe('lucky_ring')
    expect(records[0].id).not.toBe(records[1].id)
    expect(records[0].at).toBe(AT)
  })

  it('空清单不产生记录', () => {
    expect(build([])).toEqual([])
  })
})

describe('自定义饰品记录：容错解析', () => {
  it('过滤非法条目并补齐缺省字段', () => {
    const records = sanitizeCurioRecords([
      { at: AT, itemId: 'kubejs:a' },
      { at: AT },
      { itemId: 'kubejs:b' },
      null,
      'text',
      { at: AT, itemId: 'kubejs:c', scriptName: 'curios_trinkets.js', summary: ['x', 1] }
    ])

    expect(records.map((record) => record.itemId)).toEqual(['kubejs:a', 'kubejs:c'])
    expect(records[0].displayName).toBe('kubejs:a')
    expect(records[0].summary).toEqual([])
    expect(records[1].summary).toEqual(['x'])
  })

  it('缺少脚本名时用文件路径兜底', () => {
    const records = sanitizeCurioRecords([{ at: AT, itemId: 'kubejs:a', filePath: FILE }])
    expect(records[0].scriptName).toBe('curios_trinkets.js')
  })

  it('非数组输入返回空数组，同一 id 只保留第一条', () => {
    expect(sanitizeCurioRecords(null)).toEqual([])
    expect(sanitizeCurioRecords({ records: [] })).toEqual([])
    const records = sanitizeCurioRecords([
      { id: 'same', at: AT, itemId: 'kubejs:a' },
      { id: 'same', at: AT, itemId: 'kubejs:b' }
    ])
    expect(records).toHaveLength(1)
    expect(records[0].itemId).toBe('kubejs:a')
  })
})

describe('自定义饰品记录：上限与分组', () => {
  it('上限裁剪保留最新在前的前 N 条', () => {
    const base = build([curio()])[0]
    const many = Array.from({ length: MAX_CURIO_RECORDS + 10 }, (_, index) => ({ ...base, id: `id-${index}` }))
    expect(trimCurioRecords(many)).toHaveLength(MAX_CURIO_RECORDS)
    expect(trimCurioRecords(many)[0].id).toBe('id-0')
    expect(trimCurioRecords(null as unknown as [])).toEqual([])
  })

  it('按脚本名称分组，组内按写入时间倒序', () => {
    const older = build([curio({ name: 'old' })], '2026-09-29T10:00:00.000Z')
    const newer = buildCurioRecords({
      items: [curio({ name: 'n1' }), curio({ name: 'n2' })],
      scriptName: 'other_curios.js',
      filePath: 'D:\\mc\\kubejs\\startup_scripts\\other_curios.js',
      at: '2026-09-30T10:00:00.000Z'
    })

    const groups = groupCurioRecords([...newer, ...older])
    expect(groups.map((group) => group.scriptName)).toEqual(['other_curios.js', 'curios_trinkets.js'])
    expect(groups[0].records).toHaveLength(2)
    expect(groups[1].records[0].itemId).toBe('kubejs:old')
  })

  it('空记录返回空分组', () => {
    expect(groupCurioRecords([])).toEqual([])
  })
})
