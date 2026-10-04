import {
  ARMOR_FORGE_TAGS,
  customItemId,
  customItemKindInfo,
  type CustomArmorTierDef,
  type CustomItemDef,
  type CustomItemLibrary,
  type CustomToolTierDef
} from '@shared/customItems'

/**
 * 自定义物品脚本生成（KubeJS 6 / MC 1.20.1 Forge）。
 *
 * API 名称已对照 kubejs-forge-2001.6.5-build.26.jar 反编译核实：
 * - ItemBuilder / HandheldItemBuilder：attackDamageBaseline / speedBaseline（攻速**修饰值**）/ attackDamageBonus / speed（挖掘速度）
 * - ArmorItemBuilder：tier(ArmorMaterial) / modifyTier
 * - FoodBuilder：hunger / saturation / meat / fastToEat / alwaysEdible / effect
 * - MutableToolTier、MutableArmorTier：字段为私有，必须用 setXxx(...) 调用
 */

const HEADER = [
  '// ===== KubeJS 自定义物品（由 KubeIE生成）=====',
  '// 目标环境：Minecraft 1.20.1 + Forge + KubeJS 6',
  '// 生效方式：必须**重启游戏**（物品注册属于启动阶段，/kubejs reload startup_scripts 不保证生效）',
  '// 贴图：请把 PNG 放到 kubejs/assets/<命名空间>/textures/item/<物品ID>.png',
  '//       盔甲身穿外观：kubejs/assets/<命名空间>/textures/models/armor/<等级ID>_layer_1.png 与 _layer_2.png',
  '// 注意：attackDamageBaseline 是等级加成之外的基础伤害；speedBaseline 是攻击速度修饰值（实际攻速 = 4.0 + 该值）'
]

