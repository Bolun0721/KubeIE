import { describe, expect, it } from 'vitest'
import { generateScript } from '../src/main/scriptGenerator'
import type { ItemModification } from '../src/shared/types'

function mod(itemId: string, properties: ItemModification['properties']): ItemModification {
  return { itemId, properties }
}

describe('generateScript - Minecraft 1.20.1 / KubeJS 6（默认模板）', () => {
  it('按官方写法生成通用属性', () => {
    const code = generateScript(
      [
        mod('minecraft:ender_pearl', {
          maxStackSize: 64,
          fireResistant: true,
          rarity: 'UNCOMMON'
        })
      ],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toBe(
      [
        'ItemEvents.modification(event => {',
        "    event.modify('minecraft:ender_pearl', item => {",
        '        item.maxStackSize = 64',
        '        item.fireResistant = true',
        "        item.rarity = 'UNCOMMON'",
        '    })',
        '})',
        ''
      ].join('\n')
    )
  })

  it('craftingRemainder 需以 .item 结尾（方案修订 #7）', () => {
    const code = generateScript([mod('minecraft:golden_apple', { craftingRemainder: 'minecraft:scute' })], {
      profileId: 'kjs6-1.20',
      header: false
    })
    expect(code).toContain("item.craftingRemainder = Item.of('minecraft:scute').item")
  })

  it('镐类工具：仅生成挖掘速度；attackDamage 会被忽略（实测 Rhino 找不到该成员）', () => {
    const code = generateScript(
      [
        mod('minecraft:diamond_pickaxe', {
          maxDamage: 1881,
          tier: {
            speed: 8,
            attackDamageBonus: 5,
            level: 4,
            repairIngredient: 'minecraft:diamond'
          }
        })
      ],
      { profileId: 'kjs6-1.20', header: false }
    )

    // 挖掘速度对 DiggerItem 有效
    expect(code).toContain('        item.digSpeed = 8')
    expect(code).not.toContain('tier.speed')
    // 攻击伤害对挖掘类工具无效：只写注释，绝不能生成赋值（否则中断整个事件）
    expect(code).not.toContain('item.attackDamage =')
    expect(code).toContain('// 已忽略攻击伤害加成：挖掘类工具（镐/斧/锹/锄）在 KubeJS 6 下没有 attackDamage 映射')
    // 仅 tier 可设置的属性仍会生成，并附带失效说明注释
    expect(code).toContain('        // 注意：KubeJS 官方已将 tier 回调标记为失效')
    expect(code).toContain('        item.tier = tier => {')
    // 实测：挖掘等级被钳制在铁镐（2），脚本中附带提示注释
    expect(code).toContain('            // 实测：挖掘等级会被限制在铁镐（2）')
    expect(code).toContain('            tier.level = 4')
    expect(code).toContain("            tier.repairIngredient = Item.of('minecraft:diamond').item")
  })

  it('剑类：攻击伤害生效、不生成 digSpeed（两类属性方向相反）', () => {
    const code = generateScript(
      [
        mod('minecraft:iron_sword', {
          maxStackSize: 1,
          maxDamage: 250,
          tier: { speed: 6, attackDamageBonus: 12, level: 2 }
        })
      ],
      { profileId: 'kjs6-1.20', header: false }
    )

    // 剑不是 DiggerItem：digSpeed 会抛 IllegalArgumentException，必须忽略（注释里可出现该属性名）
    expect(code).not.toContain('item.digSpeed =')
    expect(code).toContain('// 已忽略挖掘速度：该物品不是挖掘类工具（镐/斧/锹/锄）')
    // 攻击伤害对剑有效（实测无报错）
    expect(code).toContain('        item.attackDamage = 12')
    // 剑是 TieredItem，tier 代码仍会生成
    expect(code).toContain('        item.tier = tier => {')
  })

  it('盔甲类：不生成 attackDamage（KubeJS 会抛 UnsupportedOperationException）', () => {
    const code = generateScript(
      [mod('minecraft:diamond_chestplate', { maxDamage: 648, tier: { attackDamageBonus: 5 } })],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).not.toContain('item.attackDamage =')
    expect(code).toContain('// 已忽略攻击伤害加成：KubeJS 不支持对盔甲类物品设置 attackDamage')
    expect(code).toContain('        item.maxDamage = 648')
  })

  it('非工具类物品：tier 属性只写注释（KubeJS 的 tier 回调会报错）', () => {
    const code = generateScript([mod('minecraft:shield', { tier: { level: 1 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).not.toContain('item.tier = tier =>')
    expect(code).toContain('// 已忽略挖掘等级 / 修复材料')
  })

  it('模组物品（未收录）：类型未知的属性加 try/catch 保护，不中断整个事件', () => {
    const code = generateScript(
      [
        mod('create:brass_sword', {
          maxStackSize: 1,
          tier: { speed: 7, attackDamageBonus: 8, level: 1 }
        })
      ],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toContain('try { item.digSpeed = 7 } catch (e) {')
    expect(code).toContain('try { item.attackDamage = 8 } catch (e) {')
    expect(code).toContain('try {')
    expect(code).toContain('item.tier = tier => {')
    expect(code).toContain("console.warn('[KubeIE] create:brass_sword 不支持")
  })

  it('食物类物品只生成通用属性，不再生成食物属性代码', () => {
    const code = generateScript(
      [mod('minecraft:cooked_beef', { maxStackSize: 16, maxDamage: 100, rarity: 'RARE' })],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toContain('        item.maxStackSize = 16')
    expect(code).toContain('        item.maxDamage = 100')
    expect(code).toContain("        item.rarity = 'RARE'")
    expect(code).not.toContain('foodProperties')
    expect(code).not.toContain('food.')
  })

  it('食物属性由 FoodTweaker 配置承载，不进入 KubeJS 脚本', () => {
    const code = generateScript(
      [
        mod('minecraft:apple', { foodProperties: { nutrition: 8, eatSeconds: 0.8 } }),
        mod('minecraft:stick', { maxStackSize: 16 })
      ],
      { profileId: 'kjs6-1.20', header: false }
    )

    // 只有食物属性的物品不生成 event.modify，避免产生空的事件块
    expect(code).not.toContain('minecraft:apple')
    expect(code).toContain("event.modify('minecraft:stick'")
    expect(code).not.toContain('nutrition')
  })

  it('队列中只有食物修改时生成空事件块', () => {
    const code = generateScript([mod('minecraft:apple', { foodProperties: { nutrition: 8 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })
    expect(code).toBe(['ItemEvents.modification(event => {', '})', ''].join('\n'))
  })

  it('未填写任何属性的物品不生成 event.modify', () => {
    const code = generateScript(
      [mod('minecraft:stick', {}), mod('minecraft:apple', { maxStackSize: 16 })],
      { profileId: 'kjs6-1.20', header: false }
    )
    expect(code).not.toContain('minecraft:stick')
    expect(code).toContain("event.modify('minecraft:apple'")
  })

  it('同一物品重复出现时只生成一次 event.modify', () => {
    const code = generateScript(
      [
        mod('minecraft:apple', { maxStackSize: 16 }),
        mod('minecraft:apple', { burnTime: 200 })
      ],
      { profileId: 'kjs6-1.20', header: false }
    )
    expect(code.match(/event\.modify\('minecraft:apple'/g)).toHaveLength(1)
    expect(code).toContain('item.burnTime = 200')
  })

  it('队列为空时生成空的事件块', () => {
    const code = generateScript([], { profileId: 'kjs6-1.20', header: false })
    expect(code).toBe(['ItemEvents.modification(event => {', '})', ''].join('\n'))
  })

  it('文件头包含目标环境与热重载提示（方案修订 #2）', () => {
    const code = generateScript([mod('minecraft:apple', { maxStackSize: 16 })], { profileId: 'kjs6-1.20' })
    expect(code).toContain('Minecraft 1.19 ~ 1.20.4 + KubeJS 6')
    expect(code).toContain('/kubejs reload startup_scripts')
  })
})

describe('generateScript - 盔甲属性与攻击速度（KubeJS 6 支持范围）', () => {
  it('盔甲物品直接生成 armorProtection / armorToughness', () => {
    const code = generateScript(
      [mod('minecraft:diamond_chestplate', { armor: { protection: 12, toughness: 4 } })],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toContain('        item.armorProtection = 12')
    expect(code).toContain('        item.armorToughness = 4')
    expect(code).not.toContain('try {')
  })

  it('只填护甲值时不生成韧性行', () => {
    const code = generateScript([mod('minecraft:iron_helmet', { armor: { protection: 5 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).toContain('        item.armorProtection = 5')
    expect(code).not.toContain('armorToughness')
  })

  it('盾牌 / 鞘翅不是 ArmorItem：只写注释，不生成护甲赋值', () => {
    for (const itemId of ['minecraft:shield', 'minecraft:elytra']) {
      const code = generateScript([mod(itemId, { maxDamage: 500, armor: { protection: 10 } })], {
        profileId: 'kjs6-1.20',
        header: false
      })

      expect(code, itemId).toContain('// 已忽略护甲属性：该物品不是盔甲（ArmorItem）')
      expect(code, itemId).not.toContain('item.armorProtection')
      // 其他属性照常生成
      expect(code, itemId).toContain('item.maxDamage = 500')
    }
  })

  it('模组盔甲（未收录）加 try/catch 保护，失败只跳过护甲属性', () => {
    const code = generateScript([mod('create:brass_chestplate', { armor: { protection: 7, toughness: 1 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).toContain('        try {')
    expect(code).toContain('            item.armorProtection = 7')
    expect(code).toContain('            item.armorToughness = 1')
    expect(code).toContain("console.warn('[KubeIE] create:brass_chestplate 不支持护甲属性，已跳过')")
  })

  it('剑类武器的 attackSpeed 直接生成（与 attackDamage 同一实现路径）', () => {
    const code = generateScript(
      [mod('minecraft:iron_sword', { tier: { attackSpeed: -2, attackDamageBonus: 3 } })],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toContain('        item.attackDamage = 3')
    expect(code).toContain('        item.attackSpeed = -2')
    expect(code).not.toContain('try { item.attackSpeed')
  })

  it('挖掘类工具的 attackSpeed 加保护并注明未经实测', () => {
    const code = generateScript([mod('minecraft:diamond_axe', { tier: { attackSpeed: -2 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).toContain('// 攻击速度（修饰值，实际攻速 = 4.0 + 该值）：该物品类型未经实测')
    expect(code).toContain('try { item.attackSpeed = -2 } catch (e) {')
  })

  it('盔甲类物品的 attackSpeed 被忽略（KubeJS 会抛 UnsupportedOperationException）', () => {
    const code = generateScript([mod('minecraft:netherite_chestplate', { tier: { attackSpeed: -1 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).toContain('// 已忽略攻击速度：KubeJS 不支持对盔甲类物品设置 attackSpeed')
    expect(code).not.toContain('item.attackSpeed =')
  })

  it('攻击速度小数保留（修饰值可为 0.5 等）', () => {
    const code = generateScript([mod('minecraft:diamond_sword', { tier: { attackSpeed: -1.5 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).toContain('        item.attackSpeed = -1.5')
  })

  it('只有护甲属性的物品仍会生成 event.modify', () => {
    const code = generateScript([mod('minecraft:leather_helmet', { armor: { protection: 2 } })], {
      profileId: 'kjs6-1.20',
      header: false
    })

    expect(code).toContain("event.modify('minecraft:leather_helmet'")
    expect(code).toContain('item.armorProtection = 2')
  })

  it('护甲属性为空对象时不生成任何行', () => {
    const code = generateScript(
      [mod('minecraft:iron_chestplate', { armor: { protection: null, toughness: null } })],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toBe(['ItemEvents.modification(event => {', '})', ''].join('\n'))
  })
})

describe('generateScript - 其他版本模板', () => {
  it('「不生成 tier 代码」模板忽略 tier 专属属性，仅保留注释', () => {
    const code = generateScript(
      [mod('minecraft:iron_pickaxe', { tier: { speed: 8, attackDamageBonus: 3, level: 2 } })],
      { profileId: 'kjs6-1.20-direct', header: false }
    )
    expect(code).toContain('        item.digSpeed = 8')
    expect(code).not.toContain('item.tier = tier =>')
    expect(code).toContain('当前模板不生成相关代码')
  })

  it('未填 tier 专属属性时不生成 tier 回调', () => {
    const code = generateScript(
      [mod('minecraft:iron_pickaxe', { tier: { speed: 6, attackDamageBonus: 12 } })],
      { profileId: 'kjs6-1.20', header: false }
    )

    expect(code).toContain('        item.digSpeed = 6')
    // 挖掘类工具的攻击伤害被忽略（只写注释）
    expect(code).not.toContain('item.attackDamage =')
    expect(code).toContain('// 已忽略攻击伤害加成：')
    expect(code).not.toContain('item.tier = tier =>')
  })

  it('KubeJS 7（1.21+）模板：通用属性照常生成，不生成 tier 代码', () => {
    const code = generateScript(
      [mod('minecraft:cooked_beef', { maxStackSize: 99, burnTime: 1600, tier: { level: 3 } })],
      { profileId: 'kjs7-1.21', header: false }
    )
    expect(code).toContain('        item.maxStackSize = 99')
    expect(code).toContain('        item.burnTime = 1600')
    expect(code).not.toContain('item.tier = tier =>')
  })
})
