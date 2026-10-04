import type { ItemEntry, Rarity } from './types'
import { MOB_EFFECT_OPTION_GROUPS } from './data/mobEffects'
import { MAX_CURIO_EVENTS, normalizeEventSelection, type CurioEventSelection } from './curioEvents'

/**
 * Curios 饰品（KubeJS + kubejs_curios + Curios API）共享层。
 *
 * 生成的目标脚本（startup 阶段，改完必须重启游戏）：
 *   kubejs/startup_scripts/<curios 脚本名>
 *   StartupEvents.registry('item', event => {
 *     event.create('kubejs:fire_charm')
 *       .displayName('火焰护符')
 *       .tag('curios:charm')
 *       .attachCuriosCapability(CuriosJSCapabilityBuilder.create()...)
 *   })
 *
 * 依据《KubeJS 自定义 Curios 饰品教程》：
 * - 必须先装 kubejs_curios（否则没有 attachCuriosCapability / CuriosJSCapabilityBuilder）；
 * - 饰品能否放进槽位取决于 curios:xxx 槽位 tag；
 * - 属性加成用 addAttribute(id, uuid, value, operation)，UUID 每个属性必须唯一；
 * - 每 tick 效果里要判 entity.level.isClientSide()，否则服务端客户端都会跑（效果翻倍）；
 * - 本工具**不生成渲染（renderer）代码**，饰品照常可用，只是身上不显示模型。
 */

/** 自定义饰品在物品列表中归属的模组名（会出现在模组下拉表中，用绿色高亮） */
export const CURIO_ITEM_MOD = 'KubeCurios'

/** 默认命名空间 */
export const DEFAULT_CURIO_NAMESPACE = 'kubejs'

/** 自定义饰品脚本的默认文件名（写入 kubejs/startup_scripts/） */
export const DEFAULT_CURIO_FILE_NAME = 'curios_trinkets.js'

/** Curios 栏位配置文件（写入 <游戏目录>/config/curios-common.toml） */
export const CURIOS_COMMON_FILE = 'curios-common.toml'

/** 上限 */
export const MAX_CURIOS = 100
export const MAX_CURIO_ATTRIBUTES = 8
export const MAX_CURIO_EFFECTS = 4

/* ------------------------------------------------------------------ */
/* 槽位                                                                */
/* ------------------------------------------------------------------ */

export interface CurioSlotInfo {
  /** 槽位 ID（写入 curios:<id> 标签） */
  id: string
  label: string
}

/**
 * 常用 Curios 槽位（依据教程与 Curios 文档整理）。
 * 是否真正可用取决于当前整合包 / 数据包是否注册了该栏位。
 */
export const CURIOS_SLOTS: CurioSlotInfo[] = [
  { id: 'charm', label: '饰品（charm）' },
  { id: 'ring', label: '戒指（ring）' },
  { id: 'necklace', label: '项链（necklace）' },
  { id: 'belt', label: '腰带（belt）' },
  { id: 'head', label: '头部（head）' },
  { id: 'back', label: '背部（back）' },
  { id: 'body', label: '身体（body）' },
  { id: 'hands', label: '手部（hands）' },
  { id: 'feet', label: '足部（feet）' },
  { id: 'bracelet', label: '手镯（bracelet）' },
  { id: 'curio', label: '通用饰品（curio）' }
]

export const CURIOS_SLOT_IDS = CURIOS_SLOTS.map((slot) => slot.id)

/** 槽位标签：curios:<id> */
export function curiosTag(slotId: string): string {
  return `curios:${(slotId ?? '').trim()}`
}

/** 槽位中文名（用于摘要与预览提示） */
export function curiosSlotLabel(slotId: string): string {
  const id = (slotId ?? '').trim()
  return CURIOS_SLOTS.find((slot) => slot.id === id)?.label ?? id
}

/* ------------------------------------------------------------------ */
/* 属性加成                                                            */
/* ------------------------------------------------------------------ */

export type AttributeOperation = 'addition' | 'multiply_base' | 'multiply_total'

