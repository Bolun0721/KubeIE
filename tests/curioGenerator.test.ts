import { describe, expect, it } from 'vitest'
import {
  createEmptyCurio,
  createEmptyCurioLibrary,
  createUuid,
  type CustomCurioDef,
  type CurioLibrary
} from '../src/shared/curios'
import { generateCurioLines, generateCurioScript } from '../src/main/curioGenerator'

/**
 * 饰品脚本生成器测试：断言生成代码与真实 jar 反编译结果一致。
 * 重点回归两处**教程里写错、会导致整份脚本加载失败**的 KubeJS 5 写法：
 * - `java('java.util.UUID')` → KubeJS 6 已移除（游戏日志：'java()' is no longer supported），
 *   addAttribute 的第二个参数本来就是 UUID 字符串；
 * - `entity.addEffect(...)` → KubeJS 6 没有该方法，效果应为 entity.potionEffects.add(...)。
 * 另外回归两个"运行时才暴露"的坑：
 * - 可选链 `entity?.isPlayer()` 会丢失接收者 → 穿戴时崩溃；
 * - `entity.tickCount` 在 KubeJS 里不存在 → `% n` 得到 NaN，效果永不生效（改用效果剩余时间节流）。
 * 同时断言**不生成渲染代码**（教程与需求均明确不做特效渲染自定义）。
 */

const EMPTY: CurioLibrary = createEmptyCurioLibrary()

function scriptOf(library: Partial<CurioLibrary>): string {
  return generateCurioScript({ ...EMPTY, ...library })
}

function curio(patch: Partial<CustomCurioDef> = {}): CustomCurioDef {
  return { ...createEmptyCurio(), name: 'fire_charm', ...patch }
}

describe('饰品脚本：整体结构', () => {
  it('头部说明包含前置模组与重启提示', () => {
    const code = scriptOf({})
    expect(code).toContain('Minecraft 1.20.1 + Forge + KubeJS 6 + Curios + kubejs_curios')
    expect(code).toContain('重启游戏')
    expect(code).toContain('textures/item/<物品ID>.png')
  })

  it('空库给出提示注释', () => {
    const code = scriptOf({})
    expect(code).toContain("StartupEvents.registry('item', event => {")
    expect(code).toContain('// 饰品库为空')
    expect(code).not.toContain('java.util.UUID')
  })

  it('不使用 KubeJS 6 已移除的 java()，也没有不存在的 entity.addEffect', () => {
    const code = scriptOf({
      items: [
        curio({
          attributes: [{ id: 'minecraft:generic.max_health', uuid: createUuid(), value: 6, operation: 'addition' }],
          effects: [{ id: 'minecraft:night_vision', durationSeconds: 10, amplifier: 0 }]
        })
      ]
    })
    // 回归：java() 会让 KubeJS 6 报错并导致整份 startup 脚本加载失败
    expect(code).not.toContain('java(')
    expect(code).not.toContain('$UUID')
    // 回归：KubeJS 6 的效果 API 是 entity.potionEffects.add(...)
    expect(code).not.toContain('.addEffect(')
  })

  it('不生成任何渲染（renderer）代码', () => {
    const code = scriptOf({
      items: [curio({ displayName: '火焰护符' })]
    })
    expect(code).not.toContain('CuriosJSEvents')
    expect(code).not.toContain('registerRenderer')
    expect(code).toContain('不包含渲染（renderer）代码')
  })

  it('脚本以换行结尾且不含 CRLF', () => {
    const code = scriptOf({ items: [curio()] })
    expect(code.endsWith('\n')).toBe(true)
    expect(code.includes('\r')).toBe(false)
  })

  it('忽略未命名饰品（避免生成非法脚本）', () => {
    expect(generateCurioLines(curio({ name: '' }))).toEqual([])
    expect(scriptOf({ items: [curio({ name: '  ' })] })).toContain('// 饰品库为空')
  })
})

