import { describe, expect, it } from 'vitest'
import {
  createEmptyCurio,
  createEmptyCurioLibrary,
  normalizeCurioDef,
  normalizeCurioLibrary,
  type CustomCurioDef,
  type CurioLibrary
} from '../src/shared/curios'
import {
  CURIO_EVENT_CARDS,
  CURIO_EVENT_CATEGORIES,
  MAX_CURIO_EVENTS,
  buildEventContext,
  cardsOfCategory,
  curioEventFlagKey,
  defaultEventParams,
  findEventCard,
  normalizeEventSelection,
  stableUuid
} from '../src/shared/curioEvents'
import { generateCurioEventScript, generateCurioLines, generateCurioScript, hasServerEventCards } from '../src/main/curioGenerator'

/**
 * 事件卡测试：卡片库结构 + 参数规范化 + 脚本生成（capability 卡进饰品脚本、
 * server 卡进 server_scripts 伴随脚本）。
 *
 * 同时守住三条已实机复现的运行时约束：
 * - 不用可选链调用 Java 方法（会崩游戏）；
 * - 不用 entity.tickCount（KubeJS 未暴露）；
 * - 需要全局事件的卡不能写进 startup 脚本。
 */

const EMPTY: CurioLibrary = createEmptyCurioLibrary()

function curio(patch: Partial<CustomCurioDef> = {}): CustomCurioDef {
  return { ...createEmptyCurio(), name: 'my_ring', displayName: '我的戒指', ...patch }
}

function scriptOf(library: Partial<CurioLibrary>): string {
  return generateCurioScript({ ...EMPTY, ...library })
}

describe('事件卡：卡片库结构', () => {
  it('7 个分类，每类 3 张卡，共 21 张', () => {
    expect(CURIO_EVENT_CATEGORIES).toHaveLength(7)
    for (const category of CURIO_EVENT_CATEGORIES) {
      expect(cardsOfCategory(category.id)).toHaveLength(3)
    }
    expect(CURIO_EVENT_CARDS).toHaveLength(21)
  })

  it('卡片 ID 唯一，且有对应的生成函数', () => {
    const ids = CURIO_EVENT_CARDS.map((card) => card.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const card of CURIO_EVENT_CARDS) {
      expect(card.name.length).toBeGreaterThan(0)
      expect(card.summary.length).toBeGreaterThan(0)
      if (card.scope === 'capability') expect(typeof card.capability).toBe('function')
      else expect(typeof card.server).toBe('function')
    }
  })

  it('参数字段完整（key / label / kind / 默认值）', () => {
    for (const card of CURIO_EVENT_CARDS) {
      for (const param of card.params) {
        expect(param.key.length).toBeGreaterThan(0)
        expect(param.label.length).toBeGreaterThan(0)
        expect(['number', 'text', 'effect', 'item', 'block', 'attribute']).toContain(param.kind)
        expect(param.value === '' || param.value === undefined).toBe(false)
      }
    }
  })
})

describe('事件卡：参数规范化', () => {
  it('未知卡片被丢弃', () => {
    expect(normalizeEventSelection({ cardId: 'not.exists' })).toBeNull()
    expect(normalizeEventSelection('nope')).toBeNull()
    expect(normalizeEventSelection(null)).toBeNull()
  })

  it('缺省参数用默认值补齐', () => {
    const selection = normalizeEventSelection({ cardId: 'hurt.regeneration' })
    expect(selection).not.toBeNull()
    expect(selection?.params?.seconds).toBe(10)
    expect(selection?.params?.amplifier).toBe(0)
  })

  it('已有参数覆盖默认值，未知参数被忽略', () => {
    const selection = normalizeEventSelection({
      cardId: 'hurt.regeneration',
      params: { seconds: 30, hacker: 'x' }
    })
    expect(selection?.params?.seconds).toBe(30)
    expect(selection?.params?.hacker).toBeUndefined()
  })

  it('饰品规范化会保留事件卡并去重（上限 8）', () => {
    const def = normalizeCurioDef(
      curio({
        events: [
          { cardId: 'hurt.speed', params: { seconds: 3 } },
          { cardId: 'hurt.speed' },
          { cardId: 'bad.card' }
        ]
      })
    )
    expect(def?.events).toHaveLength(1)
    expect(def?.events[0].params?.seconds).toBe(3)

    const many = Array.from({ length: 20 }, () => ({ cardId: 'hurt.speed' }))
    const over = normalizeCurioDef(curio({ events: many }))
    expect(over?.events.length).toBeLessThanOrEqual(MAX_CURIO_EVENTS)
  })

  it('库里没有事件卡的旧数据回退为空数组', () => {
    const library = normalizeCurioLibrary({ items: [{ name: 'old', namespace: 'kubejs' }] })
    expect(library.items[0].events).toEqual([])
  })
})