export const ATTRIBUTE_OPERATIONS: { value: AttributeOperation; label: string }[] = [
  { value: 'addition', label: 'addition（加法）' },
  { value: 'multiply_base', label: 'multiply_base（基础乘区）' },
  { value: 'multiply_total', label: 'multiply_total（总乘区）' }
]

/** 常用属性（可下拉选择，也可手动输入任意属性 ID） */
export const ATTRIBUTE_OPTION_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: '生存',
    options: [
      { value: 'minecraft:generic.max_health', label: '最大生命值 max_health' },
      { value: 'minecraft:generic.armor', label: '护甲值 armor' },
      { value: 'minecraft:generic.armor_toughness', label: '盔甲韧性 armor_toughness' },
      { value: 'minecraft:generic.knockback_resistance', label: '击退抗性 knockback_resistance' }
    ]
  },
  {
    label: '战斗',
    options: [
      { value: 'minecraft:generic.attack_damage', label: '攻击伤害 attack_damage' },
      { value: 'minecraft:generic.attack_speed', label: '攻击速度 attack_speed' },
      { value: 'minecraft:generic.attack_knockback', label: '击退力度 attack_knockback' },
      { value: 'minecraft:generic.luck', label: '幸运 luck' }
    ]
  },
  {
    label: '移动',
    options: [
      { value: 'minecraft:generic.movement_speed', label: '移动速度 movement_speed' },
      { value: 'minecraft:generic.flying_speed', label: '飞行速度 flying_speed' },
      { value: 'minecraft:generic.step_height', label: '步高 step_height' }
    ]
  }
]

/** 属性 ID → 中文名（摘要用） */
export function attributeLabel(id: string): string {
  const target = (id ?? '').trim()
  for (const group of ATTRIBUTE_OPTION_GROUPS) {
    const option = group.options.find((item) => item.value === target)
    if (option) return option.label.split(' ')[0]
  }
  return target
}

/** 效果 ID → 中文名（摘要用） */
export function effectLabel(id: string): string {
  const target = (id ?? '').trim()
  for (const group of MOB_EFFECT_OPTION_GROUPS) {
    const option = group.options.find((item) => item.value === target)
    if (option) return option.label
  }
  return target
}

/* ------------------------------------------------------------------ */
/* 数据结构                                                            */
/* ------------------------------------------------------------------ */

export interface CurioAttribute {
  /** 属性 ID，如 minecraft:generic.max_health */
  id: string
  /** 属性修饰符 UUID（同一物品内必须唯一） */
  uuid: string
  /** 数值 */
  value: number
  operation: AttributeOperation
}

export interface CurioEffect {
  /** 药水效果 ID */
  id: string
  /** 单次持续时间（秒） */
  durationSeconds: number
  /** 等级（amplifier，0 表示 I 级） */
  amplifier: number
}

export interface CustomCurioDef {
  /** 物品 ID（不含命名空间） */
  name: string
  namespace: string
  displayName: string
  texture: string
  /** 槽位 ID（charm / ring / ...），生成 curios:<id> 标签 */
  slot: string
  maxStackSize?: number | null
  rarity?: Rarity | null
  glow?: boolean | null
  fireResistant?: boolean | null
  tooltip?: string
  /** 允许佩戴 / 允许脱下（canEquip / canUnequip） */
  canEquip?: boolean | null
  canUnequip?: boolean | null
  /** 佩戴 / 取下时的聊天提示（留空则不生成事件） */
  equipMessage?: string
  unequipMessage?: string
  /** 属性加成 */
  attributes: CurioAttribute[]
  /** 每 effectIntervalSeconds 秒施加一次的效果 */
  effects: CurioEffect[]
  /** 效果施加间隔（秒），留空按 1 秒 */
  effectIntervalSeconds?: number | null
  /** 事件卡组合（见 shared/curioEvents：capability 卡进饰品脚本，server 卡进 server_scripts） */
  events: CurioEventSelection[]
}

