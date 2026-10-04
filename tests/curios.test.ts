import { describe, expect, it } from 'vitest'
import {
  CURIO_ITEM_MOD,
  CURIOS_SLOTS,
  CURIOS_SLOT_IDS,
  MAX_CURIO_ATTRIBUTES,
  createEmptyAttribute,
  createEmptyCurio,
  createEmptyCurioLibrary,
  createEmptyEffect,
  createEmptySlotConfig,
  createUuid,
  curioId,
  curioToEntry,
  curiosSlotLabel,
  curiosTag,
  curiosToEntries,
  normalizeCurioLibrary,
  normalizeSlotList,
  removeCurioById,
  removeSlotById,
  summarizeCurio,
  upsertCurio,
  upsertSlot,
  validateCurio,
  validateCurioLibrary,
  validateSlotConfig,
  type CustomCurioDef,
  type CurioLibrary
} from '../src/shared/curios'

/**
 * 自定义饰品（Curios）共享层测试：
 * 槽位表、工厂与 ID、规范化、校验（含 UUID 唯一 / 效果间隔）、摘要与物品列表映射。
 */

const EMPTY: CurioLibrary = createEmptyCurioLibrary()

function curioWith(patch: Partial<CustomCurioDef> = {}): CustomCurioDef {
  return { ...createEmptyCurio(), name: 'test_charm', ...patch }
}

describe('Curios 槽位与命名', () => {
  it('常用槽位齐备且包含教程列出的 9 个', () => {
    for (const id of ['charm', 'ring', 'necklace', 'belt', 'head', 'back', 'body', 'hands', 'feet']) {
      expect(CURIOS_SLOT_IDS).toContain(id)
    }
    expect(CURIOS_SLOTS.every((slot) => !!slot.label)).toBe(true)
  })

  it('槽位标签为 curios:<id>，中文名可查', () => {
    expect(curiosTag('ring')).toBe('curios:ring')
    expect(curiosSlotLabel('ring')).toContain('戒指')
    expect(curiosSlotLabel('unknown_slot')).toBe('unknown_slot')
  })

  it('createUuid 生成合法且不重复的 UUID', () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    const list = Array.from({ length: 20 }, () => createUuid())
    expect(list.every((uuid) => pattern.test(uuid))).toBe(true)
    expect(new Set(list).size).toBe(list.length)
  })

  it('默认命名空间为 kubejs，归属于 KubeCurios 模组', () => {
    expect(createEmptyCurio().namespace).toBe('kubejs')
    expect(curioId({ namespace: 'kubejs', name: 'fire_charm' })).toBe('kubejs:fire_charm')
    expect(curioId({ namespace: '', name: 'x' })).toBe('kubejs:x')
    expect(curioToEntry(curioWith()).mod).toBe(CURIO_ITEM_MOD)
  })

  it('工厂默认值可直接使用（槽位 charm、可佩戴可脱下、堆叠 1）', () => {
    const def = createEmptyCurio()
    expect(def.slot).toBe('charm')
    expect(def.canEquip).toBe(true)
    expect(def.canUnequip).toBe(true)
    expect(def.maxStackSize).toBe(1)
    expect(def.attributes).toEqual([])
    expect(def.effects).toEqual([])
    expect(def.effectIntervalSeconds).toBe(1)
  })

  it('属性 / 效果工厂给出可用默认值', () => {
    const attribute = createEmptyAttribute()
    expect(attribute.id).toBe('minecraft:generic.max_health')
    expect(attribute.operation).toBe('addition')
    expect(attribute.uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(createEmptyEffect().id).toBe('minecraft:night_vision')
    expect(createEmptySlotConfig().id).toBe('ring')
  })
})

