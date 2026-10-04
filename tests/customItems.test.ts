import { describe, expect, it } from 'vitest'
import {
  ARMOR_FORGE_TAGS,
  ARMOR_TIER_PRESETS,
  CUSTOM_ITEM_KINDS,
  CUSTOM_ITEM_MOD,
  CUSTOM_KIND_GROUPS,
  DEFAULT_CUSTOM_NAMESPACE,
  VANILLA_ARMOR_TIERS,
  VANILLA_TOOL_TIERS,
  createEmptyCustomItem,
  createEmptyCustomLibrary,
  createEmptyFoodEffect,
  customItemId,
  customItemKindInfo,
  customItemToEntry,
  customItemsToEntries,
  normalizeCustomLibrary,
  removeCustomItemById,
  summarizeCustomItem,
  upsertItemInList,
  validateArmorTier,
  validateCustomItem,
  validateCustomLibrary,
  validateToolTier
} from '../src/shared/customItems'
import type { CustomItemDef, CustomItemLibrary } from '../src/shared/customItems'

const EMPTY: CustomItemLibrary = createEmptyCustomLibrary()

function libraryWith(item: Partial<CustomItemDef>): CustomItemLibrary {
  const def = { ...createEmptyCustomItem('basic'), name: 'x', ...item } as CustomItemDef
  return { ...EMPTY, items: [def], created: [{ ...def }] }
}

describe('自定义物品类型元信息', () => {
  it('包含武器 / 工具 / 盔甲 / 食物，且不含方块、唱片、附魔书', () => {
    const ids = CUSTOM_ITEM_KINDS.map((info) => info.id)
    expect(ids).toEqual([
      'basic',
      'sword',
      'pickaxe',
      'axe',
      'shovel',
      'hoe',
      'shears',
      'helmet',
      'chestplate',
      'leggings',
      'boots',
      'food'
    ])
    expect(ids).not.toContain('block')
    expect(ids).not.toContain('record')
    expect(ids).not.toContain('smithing_template')
  })

  it('食物使用 basic 作为注册类型（KubeJS 没有 food 类型）', () => {
    expect(customItemKindInfo('food').registryType).toBe('basic')
    expect(customItemKindInfo('food').food).toBe(true)
  })

  it('盔甲使用 helmet / chestplate / leggings / boots 作为注册类型', () => {
    expect(customItemKindInfo('helmet').registryType).toBe('helmet')
    expect(customItemKindInfo('chestplate').registryType).toBe('chestplate')
    expect(customItemKindInfo('leggings').registryType).toBe('leggings')
    expect(customItemKindInfo('boots').registryType).toBe('boots')
  })

  it('只有武器与镐斧锹锄支持工具等级，剪刀不支持', () => {
    expect(customItemKindInfo('sword').useToolTier).toBe(true)
    expect(customItemKindInfo('pickaxe').useToolTier).toBe(true)
    expect(customItemKindInfo('shears').useToolTier).toBeFalsy()
    expect(customItemKindInfo('basic').useToolTier).toBeFalsy()
  })

  it('镐斧锹锄属于挖掘类工具，剑不是', () => {
    for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe'] as const) {
      expect(customItemKindInfo(kind).diggerLike).toBe(true)
    }
    expect(customItemKindInfo('sword').diggerLike).toBeFalsy()
  })

  it('分组选项覆盖全部类型', () => {
    const grouped = CUSTOM_KIND_GROUPS.flatMap((group) => group.options.map((info) => info.id))
    expect(grouped.sort()).toEqual(CUSTOM_ITEM_KINDS.map((info) => info.id).sort())
  })

  it('盔甲标签与原版等级表齐备', () => {
    expect(ARMOR_FORGE_TAGS.helmet).toBe('forge:armors/helmets')
    expect(ARMOR_FORGE_TAGS.boots).toBe('forge:armors/boots')
    expect(VANILLA_TOOL_TIERS).toContain('netherite')
    expect(VANILLA_ARMOR_TIERS).toContain('turtle')
    expect(ARMOR_TIER_PRESETS.netherite.slotProtections).toHaveLength(4)
  })
})