/** Curios 栏位配置条目（curios-common.toml 的 slots 数组元素） */
export interface CuriosSlotConfig {
  /** 栏位 ID（必填） */
  id: string
  /** 默认栏位数量 */
  size?: number | null
  /** 数量调整方式 */
  operation?: 'SET' | 'ADD' | 'REMOVE' | null
  /** 界面排序 */
  order?: number | null
  /** 栏位图标资源路径，如 minecraft:item/diamond */
  icon?: string
  /** 增加纯外观栏位 */
  addCosmetic?: boolean | null
  /** 加入原生 Curios 界面 */
  useNativeGui?: boolean | null
  /** 允许切换渲染 */
  renderToggle?: boolean | null
  /** 死亡掉落规则 */
  dropRule?: 'DEFAULT' | 'ALWAYS_DROP' | 'ALWAYS_KEEP' | 'DESTROY' | null
}

export interface CurioLibrary {
  /** 物品库（会被写入脚本） */
  items: CustomCurioDef[]
  /** 已创建饰品（应用修改后进入物品选择列表，绿色高亮） */
  created: CustomCurioDef[]
  /** Curios 栏位配置（curios-common.toml） */
  slots: CuriosSlotConfig[]
}

/* ------------------------------------------------------------------ */
/* 工厂                                                                */
/* ------------------------------------------------------------------ */

/** 生成一个格式合法的 UUID（属性修饰符用，只要唯一即可） */
export function createUuid(): string {
  const hex = '0123456789abcdef'
  const pick = (count: number): string =>
    Array.from({ length: count }, () => hex[Math.floor(Math.random() * 16)]).join('')
  return `${pick(8)}-${pick(4)}-4${pick(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${pick(3)}-${pick(12)}`
}

export function createEmptyAttribute(): CurioAttribute {
  return { id: 'minecraft:generic.max_health', uuid: createUuid(), value: 2, operation: 'addition' }
}

export function createEmptyEffect(): CurioEffect {
  return { id: 'minecraft:night_vision', durationSeconds: 10, amplifier: 0 }
}

export function createEmptyCurio(): CustomCurioDef {
  return {
    name: '',
    namespace: DEFAULT_CURIO_NAMESPACE,
    displayName: '',
    texture: '',
    slot: 'charm',
    maxStackSize: 1,
    rarity: null,
    glow: false,
    fireResistant: false,
    tooltip: '',
    canEquip: true,
    canUnequip: true,
    equipMessage: '',
    unequipMessage: '',
    attributes: [],
    effects: [],
    effectIntervalSeconds: 1,
    events: []
  }
}

export function createEmptySlotConfig(): CuriosSlotConfig {
  return {
    id: 'ring',
    size: 2,
    operation: null,
    order: null,
    icon: '',
    addCosmetic: false,
    useNativeGui: null,
    renderToggle: null,
    dropRule: null
  }
}

export function createEmptyCurioLibrary(): CurioLibrary {
  return { items: [], created: [], slots: [] }
}

/** 饰品注册名：命名空间:物品 ID */
export function curioId(def: { namespace: string; name: string }): string {
  const namespace = (def.namespace || DEFAULT_CURIO_NAMESPACE).trim()
  return `${namespace}:${(def.name || '').trim()}`
}

/* ------------------------------------------------------------------ */
/* 规范化                                                              */
/* ------------------------------------------------------------------ */

const ID_PATTERN = /^[a-z0-9_.-]+$/
const RESOURCE_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC']
const OPERATION_SET = ATTRIBUTE_OPERATIONS.map((item) => item.value)
const SLOT_OPERATIONS = ['SET', 'ADD', 'REMOVE']
const DROP_RULES = ['DEFAULT', 'ALWAYS_DROP', 'ALWAYS_KEEP', 'DESTROY']

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asRarity(value: unknown): Rarity | null {
  const text = asText(value).toUpperCase()
  return RARITIES.includes(text as Rarity) ? (text as Rarity) : null
}

function normalizeAttribute(input: unknown): CurioAttribute | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = asText(raw.id).trim()
  if (!RESOURCE_ID_PATTERN.test(id)) return null
  const uuid = asText(raw.uuid).trim()
  const operation = OPERATION_SET.includes(raw.operation as AttributeOperation)
    ? (raw.operation as AttributeOperation)
    : 'addition'
  return {
    id,
    uuid: UUID_PATTERN.test(uuid) ? uuid : createUuid(),
    value: asNumber(raw.value) ?? 0,
    operation
  }
}

