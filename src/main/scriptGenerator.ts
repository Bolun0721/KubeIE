import { getProfile } from '@shared/profiles'
import type { ItemEntry, ItemModification, ItemProperties, KubeJsProfileId } from '@shared/types'
import { hasScriptProperty } from '@shared/validation'
import { findItem } from './itemDatabase'

/**
 * KubeJS 脚本生成引擎（开发方案模块三 / 六）。
 *
 * 说明：原方案标注使用 Jinja2 模板引擎，Jinja2 为 Python 生态，无法在 Electron/Node 环境使用。
 * 此处采用「纯字符串拼接」实现（方案六 6.2 修订允许 EJS 或纯字符串拼接），避免引入额外模板依赖。
 */

/** 缩进：4 空格 */
const I1 = '    '
const I2 = I1.repeat(2)
/** 脚本内日志前缀（用于被 try/catch 保护的分支） */
const LOG_TAG = '[KubeIE]'

export interface GenerateOptions {
  profileId?: KubeJsProfileId
  /** 是否输出文件头注释，默认 true */
  header?: boolean
  generatedAt?: Date
}

export function generateScript(
  modifications: ItemModification[],
  options: GenerateOptions = {}
): string {
  const profile = getProfile(options.profileId)
  // 只有食物属性的物品由 FoodTweaker 配置承载，不参与脚本生成（避免产生空的 event.modify）
  const active = (modifications ?? []).filter((m) => m && hasScriptProperty(m.properties)).slice()

  // 同一物品只保留最后一条修改，避免重复 event.modify
  const deduped = new Map<string, ItemModification>()
  for (const modification of active) {
    deduped.set(modification.itemId, modification)
  }
  const list = [...deduped.values()]

  const lines: string[] = []

  if (options.header !== false) {
    lines.push('// ===== 本文件由 KubeIE生成 =====')
    lines.push(`// 目标环境：Minecraft ${profile.mcVersions} + ${profile.kubejs}`)
    lines.push(`// 生成时间：${formatDateTime(options.generatedAt ?? new Date())}`)
    lines.push(`// 物品修改条目：${list.length}`)
    lines.push('// 生效方式：ItemEvents.modification 属于 startup script，建议重启游戏；')
    lines.push('//           也可尝试命令 /kubejs reload startup_scripts（不保证所有修改生效）')
    lines.push('')
  }

  lines.push('ItemEvents.modification(event => {')

  list.forEach((modification, index) => {
    if (index > 0) lines.push('')
    lines.push(`${I1}event.modify('${modification.itemId}', item => {`)
    lines.push(...buildPropertyLines(modification, profile.id))
    lines.push(`${I1}})`)
  })

  lines.push('})')

  return `${lines.join('\n')}\n`
}

/**
 * 物品对某类属性的支持情况：
 * - supported   内置库已收录且确认支持 → 直接生成
 * - unsupported 内置库已收录且确认不支持 → 只写注释，不生成（避免 KubeJS 抛错）
 * - unknown     未收录（模组物品）或支持情况未经实测 → 生成带 try/catch 保护的代码
 */
type PropertySupport = 'supported' | 'unsupported' | 'unknown'

type PropertyKind = 'digSpeed' | 'attackDamage' | 'attackSpeed' | 'tier' | 'armor'