describe('饰品脚本：物品与槽位', () => {
  it('生成带命名空间的 create 与槽位标签', () => {
    const code = generateCurioLines(
      curio({ displayName: '火焰护符', texture: 'kubejs:item/fire_charm', rarity: 'UNCOMMON' })
    ).join('\n')

    expect(code).toContain("event.create('kubejs:fire_charm')")
    expect(code).toContain(".displayName('火焰护符')")
    expect(code).toContain(".texture('kubejs:item/fire_charm')")
    expect(code).toContain('.maxStackSize(1)')
    expect(code).toContain(".rarity('uncommon')")
    expect(code).toContain(".tag('curios:charm')")
    expect(code).toContain('.attachCuriosCapability(')
    expect(code).toContain('CuriosJSCapabilityBuilder.create()')
  })

  it('槽位决定标签（戒指 / 项链等）', () => {
    expect(generateCurioLines(curio({ slot: 'ring' })).join('\n')).toContain(".tag('curios:ring')")
    expect(generateCurioLines(curio({ slot: 'necklace' })).join('\n')).toContain(".tag('curios:necklace')")
  })

  it('未填字段不生成调用', () => {
    const code = generateCurioLines(curio({ texture: '', rarity: null, maxStackSize: null })).join('\n')
    expect(code).not.toContain('.texture(')
    expect(code).not.toContain('.rarity(')
    expect(code).not.toContain('.maxStackSize(')
  })

  it('发光 / 抗火 / 多行提示文本', () => {
    const code = generateCurioLines(
      curio({ glow: true, fireResistant: true, tooltip: '第一行\n第二行' })
    ).join('\n')
    expect(code).toContain('.glow(true)')
    expect(code).toContain('.fireResistant(true)')
    expect(code).toContain(".tooltip('第一行')")
    expect(code).toContain(".tooltip('第二行')")
  })

  it('单引号与反斜杠被转义', () => {
    const code = generateCurioLines(curio({ displayName: "it's a \\ test" })).join('\n')
    expect(code).toContain(".displayName('it\\'s a \\\\ test')")
  })
})

describe('饰品脚本：能力与事件', () => {
  it('属性加成的 UUID 以字符串传入（真实签名第二个参数是 String）', () => {
    const uuid = createUuid()
    const code = scriptOf({
      items: [
        curio({
          attributes: [
            { id: 'minecraft:generic.max_health', uuid, value: 6, operation: 'addition' },
            { id: 'minecraft:generic.movement_speed', uuid: createUuid(), value: -0.05, operation: 'multiply_total' }
          ]
        })
      ]
    })

    expect(code).toContain(`.addAttribute('minecraft:generic.max_health', '${uuid}', 6, 'addition')`)
    expect(code).toContain("'multiply_total')")
    expect(code).not.toContain('fromString')
  })

  it('佩戴 / 取下提示生成 onEquip / onUnequip', () => {
    const code = generateCurioLines(
      curio({ equipMessage: '已佩戴火焰护符', unequipMessage: '已取下火焰护符' })
    ).join('\n')

    expect(code).toContain('.onEquip((slotContext, oldStack, newStack) => {')
    expect(code).toContain('.onUnequip((slotContext, oldStack, newStack) => {')
    expect(code).toContain("entity.tell(Component.literal('§a已佩戴火焰护符'))")
    expect(code).toContain("entity.tell(Component.literal('§7已取下火焰护符'))")
    // 回归：玩家判断必须写成 entity && entity.isPlayer()，不能用可选链
    expect(code).toContain('if (entity && entity.isPlayer())')
    expect(code).not.toContain('?.')
  })

  it('回归：不生成可选链（?.）调用 Java 方法', () => {
    // KubeJS 的 Rhino 在 `entity?.isPlayer()` 这类可选链调用中会丢失接收者，
    // 抛 EvaluatorException 并让游戏在穿戴饰品时崩溃退出。
    const code = scriptOf({
      items: [
        curio({
          equipMessage: '已佩戴',
          unequipMessage: '已取下',
          effects: [{ id: 'minecraft:night_vision', durationSeconds: 8, amplifier: 0 }]
        })
      ]
    })
    expect(code).not.toContain('?.')
    expect(code).toContain('entity && entity.isPlayer()')
  })

  it('未填提示时不生成事件', () => {
    const code = generateCurioLines(curio()).join('\n')
    expect(code).not.toContain('.onEquip(')
    expect(code).not.toContain('.onUnequip(')
  })

  it('提示文本自带颜色代码时不再重复添加', () => {
    const code = generateCurioLines(curio({ equipMessage: '§e自带颜色' })).join('\n')
    expect(code).toContain("Component.literal('§e自带颜色')")
    expect(code).not.toContain('§a§e')
  })

  it('效果生成 curioTick：秒 → tick、按剩余时间节流、服务端判断', () => {
    const code = generateCurioLines(
      curio({
        effectIntervalSeconds: 2,
        effects: [{ id: 'minecraft:night_vision', durationSeconds: 11, amplifier: 1 }]
      })
    ).join('\n')

    expect(code).toContain('.curioTick((slotContext, stack) => {')
    expect(code).toContain('if (!entity || entity.level.isClientSide()) return')
    // 回归：KubeJS 的 entity 没有 tickCount 字段，取模会得到 NaN 导致永远 return、效果永不生效
    expect(code).not.toContain('.tickCount')
    // 11s = 220 tick，间隔 2s = 40 tick → 剩余 ≤ 180 时续期
    expect(code).toContain(
      "if (entity.potionEffects.getDuration('minecraft:night_vision') <= 180) " +
        "entity.potionEffects.add('minecraft:night_vision', 220, 1)"
    )
  })

  it('未配置效果时不生成 curioTick', () => {
    expect(generateCurioLines(curio()).join('\n')).not.toContain('.curioTick(')
  })

  it('可佩戴 / 可脱下开关决定返回值', () => {
    expect(generateCurioLines(curio()).join('\n')).toContain('.canEquip((slotContext, stack) => true)')
    expect(generateCurioLines(curio()).join('\n')).toContain('.canUnequip((slotContext, stack) => true)')
    expect(
      generateCurioLines(curio({ canEquip: false, canUnequip: false })).join('\n')
    ).toContain('.canEquip((slotContext, stack) => false)')
  })
})