function normalizeEffect(input: unknown): CurioEffect | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = asText(raw.id).trim()
  if (!RESOURCE_ID_PATTERN.test(id)) return null
  return {
    id,
    durationSeconds: asNumber(raw.durationSeconds) ?? 10,
    amplifier: Math.max(0, Math.trunc(asNumber(raw.amplifier) ?? 0))
  }
}

/** 外部输入（磁盘 / IPC）规范化：非法字段一律丢弃，保证界面拿到结构完整的数据 */
export function normalizeCurioDef(input: unknown): CustomCurioDef | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const name = asText(raw.name).trim()
  if (!name) return null

  const slot = asText(raw.slot).trim()
  const attributes: CurioAttribute[] = []
  if (Array.isArray(raw.attributes)) {
    for (const item of raw.attributes) {
      const attribute = normalizeAttribute(item)
      if (attribute) attributes.push(attribute)
      if (attributes.length >= MAX_CURIO_ATTRIBUTES) break
    }
  }

  const effects: CurioEffect[] = []
  if (Array.isArray(raw.effects)) {
    for (const item of raw.effects) {
      const effect = normalizeEffect(item)
      if (effect) effects.push(effect)
      if (effects.length >= MAX_CURIO_EFFECTS) break
    }
  }

  const events: CurioEventSelection[] = []
  if (Array.isArray(raw.events)) {
    const seen = new Set<string>()
    for (const item of raw.events) {
      const selection = normalizeEventSelection(item)
      if (!selection || seen.has(selection.cardId)) continue
      seen.add(selection.cardId)
      events.push(selection)
      if (events.length >= MAX_CURIO_EVENTS) break
    }
  }

  return {
    name,
    namespace: asText(raw.namespace).trim() || DEFAULT_CURIO_NAMESPACE,
    displayName: asText(raw.displayName),
    texture: asText(raw.texture),
    slot: slot || 'charm',
    maxStackSize: asNumber(raw.maxStackSize),
    rarity: asRarity(raw.rarity),
    glow: asBool(raw.glow) ?? false,
    fireResistant: asBool(raw.fireResistant) ?? false,
    tooltip: asText(raw.tooltip),
    canEquip: asBool(raw.canEquip) ?? true,
    canUnequip: asBool(raw.canUnequip) ?? true,
    equipMessage: asText(raw.equipMessage),
    unequipMessage: asText(raw.unequipMessage),
    attributes,
    effects,
    effectIntervalSeconds: asNumber(raw.effectIntervalSeconds),
    events
  }
}

export function normalizeSlotConfig(input: unknown): CuriosSlotConfig | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = asText(raw.id).trim()
  if (!ID_PATTERN.test(id)) return null
  const operation = SLOT_OPERATIONS.includes(raw.operation as string)
    ? (raw.operation as CuriosSlotConfig['operation'])
    : null
  const dropRule = DROP_RULES.includes(raw.dropRule as string)
    ? (raw.dropRule as CuriosSlotConfig['dropRule'])
    : null
  return {
    id,
    size: asNumber(raw.size),
    operation,
    order: asNumber(raw.order),
    icon: asText(raw.icon),
    addCosmetic: asBool(raw.addCosmetic),
    useNativeGui: asBool(raw.useNativeGui),
    renderToggle: asBool(raw.renderToggle),
    dropRule
  }
}

/** 读取一组饰品定义（过滤非法项、按 ID 去重、限制上限） */
function readCurioList(value: unknown): CustomCurioDef[] {
  const rawItems = Array.isArray(value) ? value : []
  const items: CustomCurioDef[] = []
  const seen = new Set<string>()
  for (const entry of rawItems) {
    const def = normalizeCurioDef(entry)
    if (!def) continue
    const id = curioId(def)
    if (seen.has(id)) continue
    seen.add(id)
    items.push(def)
    if (items.length >= MAX_CURIOS) break
  }
  return items
}