describe('事件卡：工具函数', () => {
  it('stableUuid 稳定且格式合法', () => {
    const a = stableUuid('kubejs:my_ring#curse_armor')
    const b = stableUuid('kubejs:my_ring#curse_armor')
    const c = stableUuid('kubejs:my_ring#curse_max_health')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('佩戴标记键只含小写字母数字下划线', () => {
    const key = curioEventFlagKey({ namespace: 'kubejs', name: 'My-Ring.A' })
    expect(key).toBe('kubeie_kubejs_my_ring_a')
  })

  it('defaultEventParams 返回卡片默认值', () => {
    const card = findEventCard('team.resistance')
    expect(card).toBeDefined()
    expect(defaultEventParams(card!).range).toBe(13)
  })

  it('buildEventContext 能读参数并给出稳定 UUID', () => {
    const def = curio({ events: [{ cardId: 'curse.max_health', params: { percent: 35 } }] })
    const ctx = buildEventContext(def, def.events[0])
    expect(ctx.itemId).toBe('kubejs:my_ring')
    expect(ctx.n('percent', 0)).toBe(35)
    expect(ctx.n('missing', 7)).toBe(7)
    expect(ctx.uuid('curse_max_health')).toBe(stableUuid('kubejs:my_ring#curse_max_health'))
  })
})

describe('事件卡：capability 卡写进饰品脚本', () => {
  it('诅咒卡生成负向 addAttribute', () => {
    const code = scriptOf({
      items: [curio({ events: [{ cardId: 'curse.max_health', params: { percent: 20 } }] })]
    })
    const uuid = stableUuid('kubejs:my_ring#curse_max_health')
    expect(code).toContain(
      `.addAttribute('minecraft:generic.max_health', '${uuid}', -0.2, 'multiply_total')`
    )
    expect(code).toContain('// 事件卡：诅咒·虚弱')
  })

  it('特殊类卡使用 Curios 能力钩子', () => {
    const code = scriptOf({
      items: [
        curio({
          events: [{ cardId: 'special.piglin_neutral' }, { cardId: 'special.powder_snow' }]
        })
      ]
    })
    expect(code).toContain('.makesPiglinsNeutral((slotContext, stack) => true)')
    expect(code).toContain('.canWalkOnPowderedSnow((slotContext, stack) => true)')
  })

  it('团队卡生成 curioTick 内 AABB 范围增益', () => {
    const code = scriptOf({
      items: [curio({ events: [{ cardId: 'team.resistance', params: { range: 13, seconds: 5, amplifier: 0 } }] })]
    })
    expect(code).toContain('.curioTick((slotContext, stack) => {')
    expect(code).toContain('const kubeieRange = 6.5')
    expect(code).toContain('const kubeieBox = AABB.of(')
    expect(code).toContain('entity.level.getEntitiesWithin(kubeieBox).forEach(other => {')
    expect(code).toContain("other.potionEffects.add('minecraft:resistance', 100, 0)")
  })

  it('条件卡用 modifyAttribute 且判服务端条件（雨天 / 夜晚 / 低血量）', () => {
    const code = scriptOf({
      items: [
        curio({
          events: [
            { cardId: 'condition.rain_damage', params: { percent: 50 } },
            { cardId: 'condition.night_damage' },
            { cardId: 'condition.low_health_damage' }
          ]
        })
      ]
    })
    expect(code).toContain('.modifyAttribute(ctx => {')
    expect(code).toContain('if (!entity.level.isRaining()) return')
    expect(code).toContain('if (!entity.level.isNight()) return')
    expect(code).toContain('if (entity.health > entity.maxHealth * 0.3) return')
    expect(code).toContain("ctx.modify('minecraft:generic.attack_damage'")
  })

  it('capability 卡不会污染 server_scripts 伴随脚本', () => {
    const library: CurioLibrary = {
      ...EMPTY,
      items: [curio({ events: [{ cardId: 'curse.armor' }] })]
    }
    expect(hasServerEventCards(library)).toBe(false)
    expect(generateCurioEventScript(library)).toContain('无需处理')
  })
})

describe('事件卡：server 卡写进 server_scripts', () => {
  it('击杀成长卡不进 startup 脚本，进事件脚本', () => {
    const library: CurioLibrary = {
      ...EMPTY,
      items: [curio({ events: [{ cardId: 'growth.max_health', params: { value: 2, cap: 10 } }] })]
    }
    const itemCode = generateCurioScript(library)
    const eventCode = generateCurioEventScript(library)

    expect(hasServerEventCards(library)).toBe(true)
    // startup 脚本里不能出现全局事件
    expect(itemCode).not.toContain('EntityEvents')
    expect(itemCode).not.toContain('BlockEvents')
    // 事件脚本里有
    expect(eventCode).toContain('EntityEvents.death(event => {')
    expect(eventCode).toContain('// 我的戒指 · 击杀成长·最大生命')
    expect(eventCode).toContain("if (event.entity.isPlayer()) return")
    expect(eventCode).toContain("player.modifyAttribute('minecraft:generic.max_health'")
    expect(eventCode).toContain(', gained + 2, \'addition\')')
    expect(eventCode).toContain('if (gained >= 10) return')
  })

  it('server 卡会在饰品脚本里维护"已佩戴"标记', () => {
    const code = scriptOf({
      items: [curio({ events: [{ cardId: 'hurt.regeneration' }] })]
    })
    const flag = 'kubeie_kubejs_my_ring'
    expect(code).toContain(`entity.persistentData.putBoolean('${flag}', true)`)
    expect(code).toContain(`if (entity) entity.persistentData.putBoolean('${flag}', false)`)
  })

  it('事件脚本按佩戴标记判断，且不含可选链 / tickCount', () => {
    const library: CurioLibrary = {
      ...EMPTY,
      items: [
        curio({
          events: [
            { cardId: 'hurt.resistance', params: { seconds: 5, amplifier: 1 } },
            { cardId: 'block.extra_xp', params: { chance: 20, amount: 3 } }
          ]
        })
      ]
    }
    const code = generateCurioEventScript(library)
    expect(code).toContain("if (!player.persistentData.getBoolean('kubeie_kubejs_my_ring')) return")
    expect(code).toContain('EntityEvents.hurt(event => {')
    expect(code).toContain("player.potionEffects.add('minecraft:resistance', 100, 1)")
    expect(code).toContain('BlockEvents.broken(event => {')
    expect(code).toContain('player.addXP(3)')
    expect(code).not.toContain('?.')
    expect(code).not.toContain('.tickCount')
  })

  it('破坏方块卡按概率额外掉落', () => {
    const library: CurioLibrary = {
      ...EMPTY,
      items: [
        curio({
          events: [{ cardId: 'block.extra_ore', params: { blockId: 'minecraft:stone', itemId: 'minecraft:iron_ore', chance: 10 } }]
        })
      ]
    }
    const code = generateCurioEventScript(library)
    expect(code).toContain("if (event.block.id !== 'minecraft:stone') return")
    expect(code).toContain('if (Math.random() > 0.1) return')
    expect(code).toContain("event.block.popItem('minecraft:iron_ore')")
  })

  it('多个饰品的事件卡按顺序拼接', () => {
    const library: CurioLibrary = {
      ...EMPTY,
      items: [
        curio({ name: 'a', displayName: '甲', events: [{ cardId: 'hurt.speed' }] }),
        curio({ name: 'b', displayName: '乙', events: [{ cardId: 'growth.strength' }] })
      ]
    }
    const code = generateCurioEventScript(library)
    expect(code.indexOf('// 甲 · 受伤后·速度提升')).toBeLessThan(code.indexOf('// 乙 · 击杀成长·力量'))
  })

  it('没有 server 卡时伴随脚本给出提示', () => {
    const code = generateCurioEventScript({ ...EMPTY, items: [curio()] })
    expect(code).toContain('无需处理')
    expect(code).not.toContain('EntityEvents')
  })
})

describe('事件卡：整体约束', () => {
  it('生成的所有脚本都不含可选链与 tickCount', () => {
    const library: CurioLibrary = {
      ...EMPTY,
      items: [
        curio({
          equipMessage: '戴上',
          unequipMessage: '取下',
          effects: [{ id: 'minecraft:night_vision', durationSeconds: 8, amplifier: 0 }],
          events: [
            { cardId: 'team.speed' },
            { cardId: 'condition.rain_damage' },
            { cardId: 'special.fall_damage' },
            { cardId: 'growth.strength' },
            { cardId: 'hurt.regeneration' }
          ]
        })
      ]
    }
    expect(generateCurioScript(library)).not.toContain('?.')
    expect(generateCurioEventScript(library)).not.toContain('?.')
    expect(generateCurioScript(library)).not.toContain('.tickCount')
    expect(generateCurioEventScript(library)).not.toContain('.tickCount')
  })

  it('上一版功能（属性 / 效果 / 提示）不受影响', () => {
    const code = generateCurioLines(
      curio({
        attributes: [
          { id: 'minecraft:generic.max_health', uuid: stableUuid('x'), value: 6, operation: 'addition' }
        ],
        effects: [{ id: 'minecraft:night_vision', durationSeconds: 8, amplifier: 0 }],
        equipMessage: 'hello'
      })
    ).join('\n')

    expect(code).toContain(".addAttribute('minecraft:generic.max_health'")
    expect(code).toContain("if (entity.potionEffects.getDuration('minecraft:night_vision') <= 140)")
    expect(code).toContain("if (entity && entity.isPlayer()) entity.tell(Component.literal('§ahello'))")
  })
})
