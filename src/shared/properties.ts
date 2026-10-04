import { armorValuesOf } from './data/armorValues'
import type {
  ArmorProperties,
  FoodEffect,
  FoodProperties,
  ItemEntry,
  ItemProperties,
  ResolvedFoodEffect,
  ResolvedFoodProperties,
  TierProperties
} from './types'

/** 属性编辑辅助：空模板、默认值填充、生成前的清理 */

export function createEmptyTier(): TierProperties {
  return {
    speed: null,
    attackDamageBonus: null,
    attackSpeed: null,
    level: null,
    repairIngredient: null
  }
}

/** 空的护甲属性（护甲值 / 盔甲韧性） */
export function createEmptyArmor(): ArmorProperties {
  return { protection: null, toughness: null }
}

/** 空的食物覆盖项（FoodTweaker）：全部为 null 表示不修改 */
export function createEmptyFood(): ResolvedFoodProperties {
  return {
    nutrition: null,
    saturation: null,
    canAlwaysEat: null,
    eatSeconds: null,
    effects: [],
    remove: false
  }
}

export function createEmptyProperties(): ItemProperties {
  return {
    maxStackSize: null,
    maxDamage: null,
    burnTime: null,
    fireResistant: null,
    rarity: null,
    craftingRemainder: null,
    tier: createEmptyTier(),
    armor: createEmptyArmor(),
    foodProperties: createEmptyFood()
  }
}

/**
 * 补齐食用效果的显示开关默认值（FoodTweaker 默认：ambient=false、show_particles=true、show_icon=true），
 * 避免界面上出现「复选框未勾选但实际生效」的误导。
 */
export function withEffectDefaults(effect: Partial<FoodEffect> | null | undefined): ResolvedFoodEffect {
  return {
    id: effect?.id ?? '',
    amplifier: effect?.amplifier ?? 0,
    durationSeconds: effect?.durationSeconds ?? 30,
    probability: effect?.probability ?? 1,
    ambient: effect?.ambient ?? false,
    showParticles: effect?.showParticles ?? true,
    showIcon: effect?.showIcon ?? true
  }
}

/** 新增一条空的食用效果（沿用 FoodTweaker 的默认值：30 秒 / I 级 / 100% 概率） */
export function createEmptyEffect(): ResolvedFoodEffect {
  return withEffectDefaults({})
}

export function cloneProperties(properties: ItemProperties): ItemProperties {
  return JSON.parse(JSON.stringify(properties ?? {})) as ItemProperties
}

/** 用内置数据库中的原版默认值预填表单 */
export function propertiesFromEntry(entry: ItemEntry): ItemProperties {
  const properties = createEmptyProperties()
  const defaults = entry.defaults ?? {}

  properties.maxStackSize = defaults.defaultStackSize ?? null
  properties.maxDamage = defaults.maxDamage ?? null
  properties.burnTime = defaults.burnTime ?? null
  properties.fireResistant = defaults.fireResistant ?? null
  properties.rarity = defaults.rarity ?? null
  properties.craftingRemainder = defaults.craftingRemainder ?? null

  if (entry.toolLike && defaults.tier) {
    properties.tier = {
      // 剑等非挖掘类工具（非 DiggerItem）在 KubeJS 中设置挖掘速度会报错，故不预填
      speed: entry.diggerLike ? defaults.tier.speed ?? null : null,
      // 挖掘类工具（DiggerItem）在 KubeJS 6 下没有 attackDamage 映射，设置会中断整个事件，故不预填
      attackDamageBonus: entry.diggerLike ? null : defaults.tier.attackDamageBonus ?? null,
      level: defaults.tier.level ?? null,
      repairIngredient: defaults.tier.repairIngredient ?? null
    }
  }

  // 盔甲类物品预填原版护甲值与韧性（便于在此基础上微调）
  const armorValues = armorValuesOf(entry.id)
  if (entry.armorLike || armorValues) {
    properties.armor = {
      protection: armorValues?.protection ?? null,
      toughness: armorValues?.toughness ?? null
    }
  }

  // 内置库中的字段名为 hunger，语义等同 FoodTweaker 的 nutrition
  if (entry.edible && defaults.foodProperties) {
    properties.foodProperties = {
      nutrition: defaults.foodProperties.hunger ?? null,
      saturation: defaults.foodProperties.saturation ?? null,
      canAlwaysEat: defaults.foodProperties.canAlwaysEat ?? null,
      eatSeconds: defaults.foodProperties.eatSeconds ?? null,
      effects: [],
      remove: false
    }
  }

  return properties
}

/**
 * 清理空值：仅保留用户实际填写的属性，
 * 避免生成 `item.maxStackSize = null` 这类无效赋值。
 */
