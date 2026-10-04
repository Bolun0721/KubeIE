import type { ItemCategory, ItemEntry, Rarity, ValidationResult } from './types'

/**
 * 自定义物品（KubeJS 物品注册）共享层：
 * 类型元信息、数据规范化、校验、摘要与物品列表映射。
 *
 * 所有 API 名称均已对照 kubejs-forge-2001.6.5-build.26.jar 反编译核实：
 * - 物品注册：StartupEvents.registry('item', event => event.create(id, type))
 * - 工具/武器等级：ItemEvents.toolTierRegistry(event => event.add(id, tier => {...}))
 * - 盔甲等级：ItemEvents.armorTierRegistry(event => event.add(id, tier => {...}))
 * - 食物：ItemBuilder.food(food => food.hunger(...).saturation(...).effect(...))
 */

/**
 * 自定义物品在物品列表中归属的模组名（会出现在模组下拉表中）。
 * 刻意用 KubeIE（本软件名）而不是 KubeJS，避免与真实模组列表里的 KubeJS 重名。
 */
export const CUSTOM_ITEM_MOD = 'KubeIE'

/** 默认命名空间（KubeJS 注册的物品默认在 kubejs 下） */
export const DEFAULT_CUSTOM_NAMESPACE = 'kubejs'

/** 自定义物品脚本的默认文件名（写入 kubejs/startup_scripts/） */
export const DEFAULT_CUSTOM_FILE_NAME = 'custom_items.js'

/** 物品库与等级库上限 */
export const MAX_CUSTOM_ITEMS = 200
export const MAX_CUSTOM_TIERS = 50
/** 单个食物最多配置的效果数 */
export const MAX_FOOD_EFFECTS = 8

/** 物品 id 片段（不含命名空间）：小写字母 / 数字 / 下划线 / 中划线 / 点 */
const ITEM_NAME_PATTERN = /^[a-z0-9_.-]+$/
/** 命名空间 */
const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/
/** 带命名空间的资源路径：namespace:path */
const RESOURCE_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/

/* ------------------------------------------------------------------ */
/* 类型元信息                                                          */
/* ------------------------------------------------------------------ */

/** 自定义物品类型（对应 event.create 的第二个参数） */
export type CustomItemKind =
  | 'basic'
  | 'sword'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'hoe'
  | 'shears'
  | 'helmet'
  | 'chestplate'
  | 'leggings'
  | 'boots'
  | 'food'

export type CustomItemGroup = 'general' | 'weapon' | 'tool' | 'armor' | 'food'

export interface CustomItemKindInfo {
  id: CustomItemKind
  label: string
  /** event.create(id, registryType) 的第二个参数 */
  registryType: string
  group: CustomItemGroup
  /** 在左侧物品列表中的分类 */
  category: ItemCategory
  /** 是否支持 .tier(...)（武器 / 镐斧锹锄） */
  useToolTier?: boolean
  /** 是否属于 DiggerItem（镐 / 斧 / 锹 / 锄） */
  diggerLike?: boolean
  armorLike?: boolean
  /** 是否为食物（使用 .food(...)） */
  food?: boolean
  note: string
}

