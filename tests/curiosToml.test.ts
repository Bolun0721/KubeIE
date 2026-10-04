import { describe, expect, it } from 'vitest'
import { createEmptySlotConfig, type CuriosSlotConfig } from '../src/shared/curios'
import { buildSlotsBlock, findSlotsAssignment, mergeCuriosToml, serializeSlotEntry } from '../src/shared/curiosToml'

/**
 * Curios 栏位配置（curios-common.toml）文本处理测试。
 * 依据官方语法：条目内部用英文分号分隔字段、条目之间用英文逗号分隔；
 * 写入策略：只替换未被注释的 slots 赋值，其余内容（含官方注释）原样保留。
 */

function slot(patch: Partial<CuriosSlotConfig> = {}): CuriosSlotConfig {
  return { ...createEmptySlotConfig(), ...patch }
}

describe('Curios 栏位条目序列化', () => {
  it('只写非空字段，字段用英文分号连接', () => {
    expect(serializeSlotEntry(slot({ id: 'ring', size: 8 }))).toBe('id=ring;size=8')
    expect(serializeSlotEntry(slot({ id: 'charm', size: 3, addCosmetic: true }))).toBe(
      'id=charm;size=3;add_cosmetic=true'
    )
  })

  it('完整字段顺序：id / size / operation / order / icon / add_cosmetic / use_native_gui / render_toggle / drop_rule', () => {
    const entry = serializeSlotEntry(
      slot({
        id: 'necklace',
        size: 2,
        operation: 'SET',
        order: 200,
        icon: 'minecraft:item/diamond',
        addCosmetic: true,
        useNativeGui: false,
        renderToggle: true,
        dropRule: 'ALWAYS_KEEP'
      })
    )
    expect(entry).toBe(
      'id=necklace;size=2;operation=SET;order=200;icon=minecraft:item/diamond;add_cosmetic=true;use_native_gui=false;render_toggle=true;drop_rule=ALWAYS_KEEP'
    )
  })

  it('slots 块：空数组、多条目、缩进两空格', () => {
    expect(buildSlotsBlock([])).toBe('slots = []')
    expect(buildSlotsBlock([slot({ id: 'ring', size: 8 }), slot({ id: 'charm', size: 3 })])).toBe(
      'slots = [\n  "id=ring;size=8",\n  "id=charm;size=3"\n]'
    )
  })
})

describe('Curios 配置合并', () => {
  it('官方默认文件（只有注释示例）→ 末尾追加且保留原注释', () => {
    const existing = [
      '#List of slots to create or modify.',
      '#See documentation for syntax: https://docs.illusivesoulworks.com/curios/configuration',
      '# slots = [""]'
    ].join('\n')

    const merged = mergeCuriosToml(existing, [slot({ id: 'ring', size: 8 })])

    expect(merged).toContain('#List of slots to create or modify.')
    expect(merged).toContain('# slots = [""]')
    expect(merged).toContain('slots = [\n  "id=ring;size=8"\n]')
    expect(merged.endsWith('\n')).toBe(true)
  })

  it('已有未注释的 slots 赋值 → 原地替换，其余内容保留', () => {
    const existing = [
      '# 官方注释保留',
      'slots = [',
      '  "id=ring;size=2"',
      ']',
      '',
      '# 后面的注释也要保留',
      'otherOption = true'
    ].join('\n')

    const merged = mergeCuriosToml(existing, [slot({ id: 'ring', size: 10 }), slot({ id: 'belt' })])

    expect(merged).toContain('# 官方注释保留')
    expect(merged).toContain('otherOption = true')
    expect(merged).toContain('# 后面的注释也要保留')
    expect(merged).toContain('"id=ring;size=10"')
    expect(merged).toContain('"id=belt;size=2"')
    expect(merged).not.toContain('"id=ring;size=2"')
    // 只出现一次 slots 赋值
    expect(merged.match(/^slots\s*=/gm)).toHaveLength(1)
  })

  it('单行 slots 赋值也能被替换', () => {
    const merged = mergeCuriosToml('slots = ["id=ring;size=1"]\n', [slot({ id: 'ring', size: 4 })])
    expect(merged).toBe('slots = [\n  "id=ring;size=4"\n]\n')
  })

  it('文件不存在（null）时生成带说明注释的新文件', () => {
    const merged = mergeCuriosToml(null, [slot({ id: 'charm', size: 3 })])
    expect(merged).toContain('#Curios 栏位配置')
    expect(merged).toContain('slots = [\n  "id=charm;size=3"\n]')
    expect(merged.endsWith('\n')).toBe(true)
  })

  it('CRLF 输入被规范化为 LF', () => {
    const merged = mergeCuriosToml('# a\r\nslots = ["id=ring;size=2"]\r\n', [slot({ id: 'ring', size: 5 })])
    expect(merged.includes('\r')).toBe(false)
  })

  it('注释里的 slots 不会被误判为赋值', () => {
    expect(findSlotsAssignment('# slots = [""]')).toBeNull()
    expect(findSlotsAssignment('slots = []')).not.toBeNull()
    expect(findSlotsAssignment('# a\nother = 1\n')).toBeNull()
  })

  it('字符串里的井号不会打断数组扫描', () => {
    const existing = 'slots = [\n  "id=ring;icon=minecraft:item/a#b"\n]\n'
    const merged = mergeCuriosToml(existing, [slot({ id: 'ring', size: 3 })])
    expect(merged).toBe('slots = [\n  "id=ring;size=3"\n]\n')
  })

  it('空 slots 也会写出 slots = []（便于用户清空栏位）', () => {
    expect(mergeCuriosToml('slots = ["id=ring;size=1"]\n', [])).toBe('slots = []\n')
  })
})
