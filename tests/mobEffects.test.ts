import { describe, expect, it } from 'vitest'
import {
  MOB_EFFECTS,
  MOB_EFFECT_CATEGORIES,
  MOB_EFFECT_CATEGORY_LABELS,
  MOB_EFFECT_OPTION_GROUPS
} from '../src/shared/data/mobEffects'
import { isValidItemId } from '../src/shared/validation'

/**
 * 药水效果数据表测试（数据来源：MC 1.20.1 原版全部状态效果，用于食物属性的「食用效果」下拉选择）。
 */

describe('MOB_EFFECTS - 原版 1.20.1 效果表', () => {
  it('共收录 33 种效果，且 ID 唯一、格式合法', () => {
    expect(MOB_EFFECTS).toHaveLength(33)

    const ids = MOB_EFFECTS.map((effect) => effect.id)
    expect(new Set(ids).size).toBe(33)
    for (const id of ids) {
      expect(isValidItemId(id)).toBe(true)
      expect(id.startsWith('minecraft:')).toBe(true)
    }
  })

  it('三种类别的数量分别为 18 / 13 / 2', () => {
    const count = (category: string): number => MOB_EFFECTS.filter((e) => e.category === category).length
    expect(count('beneficial')).toBe(18)
    expect(count('harmful')).toBe(13)
    expect(count('neutral')).toBe(2)
  })

  it('每个效果都有中文名，且类别合法', () => {
    for (const effect of MOB_EFFECTS) {
      expect(effect.name.length).toBeGreaterThan(0)
      expect(MOB_EFFECT_CATEGORIES).toContain(effect.category)
    }
  })

  it('包含常用效果与容易写错的边界情况', () => {
    const ids = MOB_EFFECTS.map((effect) => effect.id)
    for (const id of [
      'minecraft:speed',
      'minecraft:regeneration',
      'minecraft:absorption',
      'minecraft:hunger',
      'minecraft:wither',
      'minecraft:hero_of_the_village'
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('不包含 1.21 才加入的效果（避免生成无效配置）', () => {
    const ids = MOB_EFFECTS.map((effect) => effect.id)
    expect(ids).not.toContain('minecraft:trial_omen')
    expect(ids).not.toContain('minecraft:raid_omen')
  })
})

describe('MOB_EFFECT_OPTION_GROUPS - 下拉选项', () => {
  it('按类别分为三组，且选项总数与数据表一致', () => {
    expect(MOB_EFFECT_OPTION_GROUPS).toHaveLength(3)
    expect(MOB_EFFECT_OPTION_GROUPS.map((group) => group.label)).toEqual([
      MOB_EFFECT_CATEGORY_LABELS.beneficial,
      MOB_EFFECT_CATEGORY_LABELS.harmful,
      MOB_EFFECT_CATEGORY_LABELS.neutral
    ])

    const total = MOB_EFFECT_OPTION_GROUPS.reduce((sum, group) => sum + group.options.length, 0)
    expect(total).toBe(MOB_EFFECTS.length)
  })

  it('选项值为命名空间 ID，标签含中文名与 ID（便于按中文或 ID 搜索）', () => {
    const options = MOB_EFFECT_OPTION_GROUPS.flatMap((group) => group.options)
    const speed = options.find((option) => option.value === 'minecraft:speed')

    expect(speed?.label).toContain('迅捷')
    expect(speed?.label).toContain('minecraft:speed')
    expect(options.every((option) => isValidItemId(option.value))).toBe(true)
  })
})