export function normalizeProperties(properties?: ItemProperties | null): ItemProperties {
  const result: ItemProperties = {}
  if (!properties) return result

  if (properties.maxStackSize != null) result.maxStackSize = properties.maxStackSize
  if (properties.maxDamage != null) result.maxDamage = properties.maxDamage
  if (properties.burnTime != null) result.burnTime = properties.burnTime
  if (properties.fireResistant != null) result.fireResistant = properties.fireResistant
  if (properties.rarity) result.rarity = properties.rarity
  if (properties.craftingRemainder) result.craftingRemainder = properties.craftingRemainder.trim()

  const tier = properties.tier
  if (tier) {
    const cleanedTier: TierProperties = {}
    if (tier.speed != null) cleanedTier.speed = tier.speed
    if (tier.attackDamageBonus != null) cleanedTier.attackDamageBonus = tier.attackDamageBonus
    if (tier.attackSpeed != null) cleanedTier.attackSpeed = tier.attackSpeed
    if (tier.level != null) cleanedTier.level = tier.level
    if (tier.repairIngredient) cleanedTier.repairIngredient = tier.repairIngredient.trim()
    if (Object.keys(cleanedTier).length > 0) result.tier = cleanedTier
  }

  const armor = properties.armor
  if (armor) {
    const cleanedArmor: ArmorProperties = {}
    if (armor.protection != null) cleanedArmor.protection = armor.protection
    if (armor.toughness != null) cleanedArmor.toughness = armor.toughness
    if (Object.keys(cleanedArmor).length > 0) result.armor = cleanedArmor
  }

  const food = properties.foodProperties
  if (food) {
    if (food.remove) {
      result.foodProperties = { remove: true }
    } else {
      const cleanedFood: FoodProperties = {}
      if (food.nutrition != null) cleanedFood.nutrition = food.nutrition
      if (food.saturation != null) cleanedFood.saturation = food.saturation
      if (food.canAlwaysEat != null) cleanedFood.canAlwaysEat = food.canAlwaysEat
      if (food.eatSeconds != null) cleanedFood.eatSeconds = food.eatSeconds
      const effects = (food.effects ?? [])
        .filter((effect) => !!effect && !!effect.id)
        .map((effect) => ({ ...effect }))
      if (effects.length > 0) cleanedFood.effects = effects
      if (Object.keys(cleanedFood).length > 0) result.foodProperties = cleanedFood
    }
  }

  return result
}

/** 攻速修饰值 → 实际攻击速度（KubeJS 的 attackSpeed 是修饰值，实际攻速 = 4.0 + 该值） */
export function formatAttackSpeed(modifier: number): string {
  return (4 + modifier).toFixed(1)
}

/** 属性标签的展示范围：全部 / 仅 KubeJS 脚本属性 / 仅 FoodTweaker 食物属性 */
export type PropertyScope = 'all' | 'script' | 'food'

/**
 * 生成队列条目摘要标签。
 * scope 用于编辑记录界面：脚本属性与食物属性写入不同文件，需分组展示各自相关的标签。
 */
export function summarizeProperties(properties: ItemProperties, scope: PropertyScope = 'all'): string[] {
  const tags: string[] = []

  if (scope !== 'food') {
    if (properties.maxStackSize != null) tags.push(`堆叠 ${properties.maxStackSize}`)
    if (properties.maxDamage != null) tags.push(`耐久 ${properties.maxDamage}`)
    if (properties.burnTime != null) tags.push(`燃烧 ${properties.burnTime} tick`)
    if (properties.fireResistant != null) tags.push(properties.fireResistant ? '抗火' : '不抗火')
    if (properties.rarity) tags.push(`稀有度 ${properties.rarity}`)
    if (properties.craftingRemainder) tags.push(`余物 ${properties.craftingRemainder}`)

    const tier = properties.tier
    if (tier) {
      if (tier.speed != null) tags.push(`挖掘速度 ${tier.speed}`)
      if (tier.attackDamageBonus != null) tags.push(`攻击加成 ${tier.attackDamageBonus}`)
      if (tier.attackSpeed != null) tags.push(`攻速修饰 ${tier.attackSpeed}（实际 ${formatAttackSpeed(tier.attackSpeed)}）`)
      if (tier.level != null) tags.push(`等级 ${tier.level}`)
      if (tier.repairIngredient) tags.push(`修复材料 ${tier.repairIngredient}`)
    }

    const armor = properties.armor
    if (armor) {
      if (armor.protection != null) tags.push(`护甲值 ${armor.protection}`)
      if (armor.toughness != null) tags.push(`韧性 ${armor.toughness}`)
    }
  }

  if (scope !== 'script') {
    const food = properties.foodProperties
    if (food) {
      if (food.remove) tags.push('清除食物覆盖')
      else {
        if (food.nutrition != null) tags.push(`营养 ${food.nutrition}`)
        if (food.saturation != null) tags.push(`饱和倍率 ${food.saturation}`)
        if (food.canAlwaysEat) tags.push('随时可食用')
        if (food.eatSeconds != null) tags.push(food.eatSeconds <= 0.8 ? '快速食用' : `食用 ${food.eatSeconds}s`)
        if (food.effects?.length) tags.push(`效果 ×${food.effects.length}`)
      }
    }
  }

  return tags
}
