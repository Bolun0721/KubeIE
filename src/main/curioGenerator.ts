import { curioId, curiosTag, type CustomCurioDef, type CurioLibrary } from '@shared/curios'
import { buildEventContext, findEventCard } from '@shared/curioEvents'

/**
 * 自定义饰品脚本生成（KubeJS 6 / MC 1.20.1 Forge + Curios + kubejs_curios）。
 *
 * 依据《KubeJS 自定义 Curios 饰品教程》，但**已对照真实 jar 反编译核实并修正教程中的 KubeJS 5 写法**：
 * - 属性加成：`addAttribute(ResourceLocation, String uuid, double, Operation)`（kubejs_curios 1.0.4
 *   CapabilityCurios 方法签名）—— 第二个参数是 **UUID 字符串**，不需要 `java('java.util.UUID')`
 *   （KubeJS 6 已移除 `java()`，用了会直接报 “'java()' is no longer supported” 并整份脚本加载失败）；
 * - 每 tick 效果：KubeJS 6 没有 `entity.addEffect(...)`，正确写法是
 *   `entity.potionEffects.add(id, durationTicks, amplifier)`（EntityPotionEffectsJS.add）。
 *
 * 另外三个**运行时**才暴露的坑（都已在实机复现过）：
 * - 可选链 `entity?.xxx()` 调用 Java 方法会丢失接收者 → 穿戴时崩游戏；
 * - `entity.tickCount` KubeJS 未暴露 → 取模得 NaN，表现为"不报错但效果永不生效"；
 * - 全局事件（击杀/受伤/破坏方块）只能写在 server_scripts，不能写在 startup。
 *
 * 事件卡（见 shared/curioEvents）分两种作用域：
 * - capability：写进 `.attachCuriosCapability(...)`（本文件）；
 * - server：写进 server_scripts 的伴随脚本（generateCurioEventScript）。
 */

const HEADER = [
  '// ===== Curios 自定义饰品（由 KubeIE生成）=====',
  '// 目标环境：Minecraft 1.20.1 + Forge + KubeJS 6 + Curios + kubejs_curios',
  '// 前置：必须同时安装 Curios 与 kubejs_curios，否则 attachCuriosCapability / CuriosJSCapabilityBuilder 不存在',
  '// 生效方式：必须**重启游戏**（物品注册属于启动阶段，/kubejs reload startup_scripts 不保证生效）',
  '// 槽位：靠 curios:xxx 标签决定，标签写错会放不进槽位',
  '// 贴图：请把 PNG 放到 kubejs/assets/<命名空间>/textures/item/<物品ID>.png',
  '// 注意：KubeJS 6 已移除 java 函数；addAttribute 的 UUID 直接写字符串，效果用 entity.potionEffects.add(...)',
  '// 注意：KubeJS 的实体对象没有 tickCount 字段，别用取模节流；本文件改用效果剩余时间（getDuration）节流',
  '// 注意：绝对不要用可选链（entity 后接问号点）调用 Java 方法，KubeJS 的 Rhino 会丢失接收者并让游戏崩溃；请用 entity && entity.isPlayer()',
  '// 注意：需要全局事件（击杀/受伤/破坏方块）的事件卡写在 server_scripts 的伴随脚本里，本文件不含这些',
  '// 说明：本文件不包含渲染（renderer）代码，饰品照常可用，只是身上不显示模型'
]

const EVENT_HEADER = [
  '// ===== Curios 饰品事件（由 KubeIE生成）=====',
  '// 目标环境：Minecraft 1.20.1 + Forge + KubeJS 6 + Curios + kubejs_curios',
  '// 说明：击杀 / 受伤 / 破坏方块等属于 KubeJS 的**服务端事件**，只能放在 server_scripts',
  '// 生效方式：可用 /kubejs reload server_scripts 热重载；重启游戏同样生效',
  '// 佩戴判断：饰品本体的 curioTick 会把 persistentData 标记置为 true，脱下时置为 false',
  '// 注意：绝对不要用可选链（entity 后接问号点）调用 Java 方法，会丢失接收者并让游戏崩溃',
  '// 注意：不要用实体的 tickCount 字段做节流（KubeJS 未暴露该字段，取模会得到 NaN）'
]