export const CUSTOM_ITEM_KINDS: CustomItemKindInfo[] = [
  {
    id: 'basic',
    label: '普通物品',
    registryType: 'basic',
    group: 'general',
    category: 'general',
    note: '只有通用属性；物品图标需要自己放贴图，或指向已有的贴图路径。'
  },
  {
    id: 'sword',
    label: '武器 · 剑',
    registryType: 'sword',
    group: 'weapon',
    category: 'weapon',
    useToolTier: true,
    note: '剑默认不可堆叠，攻击速度修饰值留空等同原版剑（-2.4，实际攻速 1.6）。'
  },
  {
    id: 'pickaxe',
    label: '工具 · 镐',
    registryType: 'pickaxe',
    group: 'tool',
    category: 'tool',
    useToolTier: true,
    diggerLike: true,
    note: '挖掘等级与挖掘速度由工具等级决定，可用「挖掘速度」单独覆盖。'
  },
  { id: 'axe', label: '工具 · 斧', registryType: 'axe', group: 'tool', category: 'tool', useToolTier: true, diggerLike: true, note: '与其他工具相同，伤害通常更高。' },
  { id: 'shovel', label: '工具 · 锹', registryType: 'shovel', group: 'tool', category: 'tool', useToolTier: true, diggerLike: true, note: '与其他工具相同。' },
  { id: 'hoe', label: '工具 · 锄', registryType: 'hoe', group: 'tool', category: 'tool', useToolTier: true, diggerLike: true, note: '与其他工具相同。' },
  {
    id: 'shears',
    label: '工具 · 剪刀',
    registryType: 'shears',
    group: 'tool',
    category: 'tool',
    note: '剪刀不支持工具等级（KubeJS 无对应 tier 参数），只有通用属性。'
  },
  { id: 'helmet', label: '盔甲 · 头盔', registryType: 'helmet', group: 'armor', category: 'armor', armorLike: true, note: '护甲值 / 韧性来自盔甲等级，会自动附加 forge:armors/helmets 标签。' },
  { id: 'chestplate', label: '盔甲 · 胸甲', registryType: 'chestplate', group: 'armor', category: 'armor', armorLike: true, note: '护甲值 / 韧性来自盔甲等级，会自动附加 forge:armors/chestplates 标签。' },
  { id: 'leggings', label: '盔甲 · 护腿', registryType: 'leggings', group: 'armor', category: 'armor', armorLike: true, note: '护甲值 / 韧性来自盔甲等级，会自动附加 forge:armors/leggings 标签。' },
  { id: 'boots', label: '盔甲 · 靴子', registryType: 'boots', group: 'armor', category: 'armor', armorLike: true, note: '护甲值 / 韧性来自盔甲等级，会自动附加 forge:armors/boots 标签。' },
  {
    id: 'food',
    label: '食物',
    registryType: 'basic',
    group: 'food',
    category: 'food',
    food: true,
    note: '食物在 KubeJS 中仍是 basic 类型，通过 .food(...) 配置饥饿值、饱和度与食用效果。'
  }
]

const KIND_MAP = new Map<CustomItemKind, CustomItemKindInfo>(CUSTOM_ITEM_KINDS.map((info) => [info.id, info]))

export function customItemKindInfo(kind: CustomItemKind): CustomItemKindInfo {
  return KIND_MAP.get(kind) ?? CUSTOM_ITEM_KINDS[0]
}

/** 界面下拉框用的分组选项 */
export const CUSTOM_KIND_GROUPS: { label: string; options: CustomItemKindInfo[] }[] = (
  [
    ['普通物品', 'general'],
    ['武器', 'weapon'],
    ['工具', 'tool'],
    ['盔甲', 'armor'],
    ['食物', 'food']
  ] as const
).map(([label, group]) => ({
  label,
  options: CUSTOM_ITEM_KINDS.filter((info) => info.group === group)
}))

/** 原版工具等级（.tier('diamond')） */
export const VANILLA_TOOL_TIERS = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'] as const

/** 原版工具等级的中文名（界面下拉展示用，生成脚本仍写英文等级 ID） */
export const VANILLA_TOOL_TIER_LABELS: Record<string, string> = {
  wood: '木质',
  stone: '石质',
  iron: '铁质',
  gold: '金质',
  diamond: '钻石',
  netherite: '下界合金'
}

/** 原版盔甲等级 */
export const VANILLA_ARMOR_TIERS = [
  'leather',
  'chainmail',
  'iron',
  'gold',
  'diamond',
  'netherite',
  'turtle'
] as const

/** 盔甲自动附加的 forge 标签（与 KubeJS 官方盔甲示例一致） */
export const ARMOR_FORGE_TAGS: Record<string, string> = {
  helmet: 'forge:armors/helmets',
  chestplate: 'forge:armors/chestplates',
  leggings: 'forge:armors/leggings',
  boots: 'forge:armors/boots'
}

/** 原版盔甲等级参考数值（用于表单预填；不填则按铁处理） */
export interface ArmorTierPreset {
  durabilityMultiplier: number
  /** [靴子, 护腿, 胸甲, 头盔] */
  slotProtections: [number, number, number, number]
  enchantmentValue: number
  toughness: number
  knockbackResistance: number
}

export const ARMOR_TIER_PRESETS: Record<string, ArmorTierPreset> = {
  leather: { durabilityMultiplier: 5, slotProtections: [1, 2, 3, 1], enchantmentValue: 15, toughness: 0, knockbackResistance: 0 },
  chainmail: { durabilityMultiplier: 15, slotProtections: [1, 4, 5, 2], enchantmentValue: 12, toughness: 0, knockbackResistance: 0 },
  iron: { durabilityMultiplier: 15, slotProtections: [2, 5, 6, 2], enchantmentValue: 9, toughness: 0, knockbackResistance: 0 },
  gold: { durabilityMultiplier: 7, slotProtections: [1, 3, 5, 2], enchantmentValue: 25, toughness: 0, knockbackResistance: 0 },
  diamond: { durabilityMultiplier: 33, slotProtections: [3, 6, 8, 3], enchantmentValue: 10, toughness: 2, knockbackResistance: 0 },
  netherite: { durabilityMultiplier: 37, slotProtections: [3, 6, 8, 3], enchantmentValue: 15, toughness: 3, knockbackResistance: 0.1 },
  turtle: { durabilityMultiplier: 25, slotProtections: [0, 0, 0, 2], enchantmentValue: 9, toughness: 0, knockbackResistance: 0 }
}