describe('自定义物品工厂与 ID', () => {
  it('默认命名空间为 kubejs', () => {
    const def = createEmptyCustomItem('sword')
    expect(def.namespace).toBe(DEFAULT_CUSTOM_NAMESPACE)
    expect(def.tier).toBe('iron')
    expect(customItemId({ namespace: '', name: 'my_sword' })).toBe('kubejs:my_sword')
  })

  it('按类型预置字段：食物带 food，盔甲带 armorTier，普通物品两者都没有', () => {
    expect(createEmptyCustomItem('food').food).not.toBeNull()
    expect(createEmptyCustomItem('helmet').armorTier).toBe('iron')
    expect(createEmptyCustomItem('basic').tier).toBeUndefined()
    expect(createEmptyCustomItem('basic').food).toBeUndefined()
  })

  it('食物效果默认值可直接使用', () => {
    const effect = createEmptyFoodEffect()
    expect(effect.id).toBe('minecraft:speed')
    expect(effect.probability).toBe(1)
  })
})

describe('自定义物品库规范化', () => {
  it('丢弃非法条目并补齐缺省字段', () => {
    const library = normalizeCustomLibrary({
      items: [{ name: 'ok', kind: 'sword' }, { kind: 'sword' }, null, 'x'],
      toolTiers: [{ name: 't1' }, { name: '' }],
      armorTiers: [{ name: 'a1', slotProtections: [1, 2, 3, 4] }]
    })
    expect(library.items).toHaveLength(1)
    expect(library.items[0].namespace).toBe(DEFAULT_CUSTOM_NAMESPACE)
    expect(library.toolTiers).toHaveLength(1)
    expect(library.armorTiers[0].slotProtections).toEqual([1, 2, 3, 4])
  })

  it('非法类型回退 basic，非法稀有度回退 null', () => {
    const library = normalizeCustomLibrary({
      items: [{ name: 'a', kind: 'not-a-kind', rarity: 'LEGENDARY' }]
    })
    expect(library.items[0].kind).toBe('basic')
    expect(library.items[0].rarity).toBeNull()
  })

  it('护甲值长度不为 4 时置空（避免生成错误脚本）', () => {
    const library = normalizeCustomLibrary({ armorTiers: [{ name: 'a', slotProtections: [1, 2] }] })
    expect(library.armorTiers[0].slotProtections).toBeNull()
  })

  it('非对象输入返回空库', () => {
    expect(normalizeCustomLibrary(null)).toEqual(EMPTY)
    expect(normalizeCustomLibrary('x')).toEqual(EMPTY)
  })

  it('旧文件缺少 created 字段时回退为 items（升级后物品列表不空）', () => {
    const library = normalizeCustomLibrary({
      items: [{ name: 'legacy', kind: 'basic' }],
      toolTiers: [],
      armorTiers: []
    })
    expect(library.items).toHaveLength(1)
    expect(library.created.map((item) => item.name)).toEqual(['legacy'])
  })

  it('created 与 items 各自独立保存，且按 ID 去重', () => {
    const library = normalizeCustomLibrary({
      items: [{ name: 'a', kind: 'basic' }],
      created: [
        { name: 'a', kind: 'basic' },
        { name: 'a', kind: 'sword' },
        { name: 'b', kind: 'basic' }
      ],
      toolTiers: [],
      armorTiers: []
    })
    expect(library.items.map((item) => item.name)).toEqual(['a'])
    expect(library.created.map((item) => item.name)).toEqual(['a', 'b'])
  })
})

