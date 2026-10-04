import { describe, expect, it } from 'vitest'
import {
  RARITIES,
  hasAnyProperty,
  hasFoodProperty,
  hasScriptProperty,
  isValidItemId,
  sanitizeScriptFileName,
  validateModification,
  validateModifications
} from '../src/shared/validation'
import type { ItemModification } from '../src/shared/types'

function mod(itemId: string, properties: ItemModification['properties']): ItemModification {
  return { itemId, properties }
}

describe('isValidItemId', () => {
  it('接受合法注册名', () => {
    expect(isValidItemId('minecraft:ender_pearl')).toBe(true)
    expect(isValidItemId('create:brass_ingot')).toBe(true)
    expect(isValidItemId('minecraft:bookshelf/1')).toBe(true)
  })

  it('拒绝非法注册名', () => {
    expect(isValidItemId('ender_pearl')).toBe(false)
    expect(isValidItemId('Minecraft:Ender_Pearl')).toBe(false)
    expect(isValidItemId('minecraft:')).toBe(false)
    expect(isValidItemId('')).toBe(false)
    expect(isValidItemId(undefined)).toBe(false)
  })
})

describe('sanitizeScriptFileName', () => {
  it('保留合法文件名', () => {
    expect(sanitizeScriptFileName('item_modifications.js')).toBe('item_modifications.js')
    expect(sanitizeScriptFileName('my-items_v2.js')).toBe('my-items_v2.js')
  })

  it('剥离目录部分，防止路径穿越', () => {
    expect(sanitizeScriptFileName('../evil.js')).toBe('evil.js')
    expect(sanitizeScriptFileName('..\\..\\evil.js')).toBe('evil.js')
    expect(sanitizeScriptFileName('C:\\windows\\system32\\evil.js')).toBe('evil.js')
  })

  it('拒绝非 .js 与隐藏文件名', () => {
    expect(sanitizeScriptFileName('script.txt')).toBe('')
    expect(sanitizeScriptFileName('.hidden.js')).toBe('')
    expect(sanitizeScriptFileName('a b.js')).toBe('')
    expect(sanitizeScriptFileName('')).toBe('')
  })
})