/** 读取栏位配置（按 ID 去重） */
export function normalizeSlotList(value: unknown): CuriosSlotConfig[] {
  const rawSlots = Array.isArray(value) ? value : []
  const slots: CuriosSlotConfig[] = []
  const seen = new Set<string>()
  for (const entry of rawSlots) {
    const slot = normalizeSlotConfig(entry)
    if (!slot) continue
    if (seen.has(slot.id)) continue
    seen.add(slot.id)
    slots.push(slot)
  }
  return slots
}

export function normalizeCurioLibrary(input: unknown): CurioLibrary {
  const raw = (input ?? {}) as Record<string, unknown>
  const items = readCurioList(raw.items)
  // 旧文件缺少 created 字段时回退为 items，保证升级后物品列表不空
  const created = Array.isArray(raw.created) ? readCurioList(raw.created) : readCurioList(raw.items)
  return { items, created, slots: normalizeSlotList(raw.slots) }
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

/** 单个饰品定义校验（library 用于「库内重名」与「槽位是否已定义」判断） */
export function validateCurio(
  def: CustomCurioDef | null | undefined,
  library?: CurioLibrary,
  selfIndex = -1
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!def) return { errors: ['饰品定义缺失'], warnings }

  const name = (def.name ?? '').trim()
  const namespace = (def.namespace ?? '').trim() || DEFAULT_CURIO_NAMESPACE

  if (!name) errors.push('物品 ID 不能为空')
  else if (!ID_PATTERN.test(name)) errors.push(`物品 ID 只能包含小写字母、数字、下划线、中划线与点：${name}`)
  if (!ID_PATTERN.test(namespace)) errors.push(`命名空间非法：${namespace}`)
  if (namespace === 'minecraft') errors.push('不能使用 minecraft 命名空间（会与原版物品冲突）')

  if (name && library) {
    const id = curioId({ namespace, name })
    const duplicated = (library.items ?? []).some(
      (item, index) => index !== selfIndex && curioId(item) === id
    )
    if (duplicated) errors.push(`物品 ID 已存在：${id}`)
  }

  if (!(def.slot ?? '').trim()) {
    errors.push('请选择饰品槽位（决定 curios:xxx 标签，没打对标签饰品会放不进槽位）')
  } else if (!ID_PATTERN.test(def.slot.trim())) {
    errors.push(`槽位 ID 非法：${def.slot}（只能是小写字母、数字、下划线）`)
  } else if (!CURIOS_SLOT_IDS.includes(def.slot.trim())) {
    warnings.push(`槽位 ${def.slot} 不在常用槽位表中，请确认整合包已注册该栏位`)
  }

  if (!(def.texture ?? '').trim()) {
    warnings.push('未填写贴图，游戏内会显示为紫黑方块（贴图文件放到 kubejs/assets/<命名空间>/textures/item/<物品ID>.png）')
  } else if (!RESOURCE_ID_PATTERN.test(def.texture.trim())) {
    errors.push(`贴图路径格式非法：${def.texture}（应形如 kubejs:item/my_charm）`)
  }

  if (def.maxStackSize != null) {
    if (!Number.isInteger(def.maxStackSize) || def.maxStackSize < 1 || def.maxStackSize > 64) {
      errors.push('最大堆叠数必须是 1 ~ 64 的整数')
    } else if (def.maxStackSize > 1) {
      warnings.push('饰品通常不可堆叠，堆叠数大于 1 时可能无法正常放入槽位')
    }
  }

  if (def.equipMessage && def.equipMessage.length > 60) warnings.push('佩戴提示过长，建议不超过 60 字')
  if (def.unequipMessage && def.unequipMessage.length > 60) warnings.push('取下提示过长，建议不超过 60 字')

  if ((def.attributes ?? []).length > 0) {
    const seen = new Set<string>()
    for (const attribute of def.attributes) {
      if (!RESOURCE_ID_PATTERN.test((attribute.id ?? '').trim())) {
        errors.push(`属性 ID 非法：${attribute.id}（应形如 minecraft:generic.max_health）`)
      }
      if (!UUID_PATTERN.test((attribute.uuid ?? '').trim())) {
        errors.push(`属性 ${attribute.id} 的 UUID 格式非法`)
      } else if (seen.has(attribute.uuid.trim().toLowerCase())) {
        errors.push(`属性 UUID 重复：${attribute.uuid}（每个属性必须唯一，否则属性会叠加异常）`)
      } else {
        seen.add(attribute.uuid.trim().toLowerCase())
      }
      if (!Number.isFinite(attribute.value)) errors.push(`属性 ${attribute.id} 的数值非法`)
    }
  }

  const effects = def.effects ?? []
  if (effects.length > 0) {
    const interval = def.effectIntervalSeconds
    if (interval != null && (!Number.isFinite(interval) || interval <= 0)) {
      errors.push('效果施加间隔必须是大于 0 的秒数')
    } else if (interval != null && interval < 0.5) {
      warnings.push('效果施加间隔过短（建议 ≥ 1 秒），会明显增加服务端负担')
    }
    for (const effect of effects) {
      if (!RESOURCE_ID_PATTERN.test((effect.id ?? '').trim())) {
        errors.push(`效果 ID 非法：${effect.id}（应形如 minecraft:night_vision）`)
      }
      if (!Number.isFinite(effect.durationSeconds) || effect.durationSeconds <= 0) {
        errors.push(`效果 ${effect.id} 的持续时间必须是大于 0 的秒数`)
      }
      if (!Number.isInteger(effect.amplifier) || effect.amplifier < 0 || effect.amplifier > 9) {
        errors.push(`效果 ${effect.id} 的等级必须是 0 ~ 9 的整数`)
      }
      if (
        interval != null &&
        Number.isFinite(interval) &&
        Number.isFinite(effect.durationSeconds) &&
        effect.durationSeconds < interval
      ) {
        warnings.push(
          `效果 ${effect.id} 的持续时间（${effect.durationSeconds} 秒）小于施加间隔（${interval} 秒），游戏内效果会闪断`
        )
      }
    }
  }

  return { errors, warnings }
}

