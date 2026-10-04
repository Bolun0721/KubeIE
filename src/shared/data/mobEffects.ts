/**
 * 原版 Minecraft 1.20.1（Forge 47.x）的全部 33 种状态效果（MobEffect）。
 *
 * 数据依据 MC 1.20.1 原版注册表整理（Forge 本体不新增效果；模组可注册自定义效果）。
 * 用于食物属性的「食用效果」下拉选择；模组效果 ID 仍可直接手动输入。
 */

export type MobEffectCategory = 'beneficial' | 'harmful' | 'neutral'

export interface MobEffectEntry {
  /** 命名空间 ID，如 minecraft:speed */
  id: string
  /** 中文名 */
  name: string
  category: MobEffectCategory
}

export const MOB_EFFECT_CATEGORY_LABELS: Record<MobEffectCategory, string> = {
  beneficial: '有益效果',
  harmful: '负面效果',
  neutral: '中性效果'
}

/** 下拉列表按此顺序分组展示 */
export const MOB_EFFECT_CATEGORIES: MobEffectCategory[] = ['beneficial', 'harmful', 'neutral']

export const MOB_EFFECTS: MobEffectEntry[] = [
  // 有益效果（18）
  { id: 'minecraft:absorption', name: '伤害吸收', category: 'beneficial' },
  { id: 'minecraft:conduit_power', name: '潮涌能量', category: 'beneficial' },
  { id: 'minecraft:dolphins_grace', name: '海豚的恩惠', category: 'beneficial' },
  { id: 'minecraft:fire_resistance', name: '防火', category: 'beneficial' },
  { id: 'minecraft:haste', name: '急迫', category: 'beneficial' },
  { id: 'minecraft:health_boost', name: '生命提升', category: 'beneficial' },
  { id: 'minecraft:instant_health', name: '瞬间治疗', category: 'beneficial' },
  { id: 'minecraft:invisibility', name: '隐身', category: 'beneficial' },
  { id: 'minecraft:jump_boost', name: '跳跃提升', category: 'beneficial' },
  { id: 'minecraft:luck', name: '幸运', category: 'beneficial' },
  { id: 'minecraft:night_vision', name: '夜视', category: 'beneficial' },
  { id: 'minecraft:regeneration', name: '生命恢复', category: 'beneficial' },
  { id: 'minecraft:resistance', name: '抗性提升', category: 'beneficial' },
  { id: 'minecraft:saturation', name: '饱和', category: 'beneficial' },
  { id: 'minecraft:slow_falling', name: '缓降', category: 'beneficial' },
  { id: 'minecraft:speed', name: '迅捷', category: 'beneficial' },
  { id: 'minecraft:strength', name: '力量', category: 'beneficial' },
  { id: 'minecraft:water_breathing', name: '水下呼吸', category: 'beneficial' },

  // 负面效果（13）
  { id: 'minecraft:bad_omen', name: '不祥之兆', category: 'harmful' },
  { id: 'minecraft:blindness', name: '失明', category: 'harmful' },
  { id: 'minecraft:darkness', name: '黑暗', category: 'harmful' },
  { id: 'minecraft:hunger', name: '饥饿', category: 'harmful' },
  { id: 'minecraft:instant_damage', name: '瞬间伤害', category: 'harmful' },
  { id: 'minecraft:levitation', name: '飘浮', category: 'harmful' },
  { id: 'minecraft:mining_fatigue', name: '挖掘疲劳', category: 'harmful' },
  { id: 'minecraft:nausea', name: '反胃', category: 'harmful' },
  { id: 'minecraft:poison', name: '中毒', category: 'harmful' },
  { id: 'minecraft:slowness', name: '缓慢', category: 'harmful' },
  { id: 'minecraft:unluck', name: '霉运', category: 'harmful' },
  { id: 'minecraft:weakness', name: '虚弱', category: 'harmful' },
  { id: 'minecraft:wither', name: '凋零', category: 'harmful' },

  // 中性效果（2）
  { id: 'minecraft:glowing', name: '发光', category: 'neutral' },
  { id: 'minecraft:hero_of_the_village', name: '村庄英雄', category: 'neutral' }
]

export interface MobEffectOption {
  value: string
  label: string
}

export interface MobEffectOptionGroup {
  label: string
  options: MobEffectOption[]
}

/** 供下拉选择使用的分组选项（标签形如「迅捷（minecraft:speed）」，可按中文名或 ID 搜索） */
export const MOB_EFFECT_OPTION_GROUPS: MobEffectOptionGroup[] = MOB_EFFECT_CATEGORIES.map((category) => ({
  label: MOB_EFFECT_CATEGORY_LABELS[category],
  options: MOB_EFFECTS.filter((effect) => effect.category === category).map((effect) => ({
    value: effect.id,
    label: `${effect.name}（${effect.id}）`
  }))
}))