describe('物品列表独立维护（增删互不影响）', () => {
  it('upsertItemInList：同 ID 原地替换，新 ID 追加', () => {
    const a = { ...createEmptyCustomItem(), name: 'a', displayName: 'A' }
    const list = upsertItemInList([], a)
    expect(list.map((item) => item.name)).toEqual(['a'])

    const updated = upsertItemInList(list, { ...a, displayName: 'A2' })
    expect(updated).toHaveLength(1)
    expect(updated[0].displayName).toBe('A2')

    const appended = upsertItemInList(updated, { ...createEmptyCustomItem(), name: 'b' })
    expect(appended.map((item) => item.name)).toEqual(['a', 'b'])
  })

  it('removeCustomItemById：只移除指定 ID，不改动其他项', () => {
    const list: CustomItemDef[] = [
      { ...createEmptyCustomItem(), name: 'a' },
      { ...createEmptyCustomItem(), name: 'b' }
    ]
    expect(removeCustomItemById(list, 'kubejs:a').map((item) => item.name)).toEqual(['b'])
    expect(removeCustomItemById(list, 'kubejs:missing')).toHaveLength(2)
    // 不修改入参（避免污染响应式数据）
    expect(list).toHaveLength(2)
  })
})

describe('自定义物品校验', () => {
  it('ID 必填且只能是小写字母数字下划线', () => {
    expect(validateCustomItem({ ...createEmptyCustomItem(), name: '' }).errors[0]).toContain(
      '物品 ID 不能为空'
    )
    expect(validateCustomItem({ ...createEmptyCustomItem(), name: 'My Sword' }).errors[0]).toContain(
      '只能包含小写字母'
    )
  })

  it('不能用 minecraft 命名空间', () => {
    const errors = validateCustomItem({ ...createEmptyCustomItem(), name: 'x', namespace: 'minecraft' }).errors
    expect(errors.join()).toContain('不能用 minecraft')
  })

  it('同一库内不允许重名（编辑自身时排除自己）', () => {
    const def = { ...createEmptyCustomItem(), name: 'dup' }
    const library: CustomItemLibrary = { ...EMPTY, items: [def, { ...createEmptyCustomItem(), name: 'other' }] }
    // 编辑自身：不算重复
    expect(validateCustomItem(def, library, 0).errors).toHaveLength(0)
    // 新增（selfIndex < 0）：库中已有同名 → 报错
    expect(validateCustomItem(def, library, -1).errors.join()).toContain('物品 ID 已存在')
  })

  it('未填贴图给出紫黑方块提示，贴图格式非法报错', () => {
    const noTexture = validateCustomItem({ ...createEmptyCustomItem(), name: 'x' })
    expect(noTexture.warnings.join()).toContain('紫黑方块')
    const bad = validateCustomItem({ ...createEmptyCustomItem(), name: 'x', texture: 'item/x' })
    expect(bad.errors.join()).toContain('贴图路径格式非法')
  })

  it('堆叠数与耐久范围受限，且不能同时设置', () => {
    const both = validateCustomItem({
      ...createEmptyCustomItem(),
      name: 'x',
      maxStackSize: 16,
      maxDamage: 100
    })
    expect(both.errors.join()).toContain('不能同时设置')

    const tooBig = validateCustomItem({ ...createEmptyCustomItem(), name: 'x', maxStackSize: 128 })
    expect(tooBig.errors.join()).toContain('最大堆叠数应在 1 ~ 64')
  })

  it('武器 / 工具需要有效等级，自定义等级必须在库中已定义', () => {
    const missing = validateCustomItem({ ...createEmptyCustomItem('sword'), name: 's', tier: 'my_tier' })
    expect(missing.errors.join()).toContain('工具等级不存在')

    const library: CustomItemLibrary = {
      ...EMPTY,
      toolTiers: [{ name: 'my_tier', uses: 100 }]
    }
    expect(validateCustomItem({ ...createEmptyCustomItem('sword'), name: 's', tier: 'my_tier' }, library).errors).toHaveLength(0)
  })

  it('攻击速度修饰值范围 -4 ~ 4', () => {
    const errors = validateCustomItem({
      ...createEmptyCustomItem('sword'),
      name: 's',
      tier: 'iron',
      speedBaseline: 9
    }).errors
    expect(errors.join()).toContain('攻击速度修饰值应在 -4 ~ 4')
  })

  it('盔甲需要有效等级', () => {
    const errors = validateCustomItem({ ...createEmptyCustomItem('helmet'), name: 'h', armorTier: 'nope' }).errors
    expect(errors.join()).toContain('盔甲等级不存在')
  })

  it('食物：饥饿值与饱和度范围、效果字段校验', () => {
    const def = createEmptyCustomItem('food')
    def.name = 'bread'
    def.food = {
      hunger: 25,
      saturation: 0.5,
      effects: [{ id: 'minecraft:speed', durationSeconds: 0, amplifier: 0, probability: 2 }]
    }
    const errors = validateCustomItem(def).errors.join()
    expect(errors).toContain('饥饿值应在 0 ~ 20')
    expect(errors).toContain('持续时间（秒）应在 1 ~ 3600')
    expect(errors).toContain('概率应在 0 ~ 1')
  })

  it('食物效果 ID 非法时报错，概率为 0 时给出警告', () => {
    const def = createEmptyCustomItem('food')
    def.name = 'bread'
    def.food = { hunger: 4, effects: [{ id: 'Speed!', durationSeconds: 10, amplifier: 0, probability: 0 }] }
    const result = validateCustomItem(def)
    expect(result.errors.join()).toContain('效果 ID 格式非法')
    expect(result.warnings.join()).toContain('概率为 0')
  })
})