/** 各部位耐久系数（耐久 = durabilityMultiplier × 系数） */
export const ARMOR_DURABILITY_FACTORS: Record<string, number> = {
  boots: 13,
  leggings: 15,
  chestplate: 16,
  helmet: 11
}

/* ------------------------------------------------------------------ */
/* 数据结构                                                            */
/* ------------------------------------------------------------------ */

export interface CustomFoodEffect {
  /** 药水效果 ID，如 minecraft:speed */
  id: string
  /** 持续时间（秒），生成时转换为 tick */
  durationSeconds: number
  /** 等级（0 为 I 级） */
  amplifier: number
  /** 触发概率 0~1 */
  probability: number
}

export interface CustomFoodDef {
  /** 饥饿值 */
  hunger?: number | null
  /** 饱和度（原版数值，非倍率） */
  saturation?: number | null
  meat?: boolean | null
  fastToEat?: boolean | null
  alwaysEdible?: boolean | null
  effects: CustomFoodEffect[]
}

/** 自定义工具等级（ItemEvents.toolTierRegistry） */
export interface CustomToolTierDef {
  name: string
  uses?: number | null
  speed?: number | null
  attackDamageBonus?: number | null
  level?: number | null
  enchantmentValue?: number | null
  repairIngredient?: string | null
}

/** 自定义盔甲等级（ItemEvents.armorTierRegistry） */
export interface CustomArmorTierDef {
  name: string
  durabilityMultiplier?: number | null
  /** [靴子, 护腿, 胸甲, 头盔] */
  slotProtections?: number[] | null
  enchantmentValue?: number | null
  repairIngredient?: string | null
  toughness?: number | null
  knockbackResistance?: number | null
}

export interface CustomItemDef {
  /** 物品 id（不含命名空间） */
  name: string
  namespace: string
  kind: CustomItemKind
  displayName: string
  /** 物品图标贴图，如 kubejs:item/my_sword；留空则用 kubejs:item/<name> */
  texture: string
  maxStackSize?: number | null
  maxDamage?: number | null
  glow?: boolean | null
  fireResistant?: boolean | null
  rarity?: Rarity | null
  tooltip?: string
  /** 工具 / 武器：等级名（原版或自定义） */
  tier?: string | null
  /** 工具 / 武器：基础攻击伤害（在等级加成之外，留空用 KubeJS 默认） */
  attackDamageBaseline?: number | null
  /** 工具 / 武器：攻击速度修饰值（实际攻速 = 4.0 + 该值） */
  speedBaseline?: number | null
  /** 工具 / 武器：攻击伤害加成（写入等级） */
  attackDamageBonus?: number | null
  /** 工具：挖掘速度覆盖（写入等级） */
  digSpeed?: number | null
  /** 盔甲：等级名（原版或自定义） */
  armorTier?: string | null
  food?: CustomFoodDef | null
}

export interface CustomItemLibrary {
  /**
   * 物品库（可编辑的工作集）：只有这里的物品会被生成到脚本中。
   * 从物品库移除不会影响 created（物品列表里仍然显示）。
   */
  items: CustomItemDef[]
  /**
   * 已创建的物品（物品选择列表中 KubeIE 模组的条目来源）。
   * 保存到物品库时会同步写入；在列表中删除时只移除这里，不影响 items。
   */
  created: CustomItemDef[]
  toolTiers: CustomToolTierDef[]
  armorTiers: CustomArmorTierDef[]
}

/* ------------------------------------------------------------------ */
/* 工厂与规范化                                                        */
/* ------------------------------------------------------------------ */

export function createEmptyFoodDef(): CustomFoodDef {
  return { hunger: 4, saturation: 0.6, meat: false, fastToEat: false, alwaysEdible: false, effects: [] }
}

export function createEmptyFoodEffect(): CustomFoodEffect {
  return { id: 'minecraft:speed', durationSeconds: 10, amplifier: 0, probability: 1 }
}