describe('Curios 规范化', () => {
  it('丢弃非法项并按 ID 去重', () => {
    const library = normalizeCurioLibrary({
      items: [
        { name: 'a', slot: 'ring' },
        { name: 'a', slot: 'charm' },
        { name: '' },
        { name: 'b' },
        null
      ],
      created: [{ name: 'c', slot: 'belt' }],
      slots: [
        { id: 'ring', size: 4 },
        { id: 'ring', size: 8 },
        { id: 'BAD ID' }
      ]
    })

    expect(library.items.map((item) => item.name)).toEqual(['a', 'b'])
    expect(library.items[0].slot).toBe('ring')
    expect(library.created.map((item) => item.name)).toEqual(['c'])
    expect(library.slots.map((slot) => slot.id)).toEqual(['ring'])
    expect(library.slots[0].size).toBe(4)
  })

  it('旧文件缺少 created 时回退为 items（应用修改前的历史数据不丢）', () => {
    const library = normalizeCurioLibrary({ items: [{ name: 'legacy', slot: 'charm' }] })
    expect(library.created.map((item) => item.name)).toEqual(['legacy'])
  })

  it('非法属性 / 效果被丢弃，UUID 非法时自动补一个新的', () => {
    const def = normalizeCurioLibrary({
      items: [
        {
          name: 'x',
          slot: 'ring',
          attributes: [{ id: 'BAD ID', value: 1 }, { id: 'minecraft:generic.armor', uuid: 'oops', value: 3 }],
          effects: [{ id: 'BAD' }, { id: 'minecraft:speed', durationSeconds: 5, amplifier: 2 }]
        }
      ]
    }).items[0]

    expect(def.attributes).toHaveLength(1)
    expect(def.attributes[0].id).toBe('minecraft:generic.armor')
    expect(def.attributes[0].uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(def.effects).toHaveLength(1)
    expect(def.effects[0].amplifier).toBe(2)
  })

  it('属性与效果数量受上限约束', () => {
    const def = normalizeCurioLibrary({
      items: [
        {
          name: 'x',
          slot: 'ring',
          attributes: Array.from({ length: MAX_CURIO_ATTRIBUTES + 5 }, () => ({
            id: 'minecraft:generic.armor',
            value: 1
          })),
          effects: Array.from({ length: 10 }, () => ({ id: 'minecraft:speed' }))
        }
      ]
    }).items[0]
    expect(def.attributes).toHaveLength(MAX_CURIO_ATTRIBUTES)
    expect(def.effects).toHaveLength(4)
  })

  it('normalizeSlotList 过滤非法栏位', () => {
    expect(normalizeSlotList([{ id: 'ring' }, { id: 'ring' }, { id: 'A B' }, null])).toHaveLength(1)
    expect(normalizeSlotList(null)).toEqual([])
  })
})

describe('Curios 校验', () => {
  it('ID / 命名空间必填且不允许 minecraft', () => {
    expect(validateCurio(curioWith({ name: '' })).errors.join()).toContain('物品 ID 不能为空')
    expect(validateCurio(curioWith({ name: 'My Charm' })).errors.join()).toContain('只能包含小写字母')
    expect(validateCurio(curioWith({ namespace: 'minecraft' })).errors.join()).toContain(
      '不能使用 minecraft 命名空间'
    )
  })

  it('库内不允许重名（编辑自身时排除自己）', () => {
    const def = curioWith({ name: 'dup' })
    const library: CurioLibrary = { ...EMPTY, items: [def, curioWith({ name: 'other' })] }
    expect(validateCurio(def, library, 0).errors).toHaveLength(0)
    expect(validateCurio(def, library, -1).errors.join()).toContain('物品 ID 已存在')
  })

  it('槽位必填，不在常用表只给提示', () => {
    expect(validateCurio(curioWith({ slot: '' })).errors.join()).toContain('请选择饰品槽位')
    expect(validateCurio(curioWith({ slot: 'unknown' })).errors).toHaveLength(0)
    expect(validateCurio(curioWith({ slot: 'unknown' })).warnings.join()).toContain('不在常用槽位表中')
  })

  it('未填贴图只提示，贴图格式非法报错', () => {
    expect(validateCurio(curioWith()).warnings.join()).toContain('未填写贴图')
    expect(validateCurio(curioWith({ texture: 'BAD' })).errors.join()).toContain('贴图路径格式非法')
  })

  it('堆叠数范围受限，堆叠大于 1 给出提示', () => {
    expect(validateCurio(curioWith({ maxStackSize: 99 })).errors.join()).toContain('1 ~ 64')
    expect(validateCurio(curioWith({ maxStackSize: 4 })).warnings.join()).toContain('通常不可堆叠')
  })

  it('属性 UUID 重复报错（教程：重复会导致属性叠加异常）', () => {
    const uuid = createUuid()
    const result = validateCurio(
      curioWith({
        attributes: [
          { id: 'minecraft:generic.armor', uuid, value: 2, operation: 'addition' },
          { id: 'minecraft:generic.max_health', uuid, value: 4, operation: 'addition' }
        ]
      })
    )
    expect(result.errors.join()).toContain('属性 UUID 重复')
  })

  it('属性 ID 非法报错', () => {
    const result = validateCurio(
      curioWith({ attributes: [{ id: 'BAD', uuid: createUuid(), value: 1, operation: 'addition' }] })
    )
    expect(result.errors.join()).toContain('属性 ID 非法')
  })

  it('效果字段校验：ID / 秒数 / 等级', () => {
    const bad = validateCurio(
      curioWith({ effects: [{ id: 'BAD', durationSeconds: 0, amplifier: 99 }] })
    )
    expect(bad.errors.join()).toContain('效果 ID 非法')
    expect(bad.errors.join()).toContain('持续时间必须是大于 0 的秒数')
    expect(bad.errors.join()).toContain('等级必须是 0 ~ 9 的整数')
  })

  it('施加间隔过短给提示；持续时间小于间隔会闪断', () => {
    const fast = validateCurio(
      curioWith({ effectIntervalSeconds: 0.25, effects: [{ id: 'minecraft:speed', durationSeconds: 5, amplifier: 0 }] })
    )
    expect(fast.warnings.join()).toContain('过短')

    const flicker = validateCurio(
      curioWith({ effectIntervalSeconds: 10, effects: [{ id: 'minecraft:speed', durationSeconds: 3, amplifier: 0 }] })
    )
    expect(flicker.warnings.join()).toContain('闪断')
  })

  it('整库校验：空库报错并带归属前缀', () => {
    expect(validateCurioLibrary(EMPTY).errors.join()).toContain('饰品库为空')

    const library: CurioLibrary = {
      ...EMPTY,
      items: [curioWith({ name: 'ok' }), curioWith({ name: 'bad', slot: '' })]
    }
    const result = validateCurioLibrary(library)
    expect(result.errors.join()).toContain('第 2 个饰品（bad）')
  })
})

describe('Curios 栏位配置校验', () => {
  it('id 必填且不允许重复', () => {
    expect(validateSlotConfig({ ...createEmptySlotConfig(), id: '' }).errors.join()).toContain(
      '栏位 ID 不能为空'
    )
    const library: CurioLibrary = { ...EMPTY, slots: [createEmptySlotConfig(), { ...createEmptySlotConfig() }] }
    const result = validateSlotConfig({ ...createEmptySlotConfig() }, library, -1)
    expect(result.errors.join()).toContain('栏位已存在')
  })

  it('数量范围 0 ~ 48，过大给提示（Curios 5.9 单页上限）', () => {
    expect(validateSlotConfig({ ...createEmptySlotConfig(), size: 99 }).errors.join()).toContain('0 ~ 48')
    expect(validateSlotConfig({ ...createEmptySlotConfig(), size: 20 }).warnings.join()).toContain('数量过大')
  })

  it('图标 / 掉落规则 / 调整方式非法时报错', () => {
    expect(validateSlotConfig({ ...createEmptySlotConfig(), icon: 'BAD' }).errors.join()).toContain('图标路径非法')
    expect(
      validateSlotConfig({ ...createEmptySlotConfig(), dropRule: 'NOPE' as unknown as 'DEFAULT' }).errors.join()
    ).toContain('死亡掉落规则非法')
  })
})

describe('Curios 摘要与列表映射', () => {
  it('摘要包含槽位、注册名与关键属性', () => {
    const tags = summarizeCurio(
      curioWith({
        displayName: '火焰护符',
        rarity: 'UNCOMMON',
        attributes: [{ id: 'minecraft:generic.max_health', uuid: createUuid(), value: 6, operation: 'addition' }],
        effects: [{ id: 'minecraft:night_vision', durationSeconds: 10, amplifier: 0 }],
        equipMessage: '已佩戴'
      })
    )
    expect(tags).toContain('槽位 charm')
    expect(tags).toContain('kubejs:test_charm')
    expect(tags).toContain('火焰护符')
    expect(tags).toContain('稀有度 uncommon')
    expect(tags).toContain('最大生命值 +6')
    expect(tags.some((tag) => tag.includes('夜视'))).toBe(true)
    expect(tags).toContain('佩戴提示')
  })

  it('映射为 KubeCurios 模组条目，装备分类', () => {
    const entry = curioToEntry(curioWith({ displayName: '火焰护符' }))
    expect(entry.id).toBe('kubejs:test_charm')
    expect(entry.name).toBe('火焰护符')
    expect(entry.mod).toBe(CURIO_ITEM_MOD)
    expect(entry.category).toBe('armor')
    expect(entry.toolLike).toBe(false)
  })

  it('批量映射以「已创建饰品」为准（应用修改后才进列表）', () => {
    const a = curioWith({ name: 'a' })
    const b = curioWith({ name: 'b' })
    const library: CurioLibrary = { ...EMPTY, items: [a, b] }
    // 未应用修改：created 为空 → 列表里还没有
    expect(curiosToEntries(library)).toEqual([])
    expect(curiosToEntries({ ...library, created: [a] }).map((entry) => entry.id)).toEqual(['kubejs:a'])
  })

  it('upsertCurio / removeCurioById 不修改入参', () => {
    const a = curioWith({ name: 'a' })
    const list = upsertCurio([], a)
    expect(list).toHaveLength(1)
    const updated = upsertCurio(list, { ...a, displayName: '新名字' })
    expect(updated).toHaveLength(1)
    expect(updated[0].displayName).toBe('新名字')

    const source = [a, curioWith({ name: 'b' })]
    expect(removeCurioById(source, 'kubejs:a').map((item) => item.name)).toEqual(['b'])
    expect(source).toHaveLength(2)
  })

  it('栏位 upsert / remove 同样不修改入参', () => {
    const ring = createEmptySlotConfig()
    const list = upsertSlot([], ring)
    expect(list).toHaveLength(1)
    expect(upsertSlot(list, { ...ring, size: 8 })[0].size).toBe(8)
    expect(removeSlotById(list, 'ring')).toEqual([])
    expect(list).toHaveLength(1)
  })
})
