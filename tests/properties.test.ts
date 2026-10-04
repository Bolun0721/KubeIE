import { describe, expect, it } from 'vitest'
import {
  cloneProperties,
  createEmptyProperties,
  normalizeProperties,
  propertiesFromEntry,
  summarizeProperties
} from '../src/shared/properties'
import { findItem, getAllItems, getFacets, queryItems } from '../src/main/itemDatabase'
import type { ItemProperties } from '../src/shared/types'

describe('属性模板辅助函数', () => {
  it('createEmptyProperties 返回完整可编辑结构', () => {
    const properties = createEmptyProperties()
    expect(properties.maxStackSize).toBeNull()
    expect(properties.rarity).toBeNull()
    expect(properties.tier).toMatchObject({ speed: null, attackDamageBonus: null, attackSpeed: null })
    expect(properties.armor).toEqual({ protection: null, toughness: null })
    expect(properties.foodProperties?.nutrition).toBeNull()
    expect(properties.foodProperties?.effects).toEqual([])
  })

  it('cloneProperties 深拷贝，互不影响', () => {
    const source = createEmptyProperties()
    const copy = cloneProperties(source)
    copy.maxStackSize = 32
    expect(source.maxStackSize).toBeNull()
  })
})

describe('normalizeProperties - 生成前清理', () => {
  it('移除未填写的属性，避免生成 null 赋值', () => {
    const properties = createEmptyProperties()
    properties.maxStackSize = 32

    const normalized = normalizeProperties(properties)
    expect(normalized).toEqual({ maxStackSize: 32 })
    expect('fireResistant' in normalized).toBe(false)
    expect('tier' in normalized).toBe(false)
  })

  it('保留填写过的工具属性', () => {
    const properties = createEmptyProperties()
    properties.tier = { speed: 8, attackDamageBonus: null, level: 3 }

    const normalized = normalizeProperties(properties)
    expect(normalized.tier).toEqual({ speed: 8, level: 3 })
  })

  it('保留攻击速度与护甲属性，剔除全空对象', () => {
    const properties = createEmptyProperties()
    properties.tier = { attackSpeed: -1.5 }
    properties.armor = { protection: 12, toughness: 0 }

    const normalized = normalizeProperties(properties)
    expect(normalized.tier).toEqual({ attackSpeed: -1.5 })
    expect(normalized.armor).toEqual({ protection: 12, toughness: 0 })

    const emptyArmor = createEmptyProperties()
    expect('armor' in normalizeProperties(emptyArmor)).toBe(false)
  })

  it('修剪物品 ID 两端空格', () => {
    const properties = createEmptyProperties()
    properties.craftingRemainder = ' minecraft:scute '
    properties.tier = { repairIngredient: ' minecraft:diamond ' }
    const normalized = normalizeProperties(properties)
    expect(normalized.craftingRemainder).toBe('minecraft:scute')
    expect(normalized.tier?.repairIngredient).toBe('minecraft:diamond')
  })
})