export function createEmptyCustomItem(kind: CustomItemKind = 'basic'): CustomItemDef {
  const info = customItemKindInfo(kind)
  const def: CustomItemDef = {
    name: '',
    namespace: DEFAULT_CUSTOM_NAMESPACE,
    kind,
    displayName: '',
    texture: '',
    maxStackSize: null,
    maxDamage: null,
    glow: false,
    fireResistant: false,
    rarity: null,
    tooltip: ''
  }
  if (info.useToolTier) {
    def.tier = 'iron'
    def.attackDamageBaseline = null
    def.speedBaseline = null
    def.attackDamageBonus = null
    if (info.diggerLike) def.digSpeed = null
  }
  if (info.armorLike) def.armorTier = 'iron'
  if (info.food) def.food = createEmptyFoodDef()
  return def
}

export function createEmptyToolTier(): CustomToolTierDef {
  return {
    name: '',
    uses: 250,
    speed: 6,
    attackDamageBonus: 2,
    level: 2,
    enchantmentValue: 14,
    repairIngredient: ''
  }
}

export function createEmptyArmorTier(): CustomArmorTierDef {
  return {
    name: '',
    durabilityMultiplier: 15,
    slotProtections: [2, 5, 6, 2],
    enchantmentValue: 9,
    repairIngredient: '',
    toughness: 0,
    knockbackResistance: 0
  }
}

/** 空物品库（物品库 / 已创建物品 / 自定义等级均为空） */
export function createEmptyCustomLibrary(): CustomItemLibrary {
  return { items: [], created: [], toolTiers: [], armorTiers: [] }
}

export function customItemId(def: { namespace: string; name: string }): string {
  const namespace = (def.namespace || DEFAULT_CUSTOM_NAMESPACE).trim()
  return `${namespace}:${(def.name || '').trim()}`
}

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
  return text === 'COMMON' || text === 'UNCOMMON' || text === 'RARE' || text === 'EPIC'
    ? (text as Rarity)
    : null
}

/** 读取一组物品定义（过滤非法项、按 ID 去重、限制上限） */
function readItemList(value: unknown): CustomItemDef[] {
  const rawItems = Array.isArray(value) ? value : []
  const items: CustomItemDef[] = []
  const seen = new Set<string>()
  for (const entry of rawItems) {
    const def = normalizeCustomItem(entry)
    if (!def) continue
    const id = customItemId(def)
    if (seen.has(id)) continue
    seen.add(id)
    items.push(def)
    if (items.length >= MAX_CUSTOM_ITEMS) break
  }
  return items
}

/** 外部输入（磁盘 / IPC）规范化：非法字段一律丢弃，保证界面拿到结构完整的数据 */
export function normalizeCustomLibrary(input: unknown): CustomItemLibrary {
  const raw = (input ?? {}) as Record<string, unknown>
  const rawToolTiers = Array.isArray(raw.toolTiers) ? raw.toolTiers : []
  const rawArmorTiers = Array.isArray(raw.armorTiers) ? raw.armorTiers : []

  const items = readItemList(raw.items)
  // 旧版本文件没有 created 字段：回退为 items，保证升级后物品列表不为空
  const created = Array.isArray(raw.created) ? readItemList(raw.created) : readItemList(raw.items)

  const toolTiers: CustomToolTierDef[] = []
  for (const entry of rawToolTiers) {
    if (!entry || typeof entry !== 'object') continue
    const tier = entry as Record<string, unknown>
    const name = asText(tier.name).trim()
    if (!name) continue
    toolTiers.push({
      name,
      uses: asNumber(tier.uses),
      speed: asNumber(tier.speed),
      attackDamageBonus: asNumber(tier.attackDamageBonus),
      level: asNumber(tier.level),
      enchantmentValue: asNumber(tier.enchantmentValue),
      repairIngredient: asText(tier.repairIngredient)
    })
    if (toolTiers.length >= MAX_CUSTOM_TIERS) break
  }

  const armorTiers: CustomArmorTierDef[] = []
  for (const entry of rawArmorTiers) {
    if (!entry || typeof entry !== 'object') continue
    const tier = entry as Record<string, unknown>
    const name = asText(tier.name).trim()
    if (!name) continue
    const protections = Array.isArray(tier.slotProtections)
      ? (tier.slotProtections as unknown[]).slice(0, 4).map((value) => asNumber(value) ?? 0)
      : null
    armorTiers.push({
      name,
      durabilityMultiplier: asNumber(tier.durabilityMultiplier),
      slotProtections: protections && protections.length === 4 ? protections : null,
      enchantmentValue: asNumber(tier.enchantmentValue),
      repairIngredient: asText(tier.repairIngredient),
      toughness: asNumber(tier.toughness),
      knockbackResistance: asNumber(tier.knockbackResistance)
    })
    if (armorTiers.length >= MAX_CUSTOM_TIERS) break
  }

  return { items, created, toolTiers, armorTiers }
}

