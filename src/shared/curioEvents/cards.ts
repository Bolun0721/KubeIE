import type { CurioEventCard, CurioEventCategory } from './types'

/**
 * 饰品事件卡（脚本语句模板）库。
 *
 * 7 个分类 × 3 张卡 = 21 张，参考 MC 1.20.1 Forge 可用事件与 Curios 能力钩子整理：
 * - growth    成长类：击杀生物后永久变强
 * - hurt      受伤触发类：受伤后立刻获得效果
 * - condition 条件限制类：满足条件（雨天/夜晚/低血量）时增伤
 * - block     方块破坏类：破坏方块时额外产出
 * - curse     诅咒类：佩戴代价（属性下降）
 * - team      团队增益类：佩戴者与周围玩家一起获得效果
 * - special   特殊类：使用 Curios 能力钩子的特性
 *
 * 组合规则：卡片之间互不干扰，可任意叠加；capability 卡按顺序写进饰品的
 * `.attachCuriosCapability(...)`，server 卡按顺序追加到 server_scripts 事件脚本。
 *
 * 模板约定（KubeJS 6 运行时约束，踩过坑）：
 * - 禁止用可选链调用 Java 方法（`a?.b()` 会丢失接收者 → 游戏崩溃）；
 * - 禁止用 `entity.tickCount`（KubeJS 未暴露该字段 → 取模得 NaN，静默失效）；
 * - 影响状态的代码一律先判服务端（`entity.level.isClientSide()`），否则会翻倍。
 */

