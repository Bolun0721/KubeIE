import { getProfile } from './profiles'
import type {
  FoodEffect,
  ItemModification,
  ItemProperties,
  KubeJsProfileId,
  Rarity,
  ValidationResult
} from './types'

/** 合法物品注册名：namespace:path */
const ITEM_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/

export const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC']

/**
 * 校验输出脚本文件名：仅允许普通文件名，防止路径穿越（方案 7.1）。
 * 不合法时返回空字符串。
 */
export function sanitizeScriptFileName(input: string): string {
  const base = (input ?? '').trim().replace(/\\/g, '/').split('/').pop() ?? ''
  if (!/^[A-Za-z0-9_\-.]+\.js$/.test(base)) return ''
  if (base.startsWith('.')) return ''
  return base
}

/** 输出分类子目录的最大层级（KubeJS 递归上限是 10 层，这里再留足余量） */
const MAX_SUB_DIR_SEGMENTS = 4

/**
 * 校验输出脚本的分类子目录（如 `KubeIE/curios`）。
 * 只允许字母 / 数字 / 下划线 / 中划线 / 点组成的层级，禁止 `..` 与空段；
 * 非法时返回空字符串（调用方应据此拒绝写入）。
 */
export function sanitizeScriptSubDir(input: string): string {
  const raw = (input ?? '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  const segments = raw.split('/').filter((segment) => segment !== '')
  if (segments.length === 0 || segments.length > MAX_SUB_DIR_SEGMENTS) return ''
  for (const segment of segments) {
    if (!/^[A-Za-z0-9_.-]+$/.test(segment)) return ''
    if (segment === '.' || segment === '..') return ''
  }
  return segments.join('/')
}

export function isValidItemId(id: unknown): id is string {
  return typeof id === 'string' && ITEM_ID_PATTERN.test(id.trim())
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 校验单条修改记录（开发方案 6.3 物品属性约束校验）。
 * errors 会阻止脚本生成，warnings 仅提示。
 */
export function validateModification(
  modification: ItemModification,
  profileId?: KubeJsProfileId
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const profile = getProfile(profileId)
  const { itemId, properties } = modification

  if (!isValidItemId(itemId)) {
    errors.push(`物品 ID 非法：${String(itemId)}（应形如 minecraft:ender_pearl）`)
  }

  const hasAny = hasAnyProperty(properties)
  if (!hasAny) {
    warnings.push(`${itemId} 未设置任何属性，将被跳过`)
  }
  if (!properties || typeof properties !== 'object') {
    errors.push(`${itemId} 属性数据缺失`)
    return { errors, warnings }
  }

  const { maxStackSize, maxDamage, burnTime, rarity, craftingRemainder, tier, armor, foodProperties } =
    properties

  if (maxStackSize != null) {
    if (!isInt(maxStackSize)) {
      errors.push(`${itemId}：maxStackSize 必须为整数`)
    } else if (maxStackSize < 1) {
      errors.push(`${itemId}：maxStackSize 不能小于 1`)
    } else if (maxStackSize > profile.maxStackSizeLimit) {
      errors.push(
        `${itemId}：maxStackSize 上限为 ${profile.maxStackSizeLimit}（当前模板 ${profile.label}，MC ${profile.mcVersions}，1.20.5+ 数据组件才允许 99）`
      )
    }
  }

  if (maxDamage != null) {
    if (!isInt(maxDamage)) {
      errors.push(`${itemId}：maxDamage 必须为整数`)
    } else if (maxDamage < 0) {
      errors.push(`${itemId}：maxDamage 不能为负数`)
    } else if (maxDamage > 1_000_000) {
      warnings.push(`${itemId}：maxDamage = ${maxDamage} 数值过大，可能影响游戏平衡或界面显示`)
    }
  }

  if (burnTime != null) {
    if (!isInt(burnTime)) {
      errors.push(`${itemId}：burnTime 必须为整数（tick，煤炭为 1600）`)
    } else if (burnTime < 0) {
      errors.push(`${itemId}：burnTime 不能为负数`)
    } else if (burnTime > 100_000) {
      warnings.push(`${itemId}：burnTime = ${burnTime} 已相当长（1600 tick ≈ 80 秒）`)
    }
  }

  if (rarity != null && !RARITIES.includes(rarity)) {
    errors.push(`${itemId}：rarity 必须是 ${RARITIES.join(' / ')} 之一（大写字符串）`)
  }

  if (craftingRemainder != null && !isValidItemId(craftingRemainder)) {
    errors.push(`${itemId}：craftingRemainder 不是合法物品 ID：${String(craftingRemainder)}`)
  }

  if (tier) {
    if (tier.speed != null) {
      if (!isNum(tier.speed)) errors.push(`${itemId}：tier.speed 必须为数值`)
      else if (tier.speed < 0 || tier.speed > 100) errors.push(`${itemId}：tier.speed 应在 0 ~ 100 之间`)
    }
    if (tier.attackDamageBonus != null) {
      if (!isNum(tier.attackDamageBonus)) errors.push(`${itemId}：tier.attackDamageBonus 必须为数值`)
      else if (tier.attackDamageBonus < -100 || tier.attackDamageBonus > 100) {
        warnings.push(`${itemId}：tier.attackDamageBonus = ${tier.attackDamageBonus} 超出常见范围（-100 ~ 100）`)
      }
    }
    // attackSpeed 是「攻速修饰值」：实际攻击速度 = 4.0 + 该值（原版剑 -2.4 → 1.6）
    if (tier.attackSpeed != null) {
      if (!isNum(tier.attackSpeed)) errors.push(`${itemId}：tier.attackSpeed 必须为数值`)
      else if (tier.attackSpeed > 0) {
        warnings.push(
          `${itemId}：tier.attackSpeed = ${tier.attackSpeed} 会让实际攻速达到 ${(4 + tier.attackSpeed).toFixed(
            1
          )}（超过基础 4.0，几乎没有攻击冷却）`
        )
      } else if (tier.attackSpeed < -4) {
        warnings.push(
          `${itemId}：tier.attackSpeed = ${tier.attackSpeed} 会让实际攻速变成 ${(4 + tier.attackSpeed).toFixed(
            1
          )}（≤ 0 时无法正常攻击），请确认`
        )
      }
    }
    if (tier.level != null && (!isInt(tier.level) || tier.level < 0 || tier.level > 255)) {
      errors.push(`${itemId}：tier.level 应为 0 ~ 255 的整数`)
    }
    if (tier.repairIngredient != null && !isValidItemId(tier.repairIngredient)) {
      errors.push(`${itemId}：tier.repairIngredient 不是合法物品 ID：${String(tier.repairIngredient)}`)
    }
    // 挖掘等级 / 修复材料只能通过 tier 回调写入，而该 API 已被 KubeJS 官方标记为失效
    if (tier.level != null) {
      warnings.push(
        `${itemId}：挖掘等级只能通过 tier 回调设置，而该 API 已被 KubeJS 官方标记为失效（issue #662），修改可能不生效`
      )
      // 实测（MC 1.20.1 / Forge 47.4.23）：等级会被钳制在铁镐（2），低于铁镐的工具升不上去、高于铁镐的工具降不下来
      warnings.push(
        `${itemId}：实测 1.20.1 下挖掘等级会被限制在铁镐（2）——低于铁镐的工具最高只能提升到铁镐，高于铁镐的工具最低只能降到铁镐（游戏 / 模组侧限制）`
      )
    }
    if (tier.repairIngredient != null) {
      warnings.push(
        `${itemId}：修复材料只能通过 tier 回调设置，该 API 已被 KubeJS 官方标记为失效（issue #662），修改可能不生效`
      )
    }
  }

  if (armor) {
    if (armor.protection != null) {
      if (!isNum(armor.protection)) errors.push(`${itemId}：armor.protection 必须为数值`)
      else if (armor.protection < 0) errors.push(`${itemId}：armor.protection 不能为负数`)
      else if (armor.protection > 20) {
        warnings.push(
          `${itemId}：armor.protection = ${armor.protection} 已超过护甲条满格值 20（原版单件最高 8），实际收益会递减`
        )
      }
    }
    if (armor.toughness != null) {
      if (!isNum(armor.toughness)) errors.push(`${itemId}：armor.toughness 必须为数值`)
      else if (armor.toughness < 0) errors.push(`${itemId}：armor.toughness 不能为负数`)
      else if (armor.toughness > 20) {
        warnings.push(
          `${itemId}：armor.toughness = ${armor.toughness} 远超原版范围（钻石 / 下界合金每件为 2），请确认`
        )
      }
    }
    if (armor.protection == null && armor.toughness == null) {
      warnings.push(`${itemId}：护甲属性未填写有效内容，将被忽略`)
    }
  }

  if (foodProperties) {
    validateFood(itemId, foodProperties, errors, warnings)
  }

  return { errors, warnings }
}

/**
 * 校验食物覆盖项（FoodTweaker 语义）。
 * 字段本身与物品类型无关，物品是否为食物由主进程依据内置库补充提示。
 */
function validateFood(
  itemId: string,
  food: NonNullable<ItemProperties['foodProperties']>,
  errors: string[],
  warnings: string[]
): void {
  if (food.remove) return

  const { nutrition, saturation, canAlwaysEat, eatSeconds, effects } = food

  if (nutrition != null) {
    if (!isInt(nutrition)) errors.push(`${itemId}：foodProperties.nutrition 必须为整数`)
    else if (nutrition < 0) errors.push(`${itemId}：foodProperties.nutrition 不能为负数`)
    else if (nutrition > 20) {
      warnings.push(`${itemId}：nutrition = ${nutrition} 超过饥饿值上限 20，实际只会补满饥饿条`)
    }
  }

  if (saturation != null) {
    if (!isNum(saturation)) errors.push(`${itemId}：foodProperties.saturation 必须为数值`)
    else if (saturation < 0) errors.push(`${itemId}：foodProperties.saturation 不能为负数`)
    else if (saturation > 5) {
      warnings.push(`${itemId}：saturation = ${saturation} 远超原版范围（0 ~ 1.2），实际饱和度会非常大`)
    }
  }

  if (canAlwaysEat != null && typeof canAlwaysEat !== 'boolean') {
    errors.push(`${itemId}：foodProperties.canAlwaysEat 必须为布尔值`)
  }

  if (eatSeconds != null) {
    if (!isNum(eatSeconds)) errors.push(`${itemId}：foodProperties.eatSeconds 必须为数值`)
    else if (eatSeconds <= 0) errors.push(`${itemId}：foodProperties.eatSeconds 必须大于 0`)
    else if (eatSeconds > 0.8 && eatSeconds !== 1.6) {
      warnings.push(
        `${itemId}：eatSeconds = ${eatSeconds} —— MC 1.20.1 只区分两档食用速度，大于 0.8 秒一律按标准速度（约 1.6 秒）生效`
      )
    }
  }

  for (const effect of effects ?? []) {
    errors.push(...validateFoodEffect(itemId, effect))
  }

  if (!hasFoodValue(food)) {
    warnings.push(`${itemId}：食物属性未填写有效内容，将不会写入 FoodTweaker 配置`)
  }
}

function validateFoodEffect(itemId: string, effect: FoodEffect): string[] {
  const errors: string[] = []
  if (!isValidItemId(effect?.id)) {
    errors.push(`${itemId}：药水效果 ID 非法：${String(effect?.id)}`)
  }
  if (!isInt(effect?.amplifier) || effect.amplifier < 0 || effect.amplifier > 255) {
    errors.push(`${itemId}：效果 ${effect?.id} 的 amplifier 应为 0 ~ 255 的整数（0 = I 级）`)
  }
  if (!isNum(effect?.durationSeconds) || effect.durationSeconds <= 0) {
    errors.push(`${itemId}：效果 ${effect?.id} 的 durationSeconds 应大于 0（秒）`)
  } else if (effect.durationSeconds > 3600) {
    errors.push(`${itemId}：效果 ${effect.id} 的 durationSeconds 超过 3600 秒（1 小时），请确认是否合理`)
  }
  if (!isNum(effect?.probability) || effect.probability < 0 || effect.probability > 1) {
    errors.push(`${itemId}：效果 ${effect?.id} 的 probability 应为 0.0 ~ 1.0 之间的小数`)
  }
  return errors
}

/** 食物覆盖项是否含有有效内容（remove 单独处理） */
function hasFoodValue(food: NonNullable<ItemProperties['foodProperties']>): boolean {
  if (food.nutrition != null || food.saturation != null) return true
  if (food.canAlwaysEat != null || food.eatSeconds != null) return true
  return Array.isArray(food.effects) && food.effects.length > 0
}

/**
 * 是否存在至少一项有效属性（用于判断空队列项）。
 * 食物属性由 FoodTweaker 配置承载，计入「有效属性」。
 */
export function hasAnyProperty(properties?: ItemProperties | null): boolean {
  return hasScriptProperty(properties) || hasFoodProperty(properties)
}

/** 是否存在需要写入 KubeJS 脚本的属性（tier 属性已排除食物） */
export function hasScriptProperty(properties?: ItemProperties | null): boolean {
  if (!properties || typeof properties !== 'object') return false
  const keys: (keyof ItemProperties)[] = [
    'maxStackSize',
    'maxDamage',
    'burnTime',
    'fireResistant',
    'rarity',
    'craftingRemainder'
  ]
  for (const key of keys) {
    const value = properties[key]
    if (value !== null && value !== undefined) return true
  }
  if (properties.tier && Object.values(properties.tier).some((v) => v !== null && v !== undefined)) {
    return true
  }
  if (properties.armor && Object.values(properties.armor).some((v) => v !== null && v !== undefined)) {
    return true
  }
  return false
}

/** 是否存在需要写入 FoodTweaker 配置的食物属性 */
export function hasFoodProperty(properties?: ItemProperties | null): boolean {
  const food = properties?.foodProperties
  if (!food || typeof food !== 'object') return false
  if (food.remove) return true
  return hasFoodValue(food)
}

/** 批量校验，返回去重后的错误与警告 */
export function validateModifications(
  modifications: ItemModification[],
  profileId?: KubeJsProfileId
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const seen = new Set<string>()

  for (const modification of modifications) {
    if (seen.has(modification?.itemId)) {
      warnings.push(`${modification?.itemId} 在队列中重复出现，后一条会覆盖前一条（同一次生成内）`)
    }
    seen.add(modification?.itemId)
    const result = validateModification(modification, profileId)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}