function normalizeCustomItem(input: unknown): CustomItemDef | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const name = asText(raw.name).trim()
  if (!name) return null
  const kind = CUSTOM_ITEM_KINDS.some((info) => info.id === raw.kind)
    ? (raw.kind as CustomItemKind)
    : 'basic'
  const info = customItemKindInfo(kind)

  const def: CustomItemDef = {
    name,
    namespace: asText(raw.namespace).trim() || DEFAULT_CUSTOM_NAMESPACE,
    kind,
    displayName: asText(raw.displayName),
    texture: asText(raw.texture),
    maxStackSize: asNumber(raw.maxStackSize),
    maxDamage: asNumber(raw.maxDamage),
    glow: asBool(raw.glow) ?? false,
    fireResistant: asBool(raw.fireResistant) ?? false,
    rarity: asRarity(raw.rarity),
    tooltip: asText(raw.tooltip)
  }

  if (info.useToolTier) {
    def.tier = asText(raw.tier) || 'iron'
    def.attackDamageBaseline = asNumber(raw.attackDamageBaseline)
    def.speedBaseline = asNumber(raw.speedBaseline)
    def.attackDamageBonus = asNumber(raw.attackDamageBonus)
    if (info.diggerLike) def.digSpeed = asNumber(raw.digSpeed)
  }
  if (info.armorLike) def.armorTier = asText(raw.armorTier) || 'iron'
  if (info.food) {
    const food = (raw.food ?? {}) as Record<string, unknown>
    const effects: CustomFoodEffect[] = []
    if (Array.isArray(food.effects)) {
      for (const effect of food.effects) {
        if (!effect || typeof effect !== 'object') continue
        const item = effect as Record<string, unknown>
        effects.push({
          id: asText(item.id).trim(),
          durationSeconds: asNumber(item.durationSeconds) ?? 10,
          amplifier: asNumber(item.amplifier) ?? 0,
          probability: asNumber(item.probability) ?? 1
        })
        if (effects.length >= MAX_FOOD_EFFECTS) break
      }
    }
    def.food = {
      hunger: asNumber(food.hunger),
      saturation: asNumber(food.saturation),
      meat: asBool(food.meat) ?? false,
      fastToEat: asBool(food.fastToEat) ?? false,
      alwaysEdible: asBool(food.alwaysEdible) ?? false,
      effects
    }
  }

  return def
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

function checkInteger(
  value: number | null | undefined,
  label: string,
  min: number,
  max: number,
  errors: string[],
  warnings?: string[],
  warnAbove?: number
): void {
  if (value === null || value === undefined) return
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    errors.push(`${label}必须是整数`)
    return
  }
  if (value < min || value > max) {
    errors.push(`${label}应在 ${min} ~ ${max} 之间（当前 ${value}）`)
    return
  }
  if (warnings && warnAbove !== undefined && value > warnAbove) {
    warnings.push(`${label}为 ${value}，超出常见范围（> ${warnAbove}），请确认`)
  }
}

function checkFloatRange(
  value: number | null | undefined,
  label: string,
  min: number,
  max: number,
  errors: string[]
): void {
  if (value === null || value === undefined) return
  if (!Number.isFinite(value)) {
    errors.push(`${label}必须是数字`)
    return
  }
  if (value < min || value > max) {
    errors.push(`${label}应在 ${min} ~ ${max} 之间（当前 ${value}）`)
  }
}