/** JS 字符串字面量转义 */
function quote(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 数字字面量：整数省略小数点 */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

/** 自定义工具等级注册（ItemEvents.toolTierRegistry） */
export function generateToolTierBlock(tiers: CustomToolTierDef[]): string[] {
  const used = tiers.filter((tier) => (tier.name ?? '').trim() !== '')
  if (used.length === 0) return []

  const lines: string[] = []
  lines.push('ItemEvents.toolTierRegistry(event => {')
  used.forEach((tier, index) => {
    if (index > 0) lines.push('')
    lines.push(`  // 自定义工具等级：${tier.name}`)
    lines.push(`  event.add(${quote(tier.name)}, tier => {`)
    if (tier.uses != null) lines.push(`    tier.setUses(${num(tier.uses)})`)
    if (tier.speed != null) lines.push(`    tier.setSpeed(${num(tier.speed)})`)
    if (tier.attackDamageBonus != null) {
      lines.push(`    tier.setAttackDamageBonus(${num(tier.attackDamageBonus)})`)
    }
    if (tier.level != null) lines.push(`    tier.setLevel(${num(tier.level)})`)
    if (tier.enchantmentValue != null) {
      lines.push(`    tier.setEnchantmentValue(${num(tier.enchantmentValue)})`)
    }
    const repair = (tier.repairIngredient ?? '').trim()
    if (repair) lines.push(`    tier.setRepairIngredient(Ingredient.of(${quote(repair)}))`)
    lines.push('  })')
  })
  lines.push('})')
  return lines
}

/** 自定义盔甲等级注册（ItemEvents.armorTierRegistry） */
export function generateArmorTierBlock(tiers: CustomArmorTierDef[]): string[] {
  const used = tiers.filter((tier) => (tier.name ?? '').trim() !== '')
  if (used.length === 0) return []

  const lines: string[] = []
  lines.push('ItemEvents.armorTierRegistry(event => {')
  used.forEach((tier, index) => {
    if (index > 0) lines.push('')
    lines.push(`  // 自定义盔甲等级：${tier.name}`)
    lines.push(`  event.add(${quote(tier.name)}, tier => {`)
    if (tier.durabilityMultiplier != null) {
      lines.push(`    tier.setDurabilityMultiplier(${num(tier.durabilityMultiplier)})`)
    }
    const protections = tier.slotProtections
    if (protections && protections.length === 4) {
      lines.push(`    // 顺序：[靴子, 护腿, 胸甲, 头盔]`)
      lines.push(`    tier.setSlotProtections([${protections.map((value) => num(value)).join(', ')}])`)
    }
    if (tier.enchantmentValue != null) {
      lines.push(`    tier.setEnchantmentValue(${num(tier.enchantmentValue)})`)
    }
    if (tier.toughness != null) lines.push(`    tier.setToughness(${num(tier.toughness)})`)
    if (tier.knockbackResistance != null) {
      lines.push(`    tier.setKnockbackResistance(${num(tier.knockbackResistance)})`)
    }
    const repair = (tier.repairIngredient ?? '').trim()
    if (repair) lines.push(`    tier.setRepairIngredient(Ingredient.of(${quote(repair)}))`)
    lines.push('  })')
  })
  lines.push('})')
  return lines
}

/** 单个物品的注册语句（多行，含缩进） */
export function generateCustomItemLines(def: CustomItemDef): string[] {
  const info = customItemKindInfo(def.kind)
  const name = (def.name ?? '').trim()
  // 未命名物品无法生成合法脚本（调用方应已过滤，这里再兜一层）
  if (!name) return []
  const id = customItemId(def)
  const lines: string[] = []

  lines.push(`  // ${info.label}：${id}`)
  lines.push(`  event.create(${quote(name)}, ${quote(info.registryType)})`)

  // 工具 / 武器
  if (info.useToolTier && (def.tier ?? '').trim()) {
    lines.push(`    .tier(${quote((def.tier ?? '').trim())})`)
  }
  if (info.useToolTier && def.attackDamageBaseline != null) {
    lines.push(`    .attackDamageBaseline(${num(def.attackDamageBaseline)})`)
  }
  if (info.useToolTier && def.speedBaseline != null) {
    lines.push(`    .speedBaseline(${num(def.speedBaseline)})`)
  }
  if (info.useToolTier && def.attackDamageBonus != null) {
    lines.push(`    .attackDamageBonus(${num(def.attackDamageBonus)})`)
  }
  if (info.diggerLike && def.digSpeed != null) {
    lines.push(`    .speed(${num(def.digSpeed)})`)
  }

  // 盔甲
  if (info.armorLike && (def.armorTier ?? '').trim()) {
    lines.push(`    .tier(${quote((def.armorTier ?? '').trim())})`)
  }

  // 通用
  const displayName = (def.displayName ?? '').trim()
  if (displayName) lines.push(`    .displayName(${quote(displayName)})`)
  const texture = (def.texture ?? '').trim()
  if (texture) lines.push(`    .texture(${quote(texture)})`)
  if (def.maxStackSize != null) lines.push(`    .maxStackSize(${num(def.maxStackSize)})`)
  if (def.maxDamage != null) lines.push(`    .maxDamage(${num(def.maxDamage)})`)
  if (def.glow === true) lines.push('    .glow(true)')
  if (def.fireResistant === true) lines.push('    .fireResistant(true)')
  if (def.rarity) lines.push(`    .rarity(${quote(def.rarity.toLowerCase())})`)

  const tooltips = String(def.tooltip ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  for (const tooltip of tooltips) lines.push(`    .tooltip(${quote(tooltip)})`)

  if (info.armorLike) {
    const tag = ARMOR_FORGE_TAGS[def.kind]
    if (tag) lines.push(`    .tag(${quote(tag)})`)
  }

  // 食物
  if (info.food && def.food) {
    const food = def.food
    const chain: string[] = []
    if (food.hunger != null) chain.push(`.hunger(${num(food.hunger)})`)
    if (food.saturation != null) chain.push(`.saturation(${num(food.saturation)})`)
    if (food.meat === true) chain.push('.meat(true)')
    if (food.fastToEat === true) chain.push('.fastToEat(true)')
    if (food.alwaysEdible === true) chain.push('.alwaysEdible(true)')
    for (const effect of food.effects) {
      const effectId = (effect.id ?? '').trim()
      if (!effectId) continue
      const ticks = Math.max(1, Math.round((effect.durationSeconds ?? 0) * 20))
      chain.push(
        `.effect(${quote(effectId)}, ${num(ticks)}, ${num(effect.amplifier ?? 0)}, ${num(
          effect.probability ?? 1
        )})`
      )
    }

    lines.push('    .food(food => {')
    if (chain.length === 0) {
      lines.push('      // 未配置食物属性：使用 KubeJS 默认值')
    } else {
      lines.push('      food')
      for (const call of chain) lines.push(`        ${call}`)
    }
    lines.push('    })')
  }

  return lines
}

/** 完整脚本：等级注册在前，物品注册在后（等级必须先注册） */
export function generateCustomItemScript(library: CustomItemLibrary): string {
  const toolTierBlock = generateToolTierBlock(library?.toolTiers ?? [])
  const armorTierBlock = generateArmorTierBlock(library?.armorTiers ?? [])
  const items = (library?.items ?? []).filter((item) => (item.name ?? '').trim() !== '')

  const body: string[] = []
  if (toolTierBlock.length > 0) {
    body.push(...toolTierBlock)
    body.push('')
  }
  if (armorTierBlock.length > 0) {
    body.push(...armorTierBlock)
    body.push('')
  }

  body.push('StartupEvents.registry(\'item\', event => {')
  if (items.length === 0) {
    body.push('  // 物品库为空：在编辑器里配置自定义物品后这里会自动生成代码')
  } else {
    items.forEach((item, index) => {
      if (index > 0) body.push('')
      body.push(...generateCustomItemLines(item))
    })
  }
  body.push('})')

  return [...HEADER, '', ...body, ''].join('\n')
}