/** JS 字符串字面量转义 */
function quote(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 数字字面量：整数省略小数点 */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

/** 提示文本按行拆分（与物品 tooltip 一致，每行一条） */
function tooltipLines(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** 补颜色代码：文本自带 § 颜色时不再重复添加 */
function colorize(message: string, color: string): string {
  return message.startsWith('§') ? message : `${color}${message}`
}

/** 按缩进前缀把多行代码块展开 */
function indent(lines: string[], prefix: string): string[] {
  return lines.map((line) => (line === '' ? '' : `${prefix}${line}`))
}

/** 单个饰品的事件卡拆分结果 */
interface CurioEventPlan {
  /** capability 链上的追加代码（8 空格缩进前） */
  chain: string[]
  /** curioTick 回调体追加代码 */
  tick: string[]
  /** onEquip / onUnequip 回调体追加代码 */
  equip: string[]
  unequip: string[]
  /** 是否有 server 作用域卡片（需要在 curioTick/onUnequip 维护"已佩戴"标记） */
  needsFlag: boolean
  flagKey: string
}

function planEvents(def: CustomCurioDef): CurioEventPlan {
  const plan: CurioEventPlan = { chain: [], tick: [], equip: [], unequip: [], needsFlag: false, flagKey: '' }
  const selections = def.events ?? []
  if (selections.length === 0) return plan

  for (const selection of selections) {
    const card = findEventCard(selection.cardId)
    if (!card) continue
    const ctx = buildEventContext(def, selection)
    if (card.scope === 'server') {
      plan.needsFlag = true
      plan.flagKey = ctx.flagKey
      continue
    }
    const patch = card.capability ? card.capability(ctx) : null
    if (!patch) continue
    if (patch.chain && patch.chain.length > 0) {
      plan.chain.push(`// 事件卡：${card.name}`, ...patch.chain)
    }
    if (patch.tick && patch.tick.length > 0) {
      plan.tick.push(`// 事件卡：${card.name}`, ...patch.tick)
    }
    if (patch.equip && patch.equip.length > 0) {
      plan.equip.push(`// 事件卡：${card.name}`, ...patch.equip)
    }
    if (patch.unequip && patch.unequip.length > 0) {
      plan.unequip.push(`// 事件卡：${card.name}`, ...patch.unequip)
    }
  }
  return plan
}

/** 单个饰品的生成行 */
export function generateCurioLines(def: CustomCurioDef): string[] {
  const name = (def.name ?? '').trim()
  // 未命名饰品无法生成合法脚本（调用方应已过滤，这里再兜一层）
  if (!name) return []

  const id = curioId(def)
  const lines: string[] = []
  lines.push(`  // ${(def.displayName ?? '').trim() || name}（槽位 ${def.slot}）`)
  lines.push(`  event.create(${quote(id)})`)

  if ((def.displayName ?? '').trim()) lines.push(`    .displayName(${quote(def.displayName.trim())})`)
  if ((def.texture ?? '').trim()) lines.push(`    .texture(${quote(def.texture.trim())})`)
  if (def.maxStackSize != null) lines.push(`    .maxStackSize(${num(def.maxStackSize)})`)
  if (def.rarity) lines.push(`    .rarity(${quote(def.rarity.toLowerCase())})`)
  if (def.glow) lines.push('    .glow(true)')
  if (def.fireResistant) lines.push('    .fireResistant(true)')
  for (const line of tooltipLines(def.tooltip ?? '')) {
    lines.push(`    .tooltip(${quote(line)})`)
  }

  // 槽位标签：决定饰品能放进哪个栏位
  lines.push(`    .tag(${quote(curiosTag(def.slot))})`)

  const plan = planEvents(def)

  /* ---------------- 回调体内容 ---------------- */

  const equipBody: string[] = []
  if (plan.needsFlag && plan.flagKey) {
    equipBody.push(`entity.persistentData.putBoolean(${quote(plan.flagKey)}, true)`)
  }
  const equipMessage = (def.equipMessage ?? '').trim()
  if (equipMessage) {
    equipBody.push(
      `if (entity && entity.isPlayer()) entity.tell(Component.literal(${quote(colorize(equipMessage, '§a'))}))`
    )
  }
  equipBody.push(...plan.equip)

  const unequipBody: string[] = []
  if (plan.needsFlag && plan.flagKey) {
    unequipBody.push(`if (entity) entity.persistentData.putBoolean(${quote(plan.flagKey)}, false)`)
  }
  const unequipMessage = (def.unequipMessage ?? '').trim()
  if (unequipMessage) {
    unequipBody.push(
      `if (entity && entity.isPlayer()) entity.tell(Component.literal(${quote(colorize(unequipMessage, '§7'))}))`
    )
  }
  unequipBody.push(...plan.unequip)

  const tickBody: string[] = []
  if (plan.needsFlag && plan.flagKey) {
    tickBody.push(`entity.persistentData.putBoolean(${quote(plan.flagKey)}, true)`)
  }
  const effects = (def.effects ?? []).filter((effect) => (effect.id ?? '').trim() !== '')
  if (effects.length > 0) {
    const intervalTicks = Math.max(1, Math.round((def.effectIntervalSeconds ?? 1) * 20))
    for (const effect of effects) {
      const durationTicks = Math.max(1, Math.round(effect.durationSeconds * 20))
      const refreshBelow = Math.max(0, durationTicks - intervalTicks)
      tickBody.push(
        `if (entity.potionEffects.getDuration(${quote(effect.id)}) <= ${refreshBelow}) ` +
          `entity.potionEffects.add(${quote(effect.id)}, ${durationTicks}, ${Math.trunc(effect.amplifier)})`
      )
    }
  }
  tickBody.push(...plan.tick)

  /* ---------------- 能力链 ---------------- */

  lines.push('    .attachCuriosCapability(')
  lines.push('      CuriosJSCapabilityBuilder.create()')

  for (const attribute of def.attributes ?? []) {
    // 第二个参数是 UUID 字符串（见方法签名 addAttribute(ResourceLocation, String, double, Operation)）
    lines.push(
      `        .addAttribute(${quote(attribute.id)}, ${quote(attribute.uuid)}, ${num(
        attribute.value
      )}, ${quote(attribute.operation)})`
    )
  }

  if (plan.chain.length > 0) lines.push(...indent(plan.chain, '        '))

  if (equipBody.length > 0) {
    lines.push('        .onEquip((slotContext, oldStack, newStack) => {')
    lines.push('          const entity = slotContext.entity()')
    lines.push(...indent(equipBody, '          '))
    lines.push('        })')
  }

  if (unequipBody.length > 0) {
    lines.push('        .onUnequip((slotContext, oldStack, newStack) => {')
    lines.push('          const entity = slotContext.entity()')
    lines.push(...indent(unequipBody, '          '))
    lines.push('        })')
  }

  if (tickBody.length > 0) {
    lines.push('        .curioTick((slotContext, stack) => {')
    lines.push('          const entity = slotContext.entity()')
    lines.push('          // 服务端客户端都会调用，改状态必须放服务端，否则效果会翻倍')
    lines.push('          if (!entity || entity.level.isClientSide()) return')
    lines.push(...indent(tickBody, '          '))
    lines.push('        })')
  }

  lines.push(`        .canEquip((slotContext, stack) => ${def.canEquip === false ? 'false' : 'true'})`)
  lines.push(`        .canUnequip((slotContext, stack) => ${def.canUnequip === false ? 'false' : 'true'})`)
  lines.push('    )')

  return lines
}

/** 完整饰品脚本（KubeJS 6：不再需要 java() / $UUID 变量，UUID 直接以字符串传入） */
export function generateCurioScript(library: CurioLibrary): string {
  const items = (library?.items ?? []).filter((def) => (def.name ?? '').trim() !== '')

  const lines: string[] = [...HEADER, '']
  lines.push("StartupEvents.registry('item', event => {")

  if (items.length === 0) {
    lines.push('  // 饰品库为空：请先在界面中添加饰品并点击「保存到饰品库」')
  } else {
    items.forEach((def, index) => {
      if (index > 0) lines.push('')
      lines.push(...generateCurioLines(def))
    })
  }

  lines.push('})')
  return `${lines.join('\n')}\n`
}

/** 饰品库里是否存在 server 作用域事件卡（决定要不要写伴随脚本） */
export function hasServerEventCards(library: CurioLibrary): boolean {
  return (library?.items ?? []).some((def) =>
    (def.events ?? []).some((selection) => findEventCard(selection.cardId)?.scope === 'server')
  )
}

/** server_scripts 伴随脚本：把所有 server 作用域事件卡拼成一个文件 */
export function generateCurioEventScript(library: CurioLibrary): string {
  const items = (library?.items ?? []).filter((def) => (def.name ?? '').trim() !== '')
  const blocks: string[] = []

  for (const def of items) {
    for (const selection of def.events ?? []) {
      const card = findEventCard(selection.cardId)
      if (!card || card.scope !== 'server') continue
      const ctx = buildEventContext(def, selection)
      const patch = card.server ? card.server(ctx) : null
      if (!patch || !patch.blocks || patch.blocks.length === 0) continue
      if (blocks.length > 0) blocks.push('')
      blocks.push(`// ${(def.displayName ?? '').trim() || def.name} · ${card.name}`)
      blocks.push(...patch.blocks)
    }
  }

  const lines: string[] = [...EVENT_HEADER, '']
  if (blocks.length === 0) {
    lines.push('// 当前没有任何饰品使用「服务端事件卡」（击杀 / 受伤 / 破坏方块），无需处理')
  } else {
    lines.push(...blocks)
  }
  return `${lines.join('\n')}\n`
}