describe('validateModification - 属性约束（方案 6.3）', () => {
  it('maxStackSize 在 KubeJS 6 / MC 1.20.1 下上限为 64', () => {
    expect(validateModification(mod('minecraft:apple', { maxStackSize: 64 }), 'kjs6-1.20').errors).toHaveLength(0)

    const overflow = validateModification(mod('minecraft:apple', { maxStackSize: 65 }), 'kjs6-1.20')
    expect(overflow.errors[0]).toContain('上限为 64')

    const tooBig = validateModification(mod('minecraft:apple', { maxStackSize: 99 }), 'kjs6-1.20')
    expect(tooBig.errors).toHaveLength(1)
  })

  it('maxStackSize 在 1.21+ 数据组件模板下放宽至 99', () => {
    expect(validateModification(mod('minecraft:apple', { maxStackSize: 99 }), 'kjs7-1.21').errors).toHaveLength(0)
    expect(validateModification(mod('minecraft:apple', { maxStackSize: 100 }), 'kjs7-1.21').errors).toHaveLength(1)
  })

  it('maxStackSize 必须为不小于 1 的整数', () => {
    expect(validateModification(mod('minecraft:apple', { maxStackSize: 1.5 })).errors[0]).toContain('必须为整数')
    expect(validateModification(mod('minecraft:apple', { maxStackSize: 0 })).errors[0]).toContain('不能小于 1')
  })

  it('rarity 必须是四个大写取值之一（方案修订 #1 附录）', () => {
    for (const rarity of RARITIES) {
      expect(validateModification(mod('minecraft:apple', { rarity })).errors).toHaveLength(0)
    }
    expect(
      validateModification(mod('minecraft:apple', { rarity: 'common' as never })).errors[0]
    ).toContain('COMMON / UNCOMMON / RARE / EPIC')
  })

  it('物品 ID 非法时直接报错', () => {
    const result = validateModification(mod('apple', { maxStackSize: 16 }))
    expect(result.errors[0]).toContain('物品 ID 非法')
  })

  it('未设置任何属性时给出警告', () => {
    expect(validateModification(mod('minecraft:apple', {})).warnings[0]).toContain('未设置任何属性')
  })

  it('工具属性范围校验', () => {
    expect(validateModification(mod('minecraft:diamond_sword', { tier: { speed: 120 } })).errors[0]).toContain(
      '0 ~ 100'
    )
    expect(validateModification(mod('minecraft:diamond_sword', { tier: { level: 256 } })).errors[0]).toContain(
      '0 ~ 255'
    )
    expect(
      validateModification(mod('minecraft:diamond_sword', { tier: { repairIngredient: 'diamond' } })).errors[0]
    ).toContain('不是合法物品 ID')
  })

  it('挖掘等级 / 修复材料 提示 tier 回调已失效（issue #662）', () => {
    const result = validateModification(
      mod('minecraft:iron_pickaxe', {
        tier: { level: 1, repairIngredient: 'minecraft:iron_ingot' }
      })
    )
    const warnings = result.warnings.join('\n')
    expect(warnings).toContain('挖掘等级')
    expect(warnings).toContain('修复材料')
    expect(warnings).toContain('issue #662')
    expect(warnings).not.toContain('附魔值')
    // 实测：挖掘等级被钳制在铁镐（2）
    expect(warnings).toContain('限制在铁镐（2）')
    expect(result.errors).toHaveLength(0)
  })

  it('挖掘速度 / 攻击伤害加成不再提示（已改用直接属性）', () => {
    const result = validateModification(
      mod('minecraft:iron_sword', { tier: { speed: 6, attackDamageBonus: 12 } })
    )
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('KubeJS 7 模板下通用属性照常校验，且不再产生食物相关提示', () => {
    const result = validateModification(mod('minecraft:cooked_beef', { maxStackSize: 99 }), 'kjs7-1.21')
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.join('\n')).not.toContain('食物')
  })
})

describe('validateModifications - 批量校验', () => {
  it('汇总错误并提示重复物品', () => {
    const result = validateModifications([
      mod('minecraft:apple', { maxStackSize: 16 }),
      mod('minecraft:apple', { maxStackSize: 16 }),
      mod('minecraft:stone', { maxStackSize: 200 })
    ])

    expect(result.errors).toHaveLength(1)
    expect(result.warnings.join('\n')).toContain('重复出现')
  })
})

describe('validateModification - 食物属性（FoodTweaker 语义）', () => {
  it('营养值必须为整数且不为负；超过 20 仅提示', () => {
    expect(validateModification(mod('minecraft:apple', { foodProperties: { nutrition: 8 } })).errors).toHaveLength(0)
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { nutrition: 1.5 } })).errors[0]
    ).toContain('nutrition 必须为整数')
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { nutrition: -1 } })).errors[0]
    ).toContain('不能为负数')

    const overflow = validateModification(mod('minecraft:apple', { foodProperties: { nutrition: 30 } }))
    expect(overflow.errors).toHaveLength(0)
    expect(overflow.warnings.join('\n')).toContain('超过饥饿值上限 20')
  })

  it('饱和度倍率为非负数值，远超原版范围时提示', () => {
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { saturation: 1.2 } })).errors
    ).toHaveLength(0)
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { saturation: -0.5 } })).errors[0]
    ).toContain('不能为负数')

    const big = validateModification(mod('minecraft:apple', { foodProperties: { saturation: 8 } }))
    expect(big.errors).toHaveLength(0)
    expect(big.warnings.join('\n')).toContain('远超原版范围')
  })

  it('食用耗时必须大于 0；非两档数值给出提示（1.20.1 只区分快速与标准）', () => {
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { eatSeconds: 0.8 } })).warnings
    ).toHaveLength(0)
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { eatSeconds: 1.6 } })).warnings
    ).toHaveLength(0)
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { eatSeconds: 0 } })).errors[0]
    ).toContain('必须大于 0')

    const middle = validateModification(mod('minecraft:apple', { foodProperties: { eatSeconds: 1.0 } }))
    expect(middle.errors).toHaveLength(0)
    expect(middle.warnings.join('\n')).toContain('只区分两档食用速度')
  })

  it('随时可食用必须为布尔值', () => {
    expect(
      validateModification(mod('minecraft:apple', { foodProperties: { canAlwaysEat: true } })).errors
    ).toHaveLength(0)
    expect(
      validateModification(
        mod('minecraft:apple', { foodProperties: { canAlwaysEat: 'yes' as never } })
      ).errors[0]
    ).toContain('必须为布尔值')
  })

  it('食用效果校验：ID / 等级 / 持续秒数 / 概率', () => {
    const ok = validateModification(
      mod('minecraft:apple', {
        foodProperties: {
          effects: [{ id: 'minecraft:speed', amplifier: 0, durationSeconds: 10, probability: 0.5 }]
        }
      })
    )
    expect(ok.errors).toHaveLength(0)

    const bad = validateModification(
      mod('minecraft:apple', {
        foodProperties: {
          effects: [{ id: 'speed', amplifier: 300, durationSeconds: -1, probability: 1.5 }]
        }
      })
    )
    const errors = bad.errors.join('\n')
    expect(errors).toContain('药水效果 ID 非法')
    expect(errors).toContain('amplifier 应为 0 ~ 255')
    expect(errors).toContain('durationSeconds 应大于 0')
    expect(errors).toContain('probability 应为 0.0 ~ 1.0')

    expect(
      validateModification(
        mod('minecraft:apple', {
          foodProperties: {
            effects: [{ id: 'minecraft:speed', amplifier: 0, durationSeconds: 7200, probability: 1 }]
          }
        })
      ).errors[0]
    ).toContain('超过 3600 秒')
  })

  it('食物属性全为空时提示不会写入', () => {
    const result = validateModification(mod('minecraft:apple', { foodProperties: {} }))
    expect(result.warnings.join('\n')).toContain('食物属性未填写有效内容')
  })

  it('清除标记（remove）跳过字段校验', () => {
    const result = validateModification(
      mod('minecraft:apple', { foodProperties: { remove: true, nutrition: -5 } })
    )
    expect(result.errors).toHaveLength(0)
  })
})

