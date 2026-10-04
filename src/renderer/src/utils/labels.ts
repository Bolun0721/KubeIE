import type { ItemCategory, Rarity } from '@shared/types'

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  general: '通用',
  material: '材料',
  block: '方块',
  food: '食物',
  tool: '工具',
  weapon: '武器',
  armor: '装备',
  misc: '其他'
}

export const RARITY_LABELS: Record<Rarity, string> = {
  COMMON: '普通 COMMON',
  UNCOMMON: '罕见 UNCOMMON',
  RARE: '稀有 RARE',
  EPIC: '史诗 EPIC'
}

export function categoryLabel(category: ItemCategory | ''): string {
  if (!category) return '未知'
  return CATEGORY_LABELS[category] ?? category
}

export function rarityLabel(rarity: Rarity): string {
  return RARITY_LABELS[rarity] ?? rarity
}

/** 药水等级展示：amplifier 从 0 开始（0 = I 级） */
export function romanLevel(amplifier: number | null | undefined): string {
  if (amplifier == null) return '-'
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  return numerals[amplifier] ?? String(amplifier + 1)
}
