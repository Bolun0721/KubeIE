import { describe, expect, it } from 'vitest'
import {
  createEmptyArmorTier,
  createEmptyCustomItem,
  createEmptyCustomLibrary,
  type CustomItemLibrary
} from '../src/shared/customItems'
import {
  generateArmorTierBlock,
  generateCustomItemLines,
  generateCustomItemScript,
  generateToolTierBlock
} from '../src/main/customItemGenerator'

/**
 * 生成器测试：断言生成代码使用的 KubeJS 6 API 名称与真实 jar 一致
 * （speedBaseline 为攻速修饰值、FoodBuilder 用 hunger 而非 nutrition、等级用 setXxx 调用）。
 */

const EMPTY: CustomItemLibrary = createEmptyCustomLibrary()

function scriptOf(library: Partial<CustomItemLibrary>): string {
  return generateCustomItemScript({ ...EMPTY, ...library })
}

describe('自定义物品脚本：整体结构', () => {
  it('空库也生成合法脚本并给出提示注释', () => {
    const code = scriptOf({})
    expect(code).toContain('StartupEvents.registry(\'item\', event => {')
    expect(code).toContain('// 物品库为空')
    expect(code).not.toContain('ItemEvents.toolTierRegistry')
  })

  it('头部注释包含目标环境与重启提示', () => {
    const code = scriptOf({})
    expect(code).toContain('Minecraft 1.20.1 + Forge + KubeJS 6')
    expect(code).toContain('重启游戏')
    expect(code).toContain('textures/item/<物品ID>.png')
  })

  it('等级注册块在物品注册块之前（KubeJS 要求先注册等级）', () => {
    const code = scriptOf({
      items: [{ ...createEmptyCustomItem('helmet'), name: 'copper_helmet', armorTier: 'copper' }],
      armorTiers: [{ name: 'copper', slotProtections: [2, 5, 6, 2] }]
    })
    expect(code.indexOf('ItemEvents.armorTierRegistry')).toBeLessThan(
      code.indexOf('StartupEvents.registry')
    )
  })

  it('脚本以换行结尾且不含 CRLF', () => {
    const code = scriptOf({ items: [{ ...createEmptyCustomItem(), name: 'x' }] })
    expect(code.endsWith('\n')).toBe(true)
    expect(code.includes('\r')).toBe(false)
  })
})

describe('自定义物品脚本：武器与工具', () => {
  it('剑生成 tier / attackDamageBaseline / speedBaseline（而非 speed）', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('sword'),
      name: 'my_sword',
      displayName: '炫光之剑',
      texture: 'kubejs:item/my_sword',
      tier: 'diamond',
      attackDamageBaseline: 8,
      speedBaseline: -2.4,
      maxDamage: 2000
    }).join('\n')

    expect(code).toContain("event.create('my_sword', 'sword')")
    expect(code).toContain(".tier('diamond')")
    expect(code).toContain('.attackDamageBaseline(8)')
    expect(code).toContain('.speedBaseline(-2.4)')
    expect(code).not.toContain('.speed(')
    expect(code).toContain(".displayName('炫光之剑')")
    expect(code).toContain(".texture('kubejs:item/my_sword')")
    expect(code).toContain('.maxDamage(2000)')
    expect(code).toContain('kubejs:my_sword')
  })

  it('镐生成挖掘速度（.speed 写入等级）与伤害加成', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('pickaxe'),
      name: 'my_pickaxe',
      tier: 'iron',
      digSpeed: 12,
      attackDamageBonus: 4
    }).join('\n')

    expect(code).toContain("event.create('my_pickaxe', 'pickaxe')")
    expect(code).toContain('.speed(12)')
    expect(code).toContain('.attackDamageBonus(4)')
  })

  it('剪刀不生成 tier（KubeJS 无此参数）', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('shears'),
      name: 'my_shears'
    }).join('\n')
    expect(code).toContain("event.create('my_shears', 'shears')")
    expect(code).not.toContain('.tier(')
  })

  it('未填写的字段不生成调用（沿用 KubeJS 默认）', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('sword'),
      name: 'plain_sword',
      tier: 'iron'
    }).join('\n')
    expect(code).toContain(".tier('iron')")
    expect(code).not.toContain('attackDamageBaseline')
    expect(code).not.toContain('speedBaseline')
    expect(code).not.toContain('maxStackSize')
  })
})