function supportOf(entry: ItemEntry | undefined, kind: PropertyKind): PropertySupport {
  if (!entry) return 'unknown'
  if (kind === 'digSpeed') return entry.diggerLike ? 'supported' : 'unsupported'
  if (kind === 'attackDamage') {
    // 实测（KubeJS forge-2001.6.5-build.26 / MC 1.20.1）：
    //   · 剑类（SwordItem）设置 attackDamage 正常；
    //   · 挖掘类工具（DiggerItem：镐/斧/锹/锄）会报
    //     `Java class "…PickaxeItem" has no public instance field or method named "attackDamage"`
    //     并中断整个 ItemEvents.modification 事件；
    //   · 盔甲类会抛 UnsupportedOperationException（KubeJS 内部显式拒绝）。
    if (entry.diggerLike) return 'unsupported'
    if (entry.category === 'armor') return 'unsupported'
    if (entry.toolLike) return 'supported'
    // 其余物品（材料/食物/方块等）无法确认是否具备可改写的属性表，保守加保护
    return 'unknown'
  }
  if (kind === 'attackSpeed') {
    // KubeJS 的 kjs$setAttackSpeed 与 kjs$setAttackDamage 是同一实现路径（重设 ATTACK_SPEED 修饰符），
    // 仅对 ArmorItem 显式抛 UnsupportedOperationException。
    if (entry.category === 'armor') return 'unsupported'
    // 剑类与 attackDamage 同样已实测可用
    if (entry.toolLike && !entry.diggerLike) return 'supported'
    // 挖掘类工具（镐/斧/锹/锄）：KubeJS 字节码显示可用，但本机未实测，
    // 保守加 try/catch：即使抛错也只跳过该行，不会中断整个事件
    return 'unknown'
  }
  if (kind === 'armor') {
    // kjs$setArmorProtection / kjs$setArmorToughness 仅对 ArmorItem 生效，
    // 其余物品抛 UnsupportedOperationException（盾牌、鞘翅分类为 armor 但不是 ArmorItem）
    return entry.armorLike ? 'supported' : 'unsupported'
  }
  // KubeJS 的 kjs$setTier 仅对 TieredItem 生效，其余会抛 IllegalArgumentException
  return entry.toolLike ? 'supported' : 'unsupported'
}

/** 生成「已忽略」注释的具体原因 */
function unsupportedReason(entry: ItemEntry | undefined, kind: PropertyKind): string {
  if (kind === 'digSpeed') {
    return '该物品不是挖掘类工具（镐/斧/锹/锄），KubeJS 的 item.digSpeed 对它无效且会报错'
  }
  if (kind === 'attackDamage') {
    return entry?.diggerLike
      ? '挖掘类工具（镐/斧/锹/锄）在 KubeJS 6 下没有 attackDamage 映射，设置会报错并中断整个事件'
      : 'KubeJS 不支持对盔甲类物品设置 attackDamage'
  }
  if (kind === 'attackSpeed') {
    return 'KubeJS 不支持对盔甲类物品设置 attackSpeed（会抛 UnsupportedOperationException）'
  }
  if (kind === 'armor') {
    return '该物品不是盔甲（ArmorItem），KubeJS 的 armorProtection / armorToughness 会抛 UnsupportedOperationException'
  }
  return '该物品不是工具类物品（TieredItem），KubeJS 会报错'
}

function guardedLine(statement: string, itemId: string, label: string): string {
  const message = `${LOG_TAG} ${itemId} 不支持${label}，已跳过（不影响其他属性）`
  return `${I2}try { ${statement} } catch (e) { console.warn('${message}') }`
}

function buildPropertyLines(modification: ItemModification, profileId: KubeJsProfileId): string[] {
  const { properties, itemId } = modification
  const profile = getProfile(profileId)
  const entry = findItem(itemId)
  const lines: string[] = []

  if (properties.maxStackSize != null) {
    lines.push(`${I2}item.maxStackSize = ${formatNumber(properties.maxStackSize)}`)
  }
  if (properties.maxDamage != null) {
    lines.push(`${I2}item.maxDamage = ${formatNumber(properties.maxDamage)}`)
  }
  if (properties.burnTime != null) {
    lines.push(`${I2}item.burnTime = ${formatNumber(properties.burnTime)}`)
  }
  if (properties.fireResistant != null) {
    lines.push(`${I2}item.fireResistant = ${properties.fireResistant ? 'true' : 'false'}`)
  }
  if (properties.rarity) {
    lines.push(`${I2}item.rarity = '${properties.rarity}'`)
  }
  if (properties.craftingRemainder) {
    // 官方写法需以 .item 结尾
    lines.push(`${I2}item.craftingRemainder = Item.of('${properties.craftingRemainder}').item`)
  }

  lines.push(...buildToolLines(properties, profile.tierStyle, itemId, entry))
  lines.push(...buildArmorLines(properties, itemId, entry))

  return lines
}