describe('propertiesFromEntry - 内置默认值预填', () => {
  it('食物物品预填原版营养值与饱和度倍率（供 FoodTweaker 微调）', () => {
    const apple = findItem('minecraft:apple')
    expect(apple?.edible).toBe(true)

    const properties = propertiesFromEntry(apple!)
    expect(properties.maxStackSize).toBe(64)
    expect(properties.tier?.speed).toBeNull()
    // 内置库字段 hunger → FoodTweaker 的 nutrition
    expect(properties.foodProperties?.nutrition).toBe(4)
    expect(properties.foodProperties?.saturation).toBe(0.3)
    expect(properties.foodProperties?.effects).toEqual([])
  })

  it('非食物物品不预填食物属性', () => {
    const pearl = findItem('minecraft:ender_pearl')
    expect(pearl?.edible).toBe(false)
    expect(propertiesFromEntry(pearl!).foodProperties?.nutrition).toBeNull()
  })

  it('盔甲物品预填原版护甲值与韧性', () => {
    const ironChestplate = findItem('minecraft:iron_chestplate')
    expect(ironChestplate?.armorLike).toBe(true)
    expect(propertiesFromEntry(ironChestplate!).armor).toEqual({ protection: 6, toughness: 0 })

    const netheriteLeggings = findItem('minecraft:netherite_leggings')
    expect(propertiesFromEntry(netheriteLeggings!).armor).toEqual({ protection: 6, toughness: 2 })

    const turtleHelmet = findItem('minecraft:turtle_helmet')
    expect(propertiesFromEntry(turtleHelmet!).armor).toEqual({ protection: 2, toughness: 0 })
  })

  it('盾牌 / 鞘翅不是 ArmorItem，不预填护甲属性', () => {
    for (const itemId of ['minecraft:shield', 'minecraft:elytra']) {
      const entry = findItem(itemId)
      expect(entry?.armorLike, itemId).toBe(false)
      expect(propertiesFromEntry(entry!).armor).toEqual({ protection: null, toughness: null })
    }
  })

  it('工具物品预填耐久与 tier 数值（挖掘类工具预填挖掘速度）', () => {
    const pickaxe = findItem('minecraft:diamond_pickaxe')
    expect(pickaxe?.toolLike).toBe(true)
    expect(pickaxe?.diggerLike).toBe(true)

    const pickaxeProperties = propertiesFromEntry(pickaxe!)
    expect(pickaxeProperties.maxStackSize).toBe(1)
    expect(pickaxeProperties.maxDamage).toBe(1561)
    expect(pickaxeProperties.tier?.speed).toBe(8)
    expect(pickaxeProperties.tier?.level).toBe(3)
    // 挖掘类工具在 KubeJS 6 下没有 attackDamage 映射，故不预填攻击伤害加成
    expect(pickaxeProperties.tier?.attackDamageBonus).toBeNull()
  })

  it('剑类工具不预填挖掘速度（KubeJS 对非 DiggerItem 设置 digSpeed 会报错）', () => {
    const sword = findItem('minecraft:diamond_sword')
    expect(sword?.toolLike).toBe(true)
    expect(sword?.diggerLike).toBeFalsy()

    const properties = propertiesFromEntry(sword!)
    expect(properties.maxDamage).toBe(1561)
    expect(properties.tier?.speed).toBeNull()
    // 攻击伤害加成与 tier 其余字段仍照常预填（不再提供附魔值修改）
    expect(properties.tier?.attackDamageBonus).toBe(3)
    expect(properties.tier?.level).toBe(3)
    expect('enchantmentValue' in (properties.tier ?? {})).toBe(false)
  })

  it('三叉戟不是 TieredItem，不提供 tier 表单', () => {
    const trident = findItem('minecraft:trident')
    expect(trident?.toolLike).toBe(false)
    expect(trident?.diggerLike).toBeFalsy()
  })

  it('普通物品只预填堆叠数', () => {
    const properties = propertiesFromEntry({
      id: 'minecraft:ender_pearl',
      name: '末影珍珠',
      mod: 'minecraft',
      category: 'material',
      edible: false,
      toolLike: false,
      defaults: { defaultStackSize: 16 }
    })
    expect(properties.maxStackSize).toBe(16)
    expect(properties.rarity).toBeNull()
    expect(properties.tier?.speed).toBeNull()
  })
})