/** 单个自定义物品的校验 */
export function validateCustomItem(
  def: CustomItemDef,
  library?: CustomItemLibrary,
  selfIndex = -1
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const info = customItemKindInfo(def.kind)

  const name = (def.name ?? '').trim()
  if (!name) {
    errors.push('物品 ID 不能为空')
  } else if (!ITEM_NAME_PATTERN.test(name)) {
    errors.push(`物品 ID 只能包含小写字母、数字、下划线、中划线与点：${name}`)
  }

  const namespace = (def.namespace ?? '').trim() || DEFAULT_CUSTOM_NAMESPACE
  if (!NAMESPACE_PATTERN.test(namespace)) {
    errors.push(`命名空间只能包含小写字母、数字、下划线、中划线与点：${namespace}`)
  }
  if (namespace === 'minecraft') {
    errors.push('命名空间不能用 minecraft（会与原版物品冲突）')
  }

  // 重名 / 与已有物品冲突
  if (library && name) {
    const duplicate = library.items.findIndex(
      (item, index) =>
        index !== selfIndex &&
        (item.name ?? '').trim() === name &&
        ((item.namespace ?? '').trim() || DEFAULT_CUSTOM_NAMESPACE) === namespace
    )
    if (duplicate >= 0) errors.push(`物品 ID 已存在：${namespace}:${name}（请改名或先删除原定义）`)
  }

  if (!(def.displayName ?? '').trim()) {
    warnings.push('未填写显示名称：游戏内将显示为 item.' + namespace + '.' + (name || '<id>'))
  } else if ((def.displayName ?? '').includes('§')) {
    warnings.push('显示名称包含 § 颜色代码，部分场景可能显示异常')
  }

  const texture = (def.texture ?? '').trim()
  if (!texture) {
    warnings.push(
      `未指定贴图：需要自行放置 assets/${namespace}/textures/item/${name || '<id>'}.png，否则图标显示为紫黑方块`
    )
  } else if (!RESOURCE_ID_PATTERN.test(texture)) {
    errors.push(`贴图路径格式非法：${texture}（应形如 kubejs:item/my_sword）`)
  }

  checkInteger(def.maxStackSize, '最大堆叠数', 1, 64, errors)
  checkInteger(def.maxDamage, '最大耐久', 1, 1000000, errors, warnings, 200000)

  if (def.maxDamage != null && def.maxStackSize != null && def.maxStackSize > 1) {
    errors.push('最大耐久与最大堆叠数不能同时设置（有耐久的物品必须不可堆叠）')
  }

  if (info.useToolTier) {
    const tier = (def.tier ?? '').trim()
    const customTierNames = new Set((library?.toolTiers ?? []).map((item) => item.name))
    if (!tier) {
      errors.push('请选择工具等级（原版等级或自定义等级）')
    } else if (!(VANILLA_TOOL_TIERS as readonly string[]).includes(tier) && !customTierNames.has(tier)) {
      errors.push(`工具等级不存在：${tier}（可填原版等级或下方已定义的自定义等级）`)
    }
    checkFloatRange(def.attackDamageBaseline, '基础攻击伤害', 0, 100, errors)
    checkFloatRange(def.attackDamageBonus, '攻击伤害加成', 0, 100, errors)
    checkFloatRange(def.speedBaseline, '攻击速度修饰值', -4, 4, errors)
    if (info.diggerLike) checkFloatRange(def.digSpeed, '挖掘速度', 0, 100, errors)
  }

  if (info.armorLike) {
    const tier = (def.armorTier ?? '').trim()
    const customTierNames = new Set((library?.armorTiers ?? []).map((item) => item.name))
    if (!tier) {
      errors.push('请选择盔甲等级（原版等级或自定义等级）')
    } else if (!(VANILLA_ARMOR_TIERS as readonly string[]).includes(tier) && !customTierNames.has(tier)) {
      errors.push(`盔甲等级不存在：${tier}（可填原版等级或下方已定义的自定义等级）`)
    }
  }

  if (info.food) {
    const food = def.food
    if (!food) {
      errors.push('食物属性缺失，请重新选择类型')
    } else {
      checkInteger(food.hunger, '饥饿值', 0, 20, errors)
      checkFloatRange(food.saturation, '饱和度', 0, 20, errors)
      if (food.hunger == null) warnings.push('未设置饥饿值：游戏内将不回复饥饿（等效 0）')
      if (food.saturation != null && food.hunger != null && food.hunger === 0 && food.saturation > 0) {
        warnings.push('饥饿值为 0 时饱和度不会生效')
      }
      food.effects.forEach((effect, index) => {
        const label = `食用效果 ${index + 1}`
        const id = (effect.id ?? '').trim()
        if (!id) {
          errors.push(`${label}：效果 ID 不能为空`)
        } else if (!RESOURCE_ID_PATTERN.test(id)) {
          errors.push(`${label}：效果 ID 格式非法：${id}（应形如 minecraft:speed）`)
        }
        checkInteger(effect.durationSeconds, `${label}：持续时间（秒）`, 1, 3600, errors)
        checkInteger(effect.amplifier, `${label}：等级`, 0, 9, errors)
        checkFloatRange(effect.probability, `${label}：概率`, 0, 1, errors)
        if (effect.probability === 0) warnings.push(`${label}：概率为 0，永远不会触发`)
      })
    }
  }

  return { errors, warnings }
}