/**
 * 护甲属性（护甲值 / 盔甲韧性）：
 * KubeJS 的 kjs$setArmorProtection / kjs$setArmorToughness 按装备槽位重设 ARMOR / ARMOR_TOUGHNESS 修饰符，
 * 仅对 ArmorItem 生效（盾牌、鞘翅分类为 armor 但不是 ArmorItem，会抛 UnsupportedOperationException）。
 */
function buildArmorLines(
  properties: ItemProperties,
  itemId: string,
  entry: ItemEntry | undefined
): string[] {
  const armor = properties.armor
  if (!armor) return []

  const statements: string[] = []
  if (armor.protection != null) {
    statements.push(`item.armorProtection = ${formatNumber(armor.protection)}`)
  }
  if (armor.toughness != null) {
    statements.push(`item.armorToughness = ${formatNumber(armor.toughness)}`)
  }
  if (statements.length === 0) return []

  const support = supportOf(entry, 'armor')
  if (support === 'supported') {
    return statements.map((statement) => `${I2}${statement}`)
  }
  if (support === 'unsupported') {
    return [`${I2}// 已忽略护甲属性：${unsupportedReason(entry, 'armor')}`]
  }

  // 模组物品无法确认是否为 ArmorItem：整体加保护，即使类型不符也只跳过这两行
  return [
    `${I2}// ${LOG_TAG} 该物品不在内置库中，无法确认是否为盔甲（ArmorItem），护甲属性已加保护避免脚本报错`,
    `${I2}try {`,
    ...statements.map((statement) => `${I2}${I1}${statement}`),
    `${I2}} catch (e) { console.warn('${LOG_TAG} ${itemId} 不支持护甲属性，已跳过') }`
  ]
}