describe('validateModification - 攻击速度与护甲属性', () => {
  it('攻击速度修饰值：超出合理范围仅提示', () => {
    expect(
      validateModification(mod('minecraft:iron_sword', { tier: { attackSpeed: -2.4 } })).errors
    ).toHaveLength(0)
    // 边界：-4（实际攻速 0）
    expect(validateModification(mod('minecraft:iron_sword', { tier: { attackSpeed: -4 } })).errors).toHaveLength(0)

    expect(
      validateModification(mod('minecraft:iron_sword', { tier: { attackSpeed: 1 } })).warnings.join('\n')
    ).toContain('几乎没有攻击冷却')
    expect(
      validateModification(mod('minecraft:iron_sword', { tier: { attackSpeed: -5 } })).warnings.join('\n')
    ).toContain('无法正常攻击')
    expect(
      validateModification(mod('minecraft:iron_sword', { tier: { attackSpeed: 'x' as never } })).errors[0]
    ).toContain('attackSpeed 必须为数值')
  })

  it('护甲值：非负数值，超过 20 仅提示', () => {
    expect(
      validateModification(mod('minecraft:iron_chestplate', { armor: { protection: 8 } })).errors
    ).toHaveLength(0)
    // 边界：0 与 20
    expect(
      validateModification(mod('minecraft:iron_chestplate', { armor: { protection: 0 } })).errors
    ).toHaveLength(0)
    expect(
      validateModification(mod('minecraft:iron_chestplate', { armor: { protection: 20 } })).warnings
    ).toHaveLength(0)

    expect(
      validateModification(mod('minecraft:iron_chestplate', { armor: { protection: -1 } })).errors[0]
    ).toContain('不能为负数')
    expect(
      validateModification(mod('minecraft:iron_chestplate', { armor: { protection: 21 } })).warnings.join('\n')
    ).toContain('超过护甲条满格值 20')
  })

  it('盔甲韧性：非负数值，超过 20 仅提示', () => {
    expect(
      validateModification(mod('minecraft:diamond_chestplate', { armor: { toughness: 2 } })).errors
    ).toHaveLength(0)
    expect(
      validateModification(mod('minecraft:diamond_chestplate', { armor: { toughness: -0.5 } })).errors[0]
    ).toContain('不能为负数')
    expect(
      validateModification(mod('minecraft:diamond_chestplate', { armor: { toughness: 30 } })).warnings.join('\n')
    ).toContain('远超原版范围')
  })

  it('护甲属性全为空时提示会被忽略', () => {
    const result = validateModification(mod('minecraft:iron_chestplate', { armor: {} }))
    expect(result.warnings.join('\n')).toContain('护甲属性未填写有效内容')
  })

  it('护甲属性计入脚本属性（不会因队列判定为空而跳过）', () => {
    expect(hasScriptProperty({ armor: { protection: 6 } })).toBe(true)
    expect(hasAnyProperty({ armor: { toughness: 2 } })).toBe(true)
    expect(hasFoodProperty({ armor: { protection: 6 } })).toBe(false)
    expect(hasScriptProperty({ armor: { protection: null, toughness: null } })).toBe(false)
  })
})

describe('属性存在性判定（脚本 / 食物分流）', () => {
  it('食物属性不计入脚本属性', () => {
    expect(hasScriptProperty({ foodProperties: { nutrition: 8 } })).toBe(false)
    expect(hasFoodProperty({ foodProperties: { nutrition: 8 } })).toBe(true)
    expect(hasAnyProperty({ foodProperties: { nutrition: 8 } })).toBe(true)
  })

  it('通用属性不计入食物属性', () => {
    expect(hasScriptProperty({ maxStackSize: 64 })).toBe(true)
    expect(hasFoodProperty({ maxStackSize: 64 })).toBe(false)
    expect(hasAnyProperty({ maxStackSize: 64 })).toBe(true)
  })

  it('清除标记视为有效的食物修改', () => {
    expect(hasFoodProperty({ foodProperties: { remove: true } })).toBe(true)
    expect(hasAnyProperty({ foodProperties: { remove: true } })).toBe(true)
  })

  it('空对象与 null 都不算有效属性', () => {
    expect(hasAnyProperty({})).toBe(false)
    expect(hasAnyProperty({ foodProperties: {} })).toBe(false)
    expect(hasAnyProperty(null)).toBe(false)
    expect(hasScriptProperty(undefined)).toBe(false)
  })
})