describe('summarizeProperties - 队列条目摘要', () => {
  it('输出人类可读的属性标签', () => {
    const tags = summarizeProperties({
      maxStackSize: 64,
      rarity: 'RARE',
      tier: { speed: 8 }
    })

    expect(tags).toContain('堆叠 64')
    expect(tags).toContain('稀有度 RARE')
    expect(tags).toContain('挖掘速度 8')
  })

  it('食物属性输出营养 / 饱和倍率 / 食用速度 / 效果数量标签', () => {
    const tags = summarizeProperties({
      foodProperties: {
        nutrition: 8,
        saturation: 1.2,
        canAlwaysEat: true,
        eatSeconds: 0.8,
        effects: [{ id: 'minecraft:speed', amplifier: 0, durationSeconds: 10, probability: 1 }]
      }
    })

    expect(tags).toContain('营养 8')
    expect(tags).toContain('饱和倍率 1.2')
    expect(tags).toContain('随时可食用')
    expect(tags).toContain('快速食用')
    expect(tags).toContain('效果 ×1')
  })

  it('清除标记输出「清除食物覆盖」', () => {
    expect(summarizeProperties({ foodProperties: { remove: true } })).toContain('清除食物覆盖')
  })

  it('护甲属性与攻击速度输出对应标签', () => {
    const tags = summarizeProperties({
      armor: { protection: 12, toughness: 4 },
      tier: { attackSpeed: -1.5 }
    })

    expect(tags).toContain('护甲值 12')
    expect(tags).toContain('韧性 4')
    // 实际攻速 = 4.0 + (-1.5) = 2.5
    expect(tags.some((tag) => tag.includes('实际 2.5'))).toBe(true)
  })

  it('scope 可将标签限定为脚本属性或食物属性（编辑记录按目标文件分组用）', () => {
    const properties: ItemProperties = {
      maxStackSize: 32,
      armor: { protection: 5 },
      foodProperties: { nutrition: 6, saturation: 0.6 }
    }

    expect(summarizeProperties(properties, 'script')).toEqual(['堆叠 32', '护甲值 5'])
    expect(summarizeProperties(properties, 'food')).toEqual(['营养 6', '饱和倍率 0.6'])
    expect(summarizeProperties(properties)).toEqual(summarizeProperties(properties, 'all'))
  })

  it('scope 与物品实际属性无关时返回空数组', () => {
    expect(summarizeProperties({ maxStackSize: 16 }, 'food')).toEqual([])
    expect(summarizeProperties({ foodProperties: { nutrition: 2 } }, 'script')).toEqual([])
  })
})

describe('内置物品数据库', () => {
  it('收录足量物品且字段完整', () => {
    const items = getAllItems()
    expect(items.length).toBeGreaterThanOrEqual(180)

    for (const item of items) {
      expect(item.id.startsWith('minecraft:')).toBe(true)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.mod).toBe('minecraft')
    }
  })

  it('支持按中文名称搜索', () => {
    const result = queryItems({ keyword: '末影珍珠' })
    expect(result.items.map((item) => item.id)).toContain('minecraft:ender_pearl')
  })

  it('支持按注册名搜索与分页', () => {
    const result = queryItems({ keyword: 'golden_apple', limit: 1 })
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.items).toHaveLength(1)
  })

  it('支持按模组与类型筛选', () => {
    const food = queryItems({ mod: 'minecraft', category: 'food' })
    expect(food.total).toBeGreaterThan(20)
    expect(food.items.every((item) => item.category === 'food')).toBe(true)
  })

  it('getFacets 返回可选筛选项', () => {
    const facets = getFacets()
    expect(facets.mods).toContain('minecraft')
    expect(facets.categories).toContain('tool')
    expect(facets.total).toBe(getAllItems().length)
  })

  it('挖掘类工具标记完整（镐/斧/锹/锄 × 6 材质 = 24 项）', () => {
    const diggers = getAllItems().filter((item) => item.diggerLike)
    expect(diggers).toHaveLength(24)
    expect(diggers.map((item) => item.id)).toContain('minecraft:netherite_hoe')
    expect(diggers.every((item) => item.toolLike)).toBe(true)
    // 剑与三叉戟都不属于 DiggerItem
    expect(findItem('minecraft:diamond_sword')?.diggerLike).toBeFalsy()
    expect(findItem('minecraft:trident')?.diggerLike).toBeFalsy()
  })
})
