/**
 * 原版 Minecraft 1.20.1 的盔甲（net.minecraft.world.item.ArmorItem）护甲值与韧性参考表。
 *
 * 用途：
 * 1) 判定物品是否为 ArmorItem（决定界面是否提供护甲属性、脚本是否可安全生成 armorProtection / armorToughness）；
 *    —— 盾牌、鞘翅在物品库中分类为 armor，但**不是** ArmorItem，KubeJS 设置这些属性会抛 UnsupportedOperationException。
 * 2) 表单预填原版数值，便于在此基础上微调。
 *
 * 数值来源：MC 1.20.1 原版盔甲注册表（头盔 | 胸甲 | 护腿 | 靴子）。
 */

export interface ArmorValues {
  /** 护甲值（盔甲条），护甲条满格为 20 */
  protection: number
  /** 盔甲韧性，原版仅钻石 / 下界合金提供，每件 +2 */
  toughness: number
}

export const ARMOR_VALUES: Record<string, ArmorValues> = {
  // 皮革：1 | 3 | 2 | 1，韧性 0
  'minecraft:leather_helmet': { protection: 1, toughness: 0 },
  'minecraft:leather_chestplate': { protection: 3, toughness: 0 },
  'minecraft:leather_leggings': { protection: 2, toughness: 0 },
  'minecraft:leather_boots': { protection: 1, toughness: 0 },

  // 金：2 | 5 | 3 | 1，韧性 0
  'minecraft:golden_helmet': { protection: 2, toughness: 0 },
  'minecraft:golden_chestplate': { protection: 5, toughness: 0 },
  'minecraft:golden_leggings': { protection: 3, toughness: 0 },
  'minecraft:golden_boots': { protection: 1, toughness: 0 },

  // 锁链：2 | 5 | 4 | 1，韧性 0
  'minecraft:chainmail_helmet': { protection: 2, toughness: 0 },
  'minecraft:chainmail_chestplate': { protection: 5, toughness: 0 },
  'minecraft:chainmail_leggings': { protection: 4, toughness: 0 },
  'minecraft:chainmail_boots': { protection: 1, toughness: 0 },

  // 铁：2 | 6 | 5 | 2，韧性 0
  'minecraft:iron_helmet': { protection: 2, toughness: 0 },
  'minecraft:iron_chestplate': { protection: 6, toughness: 0 },
  'minecraft:iron_leggings': { protection: 5, toughness: 0 },
  'minecraft:iron_boots': { protection: 2, toughness: 0 },

  // 钻石：3 | 8 | 6 | 3，韧性每件 2
  'minecraft:diamond_helmet': { protection: 3, toughness: 2 },
  'minecraft:diamond_chestplate': { protection: 8, toughness: 2 },
  'minecraft:diamond_leggings': { protection: 6, toughness: 2 },
  'minecraft:diamond_boots': { protection: 3, toughness: 2 },

  // 下界合金：3 | 8 | 6 | 3，韧性每件 2
  'minecraft:netherite_helmet': { protection: 3, toughness: 2 },
  'minecraft:netherite_chestplate': { protection: 8, toughness: 2 },
  'minecraft:netherite_leggings': { protection: 6, toughness: 2 },
  'minecraft:netherite_boots': { protection: 3, toughness: 2 },

  // 海龟壳：护甲值 2，韧性 0
  'minecraft:turtle_helmet': { protection: 2, toughness: 0 }
}

/** 查询原版盔甲参考数值；非 ArmorItem（含盾牌 / 鞘翅与模组物品）返回 undefined */
export function armorValuesOf(itemId: string): ArmorValues | undefined {
  return Object.prototype.hasOwnProperty.call(ARMOR_VALUES, itemId) ? ARMOR_VALUES[itemId] : undefined
}

/** 该物品是否为 ArmorItem（可否安全设置护甲值与韧性） */
export function isArmorItem(itemId: string): boolean {
  return armorValuesOf(itemId) !== undefined
}