/** JS 单引号字符串字面量转义 */
function q(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 秒 → tick */
function ticks(seconds: number): number {
  return Math.max(1, Math.round(seconds * 20))
}

/** 百分比 → 乘区小数（50 → 0.5） */
function ratio(percent: number): string {
  return String(Math.round((percent / 100) * 1000) / 1000)
}

export const CURIO_EVENT_CATEGORIES: CurioEventCategory[] = [
  { id: 'growth', label: '成长类', summary: '击杀生物后永久变强（最大生命 / 攻击 / 力量）' },
  { id: 'hurt', label: '受伤触发类', summary: '受伤后立刻获得增益效果' },
  { id: 'condition', label: '条件限制类', summary: '满足条件时提高造成的伤害' },
  { id: 'block', label: '方块破坏类', summary: '破坏方块时额外掉落 / 获得经验' },
  { id: 'curse', label: '诅咒类', summary: '佩戴代价：属性下降' },
  { id: 'team', label: '团队增益类', summary: '佩戴者与周围玩家一起获得效果' },
  { id: 'special', label: '特殊类', summary: 'Curios 能力钩子带来的特性' }
]

/* ------------------------------------------------------------------ */
/* 复用的代码片段                                                        */
/* ------------------------------------------------------------------ */

/** server 卡通用的「击杀者 + 佩戴标记」开头 */
function killHead(ctx: { flagKey: string }): string[] {
  return [
    'EntityEvents.death(event => {',
    '  const player = event.source ? event.source.player : null',
    '  if (!player) return',
    `  if (!player.persistentData.getBoolean(${q(ctx.flagKey)})) return`,
    '  if (event.entity.isPlayer()) return'
  ]
}

/** server 卡通用的「受伤者 = 佩戴者」开头 */
function hurtHead(ctx: { flagKey: string }): string[] {
  return [
    'EntityEvents.hurt(event => {',
    '  const player = event.entity',
    '  if (!player || !player.isPlayer()) return',
    `  if (!player.persistentData.getBoolean(${q(ctx.flagKey)})) return`
  ]
}

/** server 卡通用的「破坏方块者 = 佩戴者」开头 */
function breakHead(ctx: { flagKey: string }): string[] {
  return [
    'BlockEvents.broken(event => {',
    '  const player = event.player',
    '  if (!player) return',
    `  if (!player.persistentData.getBoolean(${q(ctx.flagKey)})) return`
  ]
}

/** 团队卡：范围内玩家统一施加效果（按剩余时间节流，避免每 tick 重复） */
function teamEffectTick(effectId: string, range: number, seconds: number, amplifier: number): string[] {
  const duration = ticks(seconds)
  const refreshBelow = Math.max(0, duration - 20)
  const radius = Math.max(1, range) / 2
  return [
    `const kubeieRange = ${radius}`,
    'const kubeieBox = AABB.of(',
    '  entity.x - kubeieRange, entity.y - kubeieRange, entity.z - kubeieRange,',
    '  entity.x + kubeieRange, entity.y + kubeieRange, entity.z + kubeieRange',
    ')',
    'entity.level.getEntitiesWithin(kubeieBox).forEach(other => {',
    '  if (!other.isPlayer()) return',
    `  if (other.potionEffects.getDuration(${q(effectId)}) > ${refreshBelow}) return`,
    `  other.potionEffects.add(${q(effectId)}, ${duration}, ${Math.trunc(amplifier)})`,
    '})'
  ]
}

/* ------------------------------------------------------------------ */
/* 卡片库                                                              */
/* ------------------------------------------------------------------ */

export const CURIO_EVENT_CARDS: CurioEventCard[] = [
  /* ---------------- 成长类 ---------------- */
  {
    id: 'growth.max_health',
    category: 'growth',
    name: '击杀成长·最大生命',
    summary: '每击杀一个生物，最大生命值永久 +N（有上限）',
    scope: 'server',
    params: [
      { key: 'value', label: '每次增加', kind: 'number', value: 1, min: 1, max: 20, suffix: '点' },
      { key: 'cap', label: '最多累计', kind: 'number', value: 20, min: 1, max: 200, suffix: '点' }
    ],
    server: (ctx) => {
      const per = ctx.n('value', 1)
      const cap = ctx.n('cap', 20)
      return {
        blocks: [
          ...killHead(ctx),
          `  const key = ${q(`${ctx.flagKey}_max_health`)}`,
          '  const gained = player.persistentData.getInt(key)',
          `  if (gained >= ${cap}) return`,
          `  player.persistentData.putInt(key, gained + ${per})`,
          `  player.modifyAttribute('minecraft:generic.max_health', ${q(ctx.uuid('growth_max_health'))}, gained + ${per}, 'addition')`,
          '})'
        ]
      }
    }
  },
  {
    id: 'growth.attack_damage',
    category: 'growth',
    name: '击杀成长·攻击伤害',
    summary: '每击杀一个生物，攻击伤害永久 +N（有上限）',
    scope: 'server',
    params: [
      { key: 'value', label: '每次增加', kind: 'number', value: 1, min: 1, max: 10, suffix: '点' },
      { key: 'cap', label: '最多累计', kind: 'number', value: 10, min: 1, max: 100, suffix: '点' }
    ],
    server: (ctx) => {
      const per = ctx.n('value', 1)
      const cap = ctx.n('cap', 10)
      return {
        blocks: [
          ...killHead(ctx),
          `  const key = ${q(`${ctx.flagKey}_attack_damage`)}`,
          '  const gained = player.persistentData.getInt(key)',
          `  if (gained >= ${cap}) return`,
          `  player.persistentData.putInt(key, gained + ${per})`,
          `  player.modifyAttribute('minecraft:generic.attack_damage', ${q(ctx.uuid('growth_attack_damage'))}, gained + ${per}, 'addition')`,
          '})'
        ]
      }
    }
  },
  {
    id: 'growth.strength',
    category: 'growth',
    name: '击杀成长·力量',
    summary: '击杀生物后获得力量效果',
    scope: 'server',
    params: [
      { key: 'seconds', label: '持续', kind: 'number', value: 5, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 1, min: 0, max: 4, hint: '0 表示 I 级' }
    ],
    server: (ctx) => ({
      blocks: [
        ...killHead(ctx),
        `  player.potionEffects.add('minecraft:strength', ${ticks(ctx.n('seconds', 5))}, ${Math.trunc(ctx.n('amplifier', 1))})`,
        '})'
      ]
    })
  },

  /* ---------------- 受伤触发类 ---------------- */
  {
    id: 'hurt.regeneration',
    category: 'hurt',
    name: '受伤后·生命恢复',
    summary: '受到伤害后立刻获得生命恢复效果',
    scope: 'server',
    params: [
      { key: 'seconds', label: '持续', kind: 'number', value: 10, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 0, min: 0, max: 4, hint: '0 表示 I 级' }
    ],
    server: (ctx) => ({
      blocks: [
        ...hurtHead(ctx),
        `  player.potionEffects.add('minecraft:regeneration', ${ticks(ctx.n('seconds', 10))}, ${Math.trunc(ctx.n('amplifier', 0))})`,
        '})'
      ]
    })
  },
  {
    id: 'hurt.resistance',
    category: 'hurt',
    name: '受伤后·抗性提升',
    summary: '受到伤害后立刻获得抗性提升效果',
    scope: 'server',
    params: [
      { key: 'seconds', label: '持续', kind: 'number', value: 5, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 0, min: 0, max: 3, hint: '0 表示 I 级' }
    ],
    server: (ctx) => ({
      blocks: [
        ...hurtHead(ctx),
        `  player.potionEffects.add('minecraft:resistance', ${ticks(ctx.n('seconds', 5))}, ${Math.trunc(ctx.n('amplifier', 0))})`,
        '})'
      ]
    })
  },
  {
    id: 'hurt.speed',
    category: 'hurt',
    name: '受伤后·速度提升',
    summary: '受到伤害后立刻获得速度提升（方便撤离）',
    scope: 'server',
    params: [
      { key: 'seconds', label: '持续', kind: 'number', value: 5, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 0, min: 0, max: 4, hint: '0 表示 I 级' }
    ],
    server: (ctx) => ({
      blocks: [
        ...hurtHead(ctx),
        `  player.potionEffects.add('minecraft:speed', ${ticks(ctx.n('seconds', 5))}, ${Math.trunc(ctx.n('amplifier', 0))})`,
        '})'
      ]
    })
  },

  /* ---------------- 条件限制类 ---------------- */
  {
    id: 'condition.rain_damage',
    category: 'condition',
    name: '雨天增伤',
    summary: '雨天时佩戴者造成的伤害提高 N%',
    scope: 'capability',
    params: [{ key: 'percent', label: '提高', kind: 'number', value: 50, min: 1, max: 500, suffix: '%' }],
    capability: (ctx) => ({
      chain: [
        '.modifyAttribute(ctx => {',
        '  if (!ctx.slotContext) return',
        '  const entity = ctx.slotContext.entity()',
        '  if (!entity) return',
        '  if (!entity.level.isRaining()) return',
        `  ctx.modify('minecraft:generic.attack_damage', ${q(ctx.uuid('condition_rain'))}, ${ratio(ctx.n('percent', 50))}, 'multiply_total')`,
        '})'
      ]
    })
  },
  {
    id: 'condition.night_damage',
    category: 'condition',
    name: '夜晚增伤',
    summary: '夜晚时佩戴者造成的伤害提高 N%',
    scope: 'capability',
    params: [{ key: 'percent', label: '提高', kind: 'number', value: 30, min: 1, max: 500, suffix: '%' }],
    capability: (ctx) => ({
      chain: [
        '.modifyAttribute(ctx => {',
        '  if (!ctx.slotContext) return',
        '  const entity = ctx.slotContext.entity()',
        '  if (!entity) return',
        '  if (!entity.level.isNight()) return',
        `  ctx.modify('minecraft:generic.attack_damage', ${q(ctx.uuid('condition_night'))}, ${ratio(ctx.n('percent', 30))}, 'multiply_total')`,
        '})'
      ]
    })
  },
  {
    id: 'condition.low_health_damage',
    category: 'condition',
    name: '背水一战',
    summary: '生命值低于 N% 时造成的伤害提高 M%',
    scope: 'capability',
    params: [
      { key: 'threshold', label: '触发血量', kind: 'number', value: 30, min: 1, max: 99, suffix: '%' },
      { key: 'percent', label: '提高', kind: 'number', value: 50, min: 1, max: 500, suffix: '%' }
    ],
    capability: (ctx) => ({
      chain: [
        '.modifyAttribute(ctx => {',
        '  if (!ctx.slotContext) return',
        '  const entity = ctx.slotContext.entity()',
        '  if (!entity) return',
        `  if (entity.health > entity.maxHealth * ${ratio(ctx.n('threshold', 30))}) return`,
        `  ctx.modify('minecraft:generic.attack_damage', ${q(ctx.uuid('condition_low_health'))}, ${ratio(ctx.n('percent', 50))}, 'multiply_total')`,
        '})'
      ]
    })
  },

  /* ---------------- 方块破坏类 ---------------- */
  {
    id: 'block.extra_ore',
    category: 'block',
    name: '挖石得矿',
    summary: '破坏指定方块时，N% 概率额外掉落指定物品',
    scope: 'server',
    params: [
      { key: 'blockId', label: '破坏方块', kind: 'block', value: 'minecraft:stone' },
      { key: 'itemId', label: '额外掉落', kind: 'item', value: 'minecraft:iron_ore' },
      { key: 'chance', label: '概率', kind: 'number', value: 10, min: 1, max: 100, suffix: '%' }
    ],
    server: (ctx) => ({
      blocks: [
        ...breakHead(ctx),
        `  if (event.block.id !== ${q(ctx.s('blockId', 'minecraft:stone'))}) return`,
        `  if (Math.random() > ${ratio(ctx.n('chance', 10))}) return`,
        `  event.block.popItem(${q(ctx.s('itemId', 'minecraft:iron_ore'))})`,
        '})'
      ]
    })
  },
  {
    id: 'block.extra_log',
    category: 'block',
    name: '伐木得果',
    summary: '破坏原木时，N% 概率额外掉落苹果',
    scope: 'server',
    params: [
      { key: 'blockId', label: '破坏方块', kind: 'block', value: 'minecraft:oak_log' },
      { key: 'itemId', label: '额外掉落', kind: 'item', value: 'minecraft:apple' },
      { key: 'chance', label: '概率', kind: 'number', value: 5, min: 1, max: 100, suffix: '%' }
    ],
    server: (ctx) => ({
      blocks: [
        ...breakHead(ctx),
        `  if (event.block.id !== ${q(ctx.s('blockId', 'minecraft:oak_log'))}) return`,
        `  if (Math.random() > ${ratio(ctx.n('chance', 5))}) return`,
        `  event.block.popItem(${q(ctx.s('itemId', 'minecraft:apple'))})`,
        '})'
      ]
    })
  },
  {
    id: 'block.extra_xp',
    category: 'block',
    name: '破坏得经验',
    summary: '破坏方块时，N% 概率额外获得经验',
    scope: 'server',
    params: [
      { key: 'chance', label: '概率', kind: 'number', value: 20, min: 1, max: 100, suffix: '%' },
      { key: 'amount', label: '经验', kind: 'number', value: 1, min: 1, max: 100, suffix: '点' }
    ],
    server: (ctx) => ({
      blocks: [
        ...breakHead(ctx),
        `  if (Math.random() > ${ratio(ctx.n('chance', 20))}) return`,
        `  player.addXP(${Math.trunc(ctx.n('amount', 1))})`,
        '})'
      ]
    })
  },

  /* ---------------- 诅咒类 ---------------- */
  {
    id: 'curse.max_health',
    category: 'curse',
    name: '诅咒·虚弱',
    summary: '佩戴时最大生命值降低 N%',
    scope: 'capability',
    params: [{ key: 'percent', label: '降低', kind: 'number', value: 20, min: 1, max: 90, suffix: '%' }],
    capability: (ctx) => ({
      chain: [
        `.addAttribute('minecraft:generic.max_health', ${q(ctx.uuid('curse_max_health'))}, -${ratio(ctx.n('percent', 20))}, 'multiply_total')`
      ]
    })
  },
  {
    id: 'curse.attack_damage',
    category: 'curse',
    name: '诅咒·钝锋',
    summary: '佩戴时攻击伤害降低 N%',
    scope: 'capability',
    params: [{ key: 'percent', label: '降低', kind: 'number', value: 20, min: 1, max: 90, suffix: '%' }],
    capability: (ctx) => ({
      chain: [
        `.addAttribute('minecraft:generic.attack_damage', ${q(ctx.uuid('curse_attack_damage'))}, -${ratio(ctx.n('percent', 20))}, 'multiply_total')`
      ]
    })
  },
  {
    id: 'curse.armor',
    category: 'curse',
    name: '诅咒·脆甲',
    summary: '佩戴时护甲值降低 N 点（更容易受伤）',
    scope: 'capability',
    params: [{ key: 'value', label: '降低', kind: 'number', value: 4, min: 1, max: 30, suffix: '点' }],
    capability: (ctx) => ({
      chain: [
        `.addAttribute('minecraft:generic.armor', ${q(ctx.uuid('curse_armor'))}, -${ctx.n('value', 4)}, 'addition')`
      ]
    })
  },

  /* ---------------- 团队增益类 ---------------- */
  {
    id: 'team.resistance',
    category: 'team',
    name: '团队·抗性提升',
    summary: '佩戴者与范围内所有玩家一起获得抗性提升',
    scope: 'capability',
    params: [
      { key: 'range', label: '范围', kind: 'number', value: 13, min: 1, max: 65, suffix: '格' },
      { key: 'seconds', label: '持续', kind: 'number', value: 5, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 0, min: 0, max: 3, hint: '0 表示 I 级' }
    ],
    capability: (ctx) => ({
      tick: teamEffectTick(
        'minecraft:resistance',
        ctx.n('range', 13),
        ctx.n('seconds', 5),
        ctx.n('amplifier', 0)
      )
    })
  },
  {
    id: 'team.regeneration',
    category: 'team',
    name: '团队·生命恢复',
    summary: '佩戴者与范围内所有玩家一起获得生命恢复',
    scope: 'capability',
    params: [
      { key: 'range', label: '范围', kind: 'number', value: 13, min: 1, max: 65, suffix: '格' },
      { key: 'seconds', label: '持续', kind: 'number', value: 5, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 0, min: 0, max: 3, hint: '0 表示 I 级' }
    ],
    capability: (ctx) => ({
      tick: teamEffectTick(
        'minecraft:regeneration',
        ctx.n('range', 13),
        ctx.n('seconds', 5),
        ctx.n('amplifier', 0)
      )
    })
  },
  {
    id: 'team.speed',
    category: 'team',
    name: '团队·速度提升',
    summary: '佩戴者与范围内所有玩家一起获得速度提升',
    scope: 'capability',
    params: [
      { key: 'range', label: '范围', kind: 'number', value: 13, min: 1, max: 65, suffix: '格' },
      { key: 'seconds', label: '持续', kind: 'number', value: 5, min: 1, max: 60, suffix: '秒' },
      { key: 'amplifier', label: '等级', kind: 'number', value: 0, min: 0, max: 4, hint: '0 表示 I 级' }
    ],
    capability: (ctx) => ({
      tick: teamEffectTick('minecraft:speed', ctx.n('range', 13), ctx.n('seconds', 5), ctx.n('amplifier', 0))
    })
  },

  /* ---------------- 特殊类 ---------------- */
  {
    id: 'special.piglin_neutral',
    category: 'special',
    name: '猪灵友好',
    summary: '佩戴时猪灵不再主动攻击佩戴者',
    scope: 'capability',
    params: [],
    capability: () => ({
      chain: ['.makesPiglinsNeutral((slotContext, stack) => true)']
    })
  },
  {
    id: 'special.powder_snow',
    category: 'special',
    name: '细雪行者',
    summary: '佩戴时可以在细雪上行走而不陷入',
    scope: 'capability',
    params: [],
    capability: () => ({
      chain: ['.canWalkOnPowderedSnow((slotContext, stack) => true)']
    })
  },
  {
    id: 'special.fall_damage',
    category: 'special',
    name: '羽落',
    summary: '佩戴时摔落伤害降低 N%',
    scope: 'capability',
    params: [{ key: 'percent', label: '降低', kind: 'number', value: 50, min: 1, max: 100, suffix: '%' }],
    capability: (ctx) => ({
      chain: [
        `.addAttribute('minecraft:generic.fall_damage_multiplier', ${q(ctx.uuid('special_fall_damage'))}, -${ratio(ctx.n('percent', 50))}, 'multiply_total')`
      ]
    })
  }
]

/** 按 ID 查卡片 */
export function findEventCard(cardId: string): CurioEventCard | undefined {
  return CURIO_EVENT_CARDS.find((card) => card.id === cardId)
}

/** 分类下的卡片 */
export function cardsOfCategory(categoryId: string): CurioEventCard[] {
  return CURIO_EVENT_CARDS.filter((card) => card.category === categoryId)
}
