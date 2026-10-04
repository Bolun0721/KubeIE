import { describe, expect, it } from 'vitest'
import { ARMOR_VALUES, armorValuesOf, isArmorItem } from '../src/shared/data/armorValues'
import { findItem, getAllItems } from '../src/main/itemDatabase'

/**
 * 原版盔甲数值表测试：
 * - 该表同时用于「是否为 ArmorItem」判定（决定能否安全生成 armorProtection / armorToughness）；
 * - 数值需与 MC 1.20.1 原版一致（头盔 | 胸甲 | 护腿 | 靴子）。
 */

describe('ARMOR_VALUES - 原版盔甲参考数值', () => {
  it('收录 25 件 ArmorItem（24 件套装盔甲 + 海龟壳）', () => {
    expect(Object.keys(ARMOR_VALUES)).toHaveLength(25)
    expect(ARMOR_VALUES['minecraft:turtle_helmet']).toEqual({ protection: 2, toughness: 0 })
  })

  it('各套装数值与 MC 1.20.1 一致', () => {
    const expected: Record<string, [number, number, number, number]> = {
      leather: [1, 3, 2, 1],
      golden: [2, 5, 3, 1],
      chainmail: [2, 5, 4, 1],
      iron: [2, 6, 5, 2],
      diamond: [3, 8, 6, 3],
      netherite: [3, 8, 6, 3]
    }
    const slots = ['helmet', 'chestplate', 'leggings', 'boots']

    for (const [material, values] of Object.entries(expected)) {
      slots.forEach((slot, index) => {
        const entry = ARMOR_VALUES[`minecraft:${material}_${slot}`]
        expect(entry, `${material}_${slot} 应存在`).toBeDefined()
        expect(entry.protection, `${material}_${slot} 护甲值`).toBe(values[index])
      })
    }
  })

  it('只有钻石 / 下界合金有韧性（每件 2）', () => {
    for (const [id, values] of Object.entries(ARMOR_VALUES)) {
      const material = id.split(':')[1].split('_')[0]
      expect(values.toughness, `${id} 韧性`).toBe(material === 'diamond' || material === 'netherite' ? 2 : 0)
    }
  })

  it('盾牌与鞘翅不属于 ArmorItem（分类为 armor 但 KubeJS 会拒绝）', () => {
    expect(isArmorItem('minecraft:shield')).toBe(false)
    expect(isArmorItem('minecraft:elytra')).toBe(false)
    expect(armorValuesOf('minecraft:shield')).toBeUndefined()
    expect(isArmorItem('create:brass_chestplate')).toBe(false)
  })

  it('护甲值范围合理（0 ~ 20）', () => {
    for (const values of Object.values(ARMOR_VALUES)) {
      expect(values.protection).toBeGreaterThan(0)
      expect(values.protection).toBeLessThanOrEqual(20)
      expect(values.toughness).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('物品库 armorLike 标记', () => {
  it('24 件套装盔甲与海龟壳标记为 ArmorItem', () => {
    const armorLike = getAllItems().filter((item) => item.armorLike)
    expect(armorLike).toHaveLength(25)
    expect(armorLike.map((item) => item.id)).toContain('minecraft:iron_chestplate')
    expect(armorLike.map((item) => item.id)).toContain('minecraft:turtle_helmet')
  })

  it('盾牌 / 鞘翅虽然分类为 armor，但 armorLike 为 false', () => {
    expect(findItem('minecraft:shield')?.category).toBe('armor')
    expect(findItem('minecraft:shield')?.armorLike).toBe(false)
    expect(findItem('minecraft:elytra')?.category).toBe('armor')
    expect(findItem('minecraft:elytra')?.armorLike).toBe(false)
  })

  it('非盔甲物品不会误标', () => {
    expect(findItem('minecraft:diamond_sword')?.armorLike).toBe(false)
    expect(findItem('minecraft:apple')?.armorLike).toBe(false)
  })
})