function buildToolLines(
  properties: ItemProperties,
  tierStyle: 'callback' | 'direct',
  itemId: string,
  entry: ItemEntry | undefined
): string[] {
  const tier = properties.tier
  if (!tier) return []
  const hasValue = Object.values(tier).some((v) => v !== null && v !== undefined)
  if (!hasValue) return []

  const lines: string[] = []

  // 挖掘速度 / 攻击伤害加成改用 KubeJS 官方推荐的「直接属性」写法：
  // 1) 官方 Wiki 已把 tier 回调标记为失效（kubejs.com/wiki/tutorials/item-modification，issue #662）；
  // 2) 即使 tier 对象被替换，这两个数值在物品构造时已分别烘焙进 DiggerItem.speed 字段与
  //    ATTACK_DAMAGE 属性表，事后改 tier 也不会生效。
  // 注意：这两个 setter 对物品类型有要求，类型不符会抛异常并中断整个 modification 事件，
  //       因此必须按物品类型区分（内置库已标注，模组物品则加 try/catch 保护）。
  if (tier.speed != null) {
    const statement = `item.digSpeed = ${formatNumber(tier.speed)}`
    const support = supportOf(entry, 'digSpeed')
    if (support === 'supported') {
      lines.push(`${I2}${statement}`)
    } else if (support === 'unsupported') {
      lines.push(`${I2}// 已忽略挖掘速度：${unsupportedReason(entry, 'digSpeed')}`)
    } else {
      lines.push(guardedLine(statement, itemId, '挖掘速度（仅镐/斧/锹/锄等挖掘类工具支持）'))
    }
  }

  if (tier.attackDamageBonus != null) {
    const statement = `item.attackDamage = ${formatNumber(tier.attackDamageBonus)}`
    const support = supportOf(entry, 'attackDamage')
    if (support === 'supported') {
      lines.push(`${I2}${statement}`)
    } else if (support === 'unsupported') {
      lines.push(`${I2}// 已忽略攻击伤害加成：${unsupportedReason(entry, 'attackDamage')}`)
    } else {
      lines.push(guardedLine(statement, itemId, '攻击伤害加成（该物品类型可能不支持）'))
    }
  }

  // 攻击速度：KubeJS 的 attackSpeed 是「修饰值」，实际攻速 = 4.0 + 该值
  if (tier.attackSpeed != null) {
    const statement = `item.attackSpeed = ${formatNumber(tier.attackSpeed)}`
    const support = supportOf(entry, 'attackSpeed')
    if (support === 'supported') {
      lines.push(`${I2}${statement}`)
    } else if (support === 'unsupported') {
      lines.push(`${I2}// 已忽略攻击速度：${unsupportedReason(entry, 'attackSpeed')}`)
    } else {
      lines.push(
        `${I2}// 攻击速度（修饰值，实际攻速 = 4.0 + 该值）：该物品类型未经实测，已加保护避免中断整个事件`
      )
      lines.push(guardedLine(statement, itemId, '攻击速度（该物品类型可能不支持）'))
    }
  }

  // 挖掘等级 / 修复材料：KubeJS 只提供 tier 回调这一条写入途径，而该 API 已失效
  const tierOnlyLines: string[] = []
  if (tier.level != null) {
    // 实测（MC 1.20.1 / Forge 47.4.23 / KubeJS 6）：等级会被限制在铁镐（2）——低于铁镐的工具最高只能提升到铁镐，
    // 高于铁镐的工具最低只能降到铁镐；属游戏 / 模组侧限制，与脚本写法无关，故仅添加提示文本。
    tierOnlyLines.push(
      `${I2}${I1}// 实测：挖掘等级会被限制在铁镐（2）——低于铁镐的工具最高只能提升到铁镐，高于铁镐的工具最低只能降到铁镐（游戏 / 模组侧限制）`
    )
    tierOnlyLines.push(`${I2}${I1}tier.level = ${formatNumber(tier.level)}`)
  }
  if (tier.repairIngredient) {
    tierOnlyLines.push(`${I2}${I1}tier.repairIngredient = Item.of('${tier.repairIngredient}').item`)
  }
  if (tierOnlyLines.length === 0) return lines

  const tierSupport = supportOf(entry, 'tier')
  if (tierSupport === 'unsupported') {
    lines.push(`${I2}// 已忽略挖掘等级 / 修复材料：该物品不是工具类物品（TieredItem），KubeJS 会报错`)
    return lines
  }

  if (tierStyle === 'direct') {
    lines.push(`${I2}// 挖掘等级 / 修复材料 只能通过 tier 回调设置，而该 API 已被 KubeJS 官方标记为失效（issue #662），`)
    lines.push(
      `${I2}// 因此当前模板不生成相关代码；若后续 KubeJS 修复该问题，可改用带 tier 回调的模板重新生成`
    )
    return lines
  }

  const note =
    `${I2}// 注意：KubeJS 官方已将 tier 回调标记为失效（kubejs.com/wiki，issue #662），以下属性在 1.20.1 / KubeJS 6 上可能不生效`

  if (tierSupport === 'unknown') {
    // 模组物品无法确认是否为 TieredItem，加保护避免整个事件中断
    lines.push(`${I2}// ${LOG_TAG} 该物品不在内置库中，无法确认类型，tier 属性已加保护避免脚本报错`)
    lines.push(`${I2}try {`)
    lines.push(`${I2}${I1}item.tier = tier => {`)
    lines.push(...tierOnlyLines.map((line) => `${I1}${line}`))
    lines.push(`${I2}${I1}}`)
    lines.push(`${I2}} catch (e) { console.warn('${LOG_TAG} ${itemId} 不支持 tier 属性，已跳过') }`)
    return lines
  }

  lines.push(note)
  lines.push(`${I2}item.tier = tier => {`)
  lines.push(...tierOnlyLines)
  lines.push(`${I2}}`)
  return lines
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(4)))
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