/** 自定义工具等级校验 */
export function validateToolTier(tier: CustomToolTierDef, library: CustomItemLibrary, selfIndex = -1): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const name = (tier.name ?? '').trim()

  if (!name) {
    errors.push('等级 ID 不能为空')
  } else if (!ITEM_NAME_PATTERN.test(name)) {
    errors.push(`等级 ID 只能包含小写字母、数字、下划线、中划线与点：${name}`)
  } else if ((VANILLA_TOOL_TIERS as readonly string[]).includes(name)) {
    errors.push(`等级 ID 与原版重名：${name}（原版等级可直接使用，无需自定义）`)
  } else if (library.toolTiers.some((item, index) => index !== selfIndex && item.name === name)) {
    errors.push(`工具等级已存在：${name}`)
  }

  checkInteger(tier.uses, '耐久', 1, 100000, errors, warnings, 20000)
  checkFloatRange(tier.speed, '挖掘速度', 0, 100, errors)
  checkFloatRange(tier.attackDamageBonus, '攻击伤害加成', 0, 100, errors)
  checkInteger(tier.level, '挖掘等级', 0, 10, errors)
  checkInteger(tier.enchantmentValue, '附魔能力', 0, 100, errors, warnings, 30)

  const repair = (tier.repairIngredient ?? '').trim()
  if (repair && !RESOURCE_ID_PATTERN.test(repair) && !repair.startsWith('#')) {
    errors.push(`修复材料格式非法：${repair}（应为物品 ID 或 #标签）`)
  }

  // 被物品引用的等级不给删（由界面控制），这里只做提示
  const used = library.items.filter((item) => item.kind !== 'basic' && (item.tier ?? '') === name)
  if (used.length > 0) warnings.push(`该等级正被 ${used.length} 个自定义物品引用`)

  return { errors, warnings }
}

/** 自定义盔甲等级校验 */
export function validateArmorTier(tier: CustomArmorTierDef, library: CustomItemLibrary, selfIndex = -1): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const name = (tier.name ?? '').trim()

  if (!name) {
    errors.push('等级 ID 不能为空')
  } else if (!ITEM_NAME_PATTERN.test(name)) {
    errors.push(`等级 ID 只能包含小写字母、数字、下划线、中划线与点：${name}`)
  } else if ((VANILLA_ARMOR_TIERS as readonly string[]).includes(name)) {
    errors.push(`等级 ID 与原版重名：${name}（原版等级可直接使用，无需自定义）`)
  } else if (library.armorTiers.some((item, index) => index !== selfIndex && item.name === name)) {
    errors.push(`盔甲等级已存在：${name}`)
  }

  checkInteger(tier.durabilityMultiplier, '耐久倍率', 1, 200, errors, warnings, 60)
  checkInteger(tier.enchantmentValue, '附魔能力', 0, 100, errors)
  checkFloatRange(tier.toughness, '盔甲韧性', 0, 20, errors)
  checkFloatRange(tier.knockbackResistance, '击退抗性', 0, 1, errors)

  const protections = tier.slotProtections
  if (protections) {
    if (protections.length !== 4) {
      errors.push('护甲值必须是 4 个数字，顺序为 [靴子, 护腿, 胸甲, 头盔]')
    } else {
      protections.forEach((value, index) => {
        const part = ['靴子', '护腿', '胸甲', '头盔'][index]
        checkInteger(value, `${part}护甲值`, 0, 20, errors)
      })
    }
  }

  const repair = (tier.repairIngredient ?? '').trim()
  if (repair && !RESOURCE_ID_PATTERN.test(repair) && !repair.startsWith('#')) {
    errors.push(`修复材料格式非法：${repair}（应为物品 ID 或 #标签）`)
  }

  const used = library.items.filter((item) => customItemKindInfo(item.kind).armorLike && (item.armorTier ?? '') === name)
  if (used.length > 0) warnings.push(`该等级正被 ${used.length} 个自定义物品引用`)

  return { errors, warnings }
}