/** 栏位配置校验 */
export function validateSlotConfig(
  slot: CuriosSlotConfig | null | undefined,
  library?: CurioLibrary,
  selfIndex = -1
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!slot) return { errors: ['栏位条目缺失'], warnings }

  const id = (slot.id ?? '').trim()
  if (!id) errors.push('栏位 ID 不能为空')
  else if (!ID_PATTERN.test(id)) errors.push(`栏位 ID 只能包含小写字母、数字、下划线：${id}`)
  else if (library && (library.slots ?? []).some((item, index) => index !== selfIndex && item.id === id)) {
    errors.push(`栏位已存在：${id}`)
  }
  if (!CURIOS_SLOT_IDS.includes(id) && id) {
    warnings.push(`栏位 ${id} 不在常用栏位表中，请确认整合包已注册（未注册的栏位可能只能看到不能使用）`)
  }

  if (slot.size != null) {
    if (!Number.isInteger(slot.size) || slot.size < 0 || slot.size > 48) {
      errors.push('栏位数量必须是 0 ~ 48 的整数（Curios 5.9 起单页上限为 48）')
    } else if (slot.size > 12) {
      warnings.push(`栏位 ${id} 数量为 ${slot.size}，数量过大可能增加界面渲染压力，也会暴露栏位同步异常`)
    }
  }

  if (slot.order != null && !Number.isInteger(slot.order)) errors.push('排序必须是整数')

  const icon = (slot.icon ?? '').trim()
  if (icon && !RESOURCE_ID_PATTERN.test(icon)) {
    errors.push(`图标路径非法：${icon}（应形如 minecraft:item/diamond）`)
  }

  if (slot.operation && !SLOT_OPERATIONS.includes(slot.operation)) {
    errors.push(`数量调整方式非法：${slot.operation}`)
  }
  if (slot.dropRule && !DROP_RULES.includes(slot.dropRule)) {
    errors.push(`死亡掉落规则非法：${slot.dropRule}`)
  }

  return { errors, warnings }
}