describe('自定义等级校验', () => {
  it('工具等级：与原版重名、重复定义报错', () => {
    expect(validateToolTier({ name: 'iron' }, EMPTY).errors.join()).toContain('与原版重名')
    const library: CustomItemLibrary = { ...EMPTY, toolTiers: [{ name: 't' }] }
    expect(validateToolTier({ name: 't' }, library, -1).errors.join()).toContain('工具等级已存在')
    expect(validateToolTier({ name: 't' }, library, 0).errors).toHaveLength(0)
  })

  it('工具等级：修复材料格式校验', () => {
    const errors = validateToolTier({ name: 't', repairIngredient: 'iron ingot' }, EMPTY).errors
    expect(errors.join()).toContain('修复材料格式非法')
  })

  it('盔甲等级：护甲值必须是 4 个数字', () => {
    const errors = validateArmorTier(
      { name: 'a', slotProtections: [1, 2, 3] },
      EMPTY
    ).errors
    expect(errors.join()).toContain('4 个数字')
  })

  it('盔甲等级：韧性 / 击退抗性范围', () => {
    const errors = validateArmorTier(
      { name: 'a', slotProtections: [1, 1, 1, 1], toughness: 99, knockbackResistance: 2 },
      EMPTY
    ).errors.join()
    expect(errors).toContain('盔甲韧性应在 0 ~ 20')
    expect(errors).toContain('击退抗性应在 0 ~ 1')
  })

  it('引用中的等级只提示不报错', () => {
    const library: CustomItemLibrary = {
      ...EMPTY,
      toolTiers: [{ name: 't' }],
      items: [{ ...createEmptyCustomItem('sword'), name: 's', tier: 't' }]
    }
    const result = validateToolTier({ name: 't' }, library, 0)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.join()).toContain('正被 1 个自定义物品引用')
  })
})

describe('整库校验', () => {
  it('空库报错', () => {
    expect(validateCustomLibrary(EMPTY).errors.join()).toContain('自定义物品库为空')
  })

  it('错误按物品归属加上前缀，重复项去重', () => {
    const library: CustomItemLibrary = {
      ...EMPTY,
      items: [
        { ...createEmptyCustomItem('sword'), name: 's', tier: 'nope' },
        { ...createEmptyCustomItem('helmet'), name: 'h', armorTier: 'nope' }
      ]
    }
    const result = validateCustomLibrary(library)
    expect(result.errors.some((error) => error.startsWith('物品 1（s）'))).toBe(true)
    expect(result.errors.some((error) => error.startsWith('物品 2（h）'))).toBe(true)
  })

  it('未被引用的等级只提示', () => {
    const library: CustomItemLibrary = {
      ...EMPTY,
      items: [{ ...createEmptyCustomItem(), name: 'x' }],
      armorTiers: [{ name: 'copper', slotProtections: [2, 5, 6, 2] }]
    }
    const result = validateCustomLibrary(library)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.join()).toContain('未被引用的盔甲等级：copper')
  })
})