describe('自定义物品脚本：盔甲', () => {
  it('盔甲生成 tier 与 forge 标签', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('chestplate'),
      name: 'copper_chestplate',
      armorTier: 'copper'
    }).join('\n')
    expect(code).toContain("event.create('copper_chestplate', 'chestplate')")
    expect(code).toContain(".tier('copper')")
    expect(code).toContain(".tag('forge:armors/chestplates')")
  })

  it('靴子使用 forge:armors/boots 标签', () => {
    const code = generateCustomItemLines({ ...createEmptyCustomItem('boots'), name: 'b', armorTier: 'iron' }).join('\n')
    expect(code).toContain(".tag('forge:armors/boots')")
  })

  it('盔甲等级使用 setXxx 调用（真实字段是私有的）', () => {
    const block = generateArmorTierBlock([
      {
        name: 'copper',
        durabilityMultiplier: 12,
        slotProtections: [2, 5, 6, 2],
        enchantmentValue: 9,
        toughness: 1,
        knockbackResistance: 0.1,
        repairIngredient: 'minecraft:copper_ingot'
      }
    ]).join('\n')

    expect(block).toContain('ItemEvents.armorTierRegistry(event => {')
    expect(block).toContain("event.add('copper', tier => {")
    expect(block).toContain('tier.setDurabilityMultiplier(12)')
    expect(block).toContain('tier.setSlotProtections([2, 5, 6, 2])')
    expect(block).toContain('tier.setEnchantmentValue(9)')
    expect(block).toContain('tier.setToughness(1)')
    expect(block).toContain('tier.setKnockbackResistance(0.1)')
    expect(block).toContain("tier.setRepairIngredient(Ingredient.of('minecraft:copper_ingot'))")
    expect(block).toContain('[靴子, 护腿, 胸甲, 头盔]')
    // 不写出私有字段赋值
    expect(block).not.toContain('tier.durabilityMultiplier =')
  })

  it('空等级表不生成盔甲等级块', () => {
    expect(generateArmorTierBlock([])).toEqual([])
    expect(generateArmorTierBlock([createEmptyArmorTier()])).toEqual([])
  })
})

describe('自定义物品脚本：工具等级', () => {
  it('生成 toolTierRegistry 与 setUses 等调用', () => {
    const block = generateToolTierBlock([
      {
        name: 'my_tier',
        uses: 3000,
        speed: 8,
        attackDamageBonus: 4,
        level: 3,
        enchantmentValue: 20,
        repairIngredient: '#forge:ingots/iron'
      }
    ]).join('\n')

    expect(block).toContain('ItemEvents.toolTierRegistry(event => {')
    expect(block).toContain("event.add('my_tier', tier => {")
    expect(block).toContain('tier.setUses(3000)')
    expect(block).toContain('tier.setSpeed(8)')
    expect(block).toContain('tier.setAttackDamageBonus(4)')
    expect(block).toContain('tier.setLevel(3)')
    expect(block).toContain('tier.setEnchantmentValue(20)')
    expect(block).toContain("tier.setRepairIngredient(Ingredient.of('#forge:ingots/iron'))")
  })

  it('未填写的等级字段不生成调用', () => {
    const block = generateToolTierBlock([{ name: 'minimal' }]).join('\n')
    expect(block).toContain("event.add('minimal', tier => {")
    expect(block).not.toContain('tier.setUses')
    expect(block).not.toContain('tier.setRepairIngredient')
  })
})