/** 整库校验（汇总物品与栏位配置的错误，带归属前缀） */
export function validateCurioLibrary(library: CurioLibrary): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if ((library.items ?? []).length === 0) {
    errors.push('饰品库为空，请先添加至少一个自定义饰品')
  }

  ;(library.items ?? []).forEach((def, index) => {
    const result = validateCurio(def, library, index)
    const prefix = `第 ${index + 1} 个饰品（${def.name || '未命名'}）：`
    for (const error of result.errors) errors.push(`${prefix}${error}`)
    for (const warning of result.warnings) warnings.push(`${prefix}${warning}`)
  })

  ;(library.slots ?? []).forEach((slot, index) => {
    const result = validateSlotConfig(slot, library, index)
    const prefix = `第 ${index + 1} 个栏位（${slot.id || '未命名'}）：`
    for (const error of result.errors) errors.push(`${prefix}${error}`)
    for (const warning of result.warnings) warnings.push(`${prefix}${warning}`)
  })

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/* ------------------------------------------------------------------ */
/* 摘要与列表映射                                                      */
/* ------------------------------------------------------------------ */

/** 摘要标签（饰品库卡片用） */
export function summarizeCurio(def: CustomCurioDef): string[] {
  const tags: string[] = [`槽位 ${def.slot}`, curioId(def)]
  if (def.displayName) tags.push(def.displayName)
  if (def.maxStackSize != null) tags.push(`堆叠 ${def.maxStackSize}`)
  if (def.rarity) tags.push(`稀有度 ${def.rarity.toLowerCase()}`)
  if (def.glow) tags.push('发光')
  if (def.fireResistant) tags.push('抗火')
  for (const attribute of def.attributes ?? []) {
    const label = attributeLabel(attribute.id)
    tags.push(`${label} ${attribute.value > 0 ? '+' : ''}${attribute.value}`)
  }
  for (const effect of def.effects ?? []) {
    tags.push(`效果 ${effectLabel(effect.id)}`)
  }
  if (def.equipMessage) tags.push('佩戴提示')
  if (def.unequipMessage) tags.push('取下提示')
  return tags
}

/** 已创建饰品映射为物品列表条目（左侧「物品选择」区显示的 KubeCurios 模组物品） */
export function curioToEntry(def: CustomCurioDef): ItemEntry {
  return {
    id: curioId(def),
    name: (def.displayName ?? '').trim() || def.name,
    mod: CURIO_ITEM_MOD,
    category: 'armor',
    edible: false,
    armorLike: false,
    toolLike: false,
    diggerLike: false
  }
}

export function curiosToEntries(library: CurioLibrary): ItemEntry[] {
  const list = Array.isArray(library?.created) ? library.created : (library?.items ?? [])
  return list.map(curioToEntry)
}

/** 保存到饰品库：同 ID 原地替换，否则追加 */
export function upsertCurio(list: CustomCurioDef[], def: CustomCurioDef): CustomCurioDef[] {
  const id = curioId(def)
  const next = list.map((item) => ({ ...item }))
  const index = next.findIndex((item) => curioId(item) === id)
  if (index >= 0) next.splice(index, 1, { ...def })
  else next.push({ ...def })
  return next
}

/** 按 ID 从列表中移除 */
export function removeCurioById(list: CustomCurioDef[], id: string): CustomCurioDef[] {
  return list.filter((item) => curioId(item) !== id)
}

/** 栏位配置保存：同 ID 原地替换，否则追加 */
export function upsertSlot(list: CuriosSlotConfig[], slot: CuriosSlotConfig): CuriosSlotConfig[] {
  const next = list.map((item) => ({ ...item }))
  const index = next.findIndex((item) => item.id === slot.id)
  if (index >= 0) next.splice(index, 1, { ...slot })
  else next.push({ ...slot })
  return next
}

export function removeSlotById(list: CuriosSlotConfig[], id: string): CuriosSlotConfig[] {
  return list.filter((item) => item.id !== id)
}