/** 整库校验（写脚本前调用） */
export function validateCustomLibrary(library: CustomItemLibrary): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (library.items.length === 0) {
    errors.push('自定义物品库为空，请先添加物品')
  }

  library.items.forEach((item, index) => {
    const label = `物品 ${index + 1}（${item.name || '未命名'}）`
    const result = validateCustomItem(item, library, index)
    errors.push(...result.errors.map((message) => `${label}：${message}`))
    warnings.push(...result.warnings.map((message) => `${label}：${message}`))
  })

  library.toolTiers.forEach((tier, index) => {
    const result = validateToolTier(tier, library, index)
    errors.push(...result.errors.map((message) => `工具等级「${tier.name || '未命名'}」：${message}`))
    warnings.push(...result.warnings.map((message) => `工具等级「${tier.name || '未命名'}」：${message}`))
  })

  library.armorTiers.forEach((tier, index) => {
    const result = validateArmorTier(tier, library, index)
    errors.push(...result.errors.map((message) => `盔甲等级「${tier.name || '未命名'}」：${message}`))
    warnings.push(...result.warnings.map((message) => `盔甲等级「${tier.name || '未命名'}」：${message}`))
  })

  // 未被引用的等级：仅提示（KubeJS 注册未使用的等级不会报错）
  const usedToolTiers = new Set(library.items.map((item) => (item.tier ?? '').trim()))
  const unusedTool = library.toolTiers.filter((tier) => tier.name && !usedToolTiers.has(tier.name))
  if (unusedTool.length > 0) {
    warnings.push(`未被引用的工具等级：${unusedTool.map((tier) => tier.name).join('、')}（仍会写入脚本）`)
  }
  const usedArmorTiers = new Set(library.items.map((item) => (item.armorTier ?? '').trim()))
  const unusedArmor = library.armorTiers.filter((tier) => tier.name && !usedArmorTiers.has(tier.name))
  if (unusedArmor.length > 0) {
    warnings.push(`未被引用的盔甲等级：${unusedArmor.map((tier) => tier.name).join('、')}（仍会写入脚本）`)
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/** 该自定义物品在物品列表中需要的标记（供属性编辑 / 配方使用） */
export function customItemToEntry(def: CustomItemDef): ItemEntry {
  const info = customItemKindInfo(def.kind)
  const id = customItemId(def)
  return {
    id,
    name: (def.displayName ?? '').trim() || def.name,
    mod: CUSTOM_ITEM_MOD,
    category: info.category,
    edible: info.food === true,
    armorLike: info.armorLike === true,
    toolLike: info.useToolTier === true,
    diggerLike: info.diggerLike === true
  }
}

/** 已创建物品映射为物品列表条目（左侧「物品选择」区显示的 KubeIE 模组物品） */
export function customItemsToEntries(library: CustomItemLibrary): ItemEntry[] {
  const list = Array.isArray(library?.created) ? library.created : (library?.items ?? [])
  return list.map(customItemToEntry)
}

/** 保存到物品库：列表中存在同 ID 项则原地替换，否则追加到末尾 */
export function upsertItemInList(list: CustomItemDef[], def: CustomItemDef): CustomItemDef[] {
  const id = customItemId(def)
  const next = list.map((item) => ({ ...item }))
  const index = next.findIndex((item) => customItemId(item) === id)
  if (index >= 0) next.splice(index, 1, { ...def })
  else next.push({ ...def })
  return next
}

/** 按 ID 从列表中移除（物品库 / 已创建列表通用） */
export function removeCustomItemById(list: CustomItemDef[], id: string): CustomItemDef[] {
  return list.filter((item) => customItemId(item) !== id)
}

/** 摘要标签（物品库卡片、队列展示用） */
export function summarizeCustomItem(def: CustomItemDef): string[] {
  const info = customItemKindInfo(def.kind)
  const tags: string[] = [info.label, customItemId(def)]
  if (def.displayName) tags.push(def.displayName)

  if (info.useToolTier && def.tier) tags.push(`等级 ${def.tier}`)
  if (info.armorLike && def.armorTier) tags.push(`盔甲等级 ${def.armorTier}`)
  if (def.attackDamageBaseline != null) tags.push(`基础伤害 ${def.attackDamageBaseline}`)
  if (def.speedBaseline != null) tags.push(`攻速修饰 ${def.speedBaseline}`)
  if (def.attackDamageBonus != null) tags.push(`伤害加成 ${def.attackDamageBonus}`)
  if (def.digSpeed != null) tags.push(`挖掘速度 ${def.digSpeed}`)
  if (def.maxStackSize != null) tags.push(`堆叠 ${def.maxStackSize}`)
  if (def.maxDamage != null) tags.push(`耐久 ${def.maxDamage}`)
  if (def.fireResistant) tags.push('抗火')
  if (def.glow) tags.push('发光')
  if (def.rarity) tags.push(`稀有度 ${def.rarity.toLowerCase()}`)
  if (info.food && def.food) {
    tags.push(`饥饿 ${def.food.hunger ?? 0}`)
    if (def.food.saturation != null) tags.push(`饱和 ${def.food.saturation}`)
    if (def.food.effects.length > 0) tags.push(`效果 ×${def.food.effects.length}`)
    if (def.food.alwaysEdible) tags.push('随时可食用')
  }
  return tags
}