describe('自定义物品脚本：食物', () => {
  it('食物使用 hunger 而不是 nutrition，并把秒换算为 tick', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('food'),
      name: 'magic_bread',
      displayName: '魔法面包',
      texture: 'kubejs:item/magic_bread',
      food: {
        hunger: 8,
        saturation: 0.8,
        meat: false,
        fastToEat: false,
        alwaysEdible: false,
        effects: [{ id: 'minecraft:speed', durationSeconds: 20, amplifier: 0, probability: 1 }]
      }
    }).join('\n')

    expect(code).toContain("event.create('magic_bread', 'basic')")
    expect(code).toContain('.food(food => {')
    expect(code).toContain('.hunger(8)')
    expect(code).toContain('.saturation(0.8)')
    expect(code).toContain(".effect('minecraft:speed', 400, 0, 1)")
    expect(code).not.toContain('.nutrition(')
  })

  it('只在为 true 时生成布尔开关，避免覆盖默认值', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('food'),
      name: 'f',
      food: { hunger: 4, saturation: null, meat: false, fastToEat: true, alwaysEdible: true, effects: [] }
    }).join('\n')
    expect(code).toContain('.fastToEat(true)')
    expect(code).toContain('.alwaysEdible(true)')
    expect(code).not.toContain('.meat(')
    expect(code).not.toContain('saturation')
  })

  it('未配置任何食物属性时给出注释而不生成空链', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('food'),
      name: 'f',
      food: { hunger: null, effects: [] }
    }).join('\n')
    expect(code).toContain('// 未配置食物属性：使用 KubeJS 默认值')
    expect(code).not.toContain('.hunger(')
  })

  it('效果等级与概率按原值输出', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('food'),
      name: 'f',
      food: {
        hunger: 6,
        effects: [{ id: 'minecraft:regeneration', durationSeconds: 5, amplifier: 1, probability: 0.5 }]
      }
    }).join('\n')
    expect(code).toContain(".effect('minecraft:regeneration', 100, 1, 0.5)")
  })
})

describe('自定义物品脚本：通用属性与转义', () => {
  it('通用字段全部生成', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem(),
      name: 'ruby',
      displayName: '红宝石',
      maxStackSize: 16,
      glow: true,
      fireResistant: true,
      rarity: 'EPIC',
      tooltip: '第一行\n第二行'
    }).join('\n')

    expect(code).toContain('.maxStackSize(16)')
    expect(code).toContain('.glow(true)')
    expect(code).toContain('.fireResistant(true)')
    expect(code).toContain(".rarity('epic')")
    expect(code).toContain(".tooltip('第一行')")
    expect(code).toContain(".tooltip('第二行')")
  })

  it('单引号与反斜杠被转义，避免脚本语法错误', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem(),
      name: 'x',
      displayName: "it's a \\ test"
    }).join('\n')
    expect(code).toContain(".displayName('it\\'s a \\\\ test')")
  })

  it('小数保留、整数不带小数点', () => {
    const code = generateCustomItemLines({
      ...createEmptyCustomItem('shovel'),
      name: 's',
      tier: 'iron',
      attackDamageBaseline: 1.5,
      speedBaseline: -3
    }).join('\n')
    expect(code).toContain('.attackDamageBaseline(1.5)')
    expect(code).toContain('.speedBaseline(-3)')
  })

  it('忽略未命名物品（避免生成非法脚本）', () => {
    expect(generateCustomItemLines({ ...createEmptyCustomItem(), name: '' })).toEqual([])
    const code = scriptOf({ items: [{ ...createEmptyCustomItem(), name: '  ' }] })
    expect(code).toContain('// 物品库为空')
  })
})

describe('自定义物品脚本：完整库', () => {
  it('多个物品按顺序生成，等级块只出现一次', () => {
    const code = scriptOf({
      items: [
        { ...createEmptyCustomItem('sword'), name: 'a', tier: 'my_tier' },
        { ...createEmptyCustomItem('pickaxe'), name: 'b', tier: 'my_tier' }
      ],
      toolTiers: [{ name: 'my_tier' }]
    })
    expect(code.match(/ItemEvents\.toolTierRegistry/g)).toHaveLength(1)
    expect(code.indexOf("event.create('a'")).toBeLessThan(code.indexOf("event.create('b'"))
  })

  it('工具等级与盔甲等级可以同时存在', () => {
    const code = scriptOf({
      items: [{ ...createEmptyCustomItem(), name: 'x' }],
      toolTiers: [{ name: 't' }],
      armorTiers: [{ name: 'a', slotProtections: [1, 1, 1, 1] }]
    })
    expect(code).toContain('ItemEvents.toolTierRegistry')
    expect(code).toContain('ItemEvents.armorTierRegistry')
    expect(code.indexOf('ItemEvents.toolTierRegistry')).toBeLessThan(code.indexOf('StartupEvents.registry'))
  })
})