describe('饰品脚本：完整库', () => {
  it('多个饰品按顺序生成，能力块闭合', () => {
    const code = scriptOf({
      items: [curio({ name: 'a' }), curio({ name: 'b', slot: 'ring' })]
    })
    expect(code.indexOf("event.create('kubejs:a')")).toBeLessThan(code.indexOf("event.create('kubejs:b')"))
    expect(code.match(/attachCuriosCapability\(/g)).toHaveLength(2)
    expect(code.trimEnd().endsWith('})')).toBe(true)
  })

  it('复现用户实例：head + ring 两个饰品生成合法 KubeJS 6 脚本', () => {
    const code = scriptOf({
      items: [
        curio({
          name: 'my_head',
          displayName: 'head',
          slot: 'head',
          texture: 'kubejs:item/my_head',
          attributes: [
            { id: 'minecraft:generic.max_health', uuid: createUuid(), value: 20, operation: 'addition' }
          ],
          equipMessage: 'hello',
          unequipMessage: 'bye',
          effectIntervalSeconds: 1,
          effects: [{ id: 'minecraft:mining_fatigue', durationSeconds: 10, amplifier: 1 }]
        }),
        curio({
          name: 'my_ring',
          displayName: '我的戒指',
          slot: 'ring',
          fireResistant: true,
          tooltip: '114514',
          attributes: [
            { id: 'minecraft:generic.armor', uuid: createUuid(), value: 2, operation: 'multiply_base' }
          ],
          equipMessage: '333',
          canUnequip: false,
          effectIntervalSeconds: 5,
          effects: [{ id: 'minecraft:night_vision', durationSeconds: 8, amplifier: 0 }]
        })
      ]
    })

    expect(code).toContain("event.create('kubejs:my_head')")
    expect(code).toContain("event.create('kubejs:my_ring')")
    expect(code).toContain(".tag('curios:head')")
    expect(code).toContain(".tag('curios:ring')")
    expect(code).toContain(".fireResistant(true)")
    expect(code).toContain(".tooltip('114514')")
    expect(code).toContain("'multiply_base')")
    // 效果按剩余时间节流（10s=200 tick，间隔 1s=20 tick → 剩余 ≤ 180 时续期）
    expect(code).toContain(
      "if (entity.potionEffects.getDuration('minecraft:mining_fatigue') <= 180) " +
        "entity.potionEffects.add('minecraft:mining_fatigue', 200, 1)"
    )
    expect(code).toContain('.canUnequip((slotContext, stack) => false)')
    // 脚本必须能在 KubeJS 6 下加载并安全运行
    expect(code).not.toContain('java(')
    expect(code).not.toContain('.addEffect(')
    // 回归：穿脱提示用 entity && entity.isPlayer()，不用可选链（否则穿戴即崩）
    expect(code).toContain('if (entity && entity.isPlayer())')
    expect(code).not.toContain('?.')
    // 回归：不能用 tickCount 取模（KubeJS 未暴露该字段，会导致效果永不生效）
    expect(code).not.toContain('.tickCount')
  })
})