describe('物品列表映射与摘要', () => {
  it('映射为 KubeIE 模组下的物品列表条目（命名空间仍为 kubejs）', () => {
    const sword = customItemToEntry({ ...createEmptyCustomItem('sword'), name: 'my_sword', displayName: '炫光之剑' })
    expect(sword.id).toBe('kubejs:my_sword')
    expect(sword.mod).toBe('KubeIE')
    expect(sword.mod).toBe(CUSTOM_ITEM_MOD)
    expect(sword.category).toBe('weapon')
    expect(sword.toolLike).toBe(true)
    expect(sword.armorLike).toBe(false)

    const helmet = customItemToEntry({ ...createEmptyCustomItem('helmet'), name: 'h' })
    expect(helmet.category).toBe('armor')
    expect(helmet.armorLike).toBe(true)

    const food = customItemToEntry({ ...createEmptyCustomItem('food'), name: 'f', displayName: '' })
    expect(food.category).toBe('food')
    expect(food.edible).toBe(true)
    expect(food.name).toBe('f')
  })

  it('批量映射以「已创建物品」为准：物品库移除后列表仍保留', () => {
    const a: CustomItemDef = { ...createEmptyCustomItem(), name: 'a' }
    const b: CustomItemDef = { ...createEmptyCustomItem(), name: 'b' }
    const library: CustomItemLibrary = { ...EMPTY, items: [a, b], created: [a, b] }
    expect(customItemsToEntries(library).map((entry) => entry.id)).toEqual(['kubejs:a', 'kubejs:b'])

    // 从物品库移除 a：物品列表仍显示两项
    const libraryOnly: CustomItemLibrary = { ...library, items: [b] }
    expect(customItemsToEntries(libraryOnly).map((entry) => entry.id)).toEqual(['kubejs:a', 'kubejs:b'])

    // 从物品列表移除 a：只剩 b
    const createdOnly: CustomItemLibrary = { ...libraryOnly, created: [b] }
    expect(customItemsToEntries(createdOnly).map((entry) => entry.id)).toEqual(['kubejs:b'])
  })

  it('摘要标签包含类型、ID 与关键属性', () => {
    const tags = summarizeCustomItem({
      ...createEmptyCustomItem('sword'),
      name: 'my_sword',
      displayName: '炫光之剑',
      tier: 'diamond',
      attackDamageBaseline: 8,
      speedBaseline: -2.4,
      maxDamage: 2000,
      glow: true
    })
    expect(tags).toContain('武器 · 剑')
    expect(tags).toContain('kubejs:my_sword')
    expect(tags).toContain('等级 diamond')
    expect(tags).toContain('攻速修饰 -2.4')
    expect(tags).toContain('发光')
  })

  it('食物摘要包含饥饿值与效果数量', () => {
    const def: CustomItemDef = {
      ...createEmptyCustomItem('food'),
      name: 'bread',
      food: {
        hunger: 8,
        saturation: 0.8,
        effects: [{ id: 'minecraft:speed', durationSeconds: 10, amplifier: 0, probability: 1 }]
      }
    }
    const tags = summarizeCustomItem(def)
    expect(tags).toContain('饥饿 8')
    expect(tags).toContain('效果 ×1')
  })
})

describe('库辅助函数边界', () => {
  it('未知类型回退到第一个类型而不是抛错', () => {
    expect(customItemKindInfo('unknown' as never).id).toBe('basic')
  })

  it('libraryWith 构造的库可作为校验上下文使用', () => {
    const library = libraryWith({ name: 'x' })
    expect(validateCustomItem(library.items[0], library, 0).errors).toHaveLength(0)
    expect(() => validateCustomLibrary(library)).not.toThrow()
  })
})
