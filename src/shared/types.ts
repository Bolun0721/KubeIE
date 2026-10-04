/**
 * 主进程 / 预加载脚本 / 渲染进程共享的类型定义。
 * 对应开发方案 6.1 数据模型与 4.1 三层架构。
 */

import type { CurioLibrary, CuriosSlotConfig } from './curios'
import type { CustomItemLibrary } from './customItems'

/** 稀有度，取值必须为大写字符串，与 KubeJS 官方 Wiki 示例一致 */
export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC'

/** 物品类型，用于界面按类型动态渲染可编辑属性 */
export type ItemCategory =
  | 'general'
  | 'material'
  | 'block'
  | 'food'
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'misc'

/** KubeJS 版本模板标识 */
export type KubeJsProfileId = 'kjs6-1.20' | 'kjs6-1.20-direct' | 'kjs7-1.21'

/** 工具/武器属性写法 */
export type TierStyle = 'callback' | 'direct'

/** KubeJS 版本模板（方案 9 风险应对：内置多版本模板） */
export interface KubeJsProfile {
  id: KubeJsProfileId
  /** 界面展示名称 */
  label: string
  /** 适配的 Minecraft 版本范围 */
  mcVersions: string
  /** KubeJS 大版本 */
  kubejs: 'KubeJS 6' | 'KubeJS 7'
  /** 该版本下 maxStackSize 允许的上限（1.20.5+ 数据组件允许至 99） */
  maxStackSizeLimit: number
  tierStyle: TierStyle
  /** 界面提示信息 */
  notes: string
}

export interface TierProperties {
  /** 挖掘速度 */
  speed?: number | null
  /** 攻击伤害加成（加成值，非最终伤害） */
  attackDamageBonus?: number | null
  /**
   * 攻击速度修饰值（Attention：不是最终攻速）。
   * 实际攻击速度 = 4.0 + 该值（原版剑为 -2.4 → 实际 1.6；斧为 -3.2 ~ -3.0）。
   * KubeJS 通过重设 ATTACK_SPEED 基础修饰符实现，盔甲类会抛 UnsupportedOperationException。
   */
  attackSpeed?: number | null
  /** 工具等级 */
  level?: number | null
  /** 铁砧修复材料（物品 ID） */
  repairIngredient?: string | null
}

/**
 * 护甲属性（仅 ArmorItem 支持，KubeJS 内部按槽位重设 ARMOR / ARMOR_TOUGHNESS 修饰符）。
 * 对应参考写法：item.armorProtection / item.armorToughness
 */
export interface ArmorProperties {
  /** 护甲值（盔甲条），原版单件 1 ~ 8，护甲条满格为 20 */
  protection?: number | null
  /** 盔甲韧性（护甲值旁的灰条），原版仅钻石 / 下界合金每件 +2 */
  toughness?: number | null
}

/**
 * 药水效果条目：对应 FoodTweaker 配置中 `foods.<物品ID>.effects[]` 的元素。
 * 字段与模组 `FoodTweakerConfig$EffectEntry` 一一对应（JS 侧 camelCase → JSON 侧 snake_case）。
 */
export interface FoodEffect {
  /** 效果 ID，如 minecraft:speed */
  id: string
  /** 效果等级：0 = I 级，1 = II 级，依次类推 */
  amplifier: number
  /** 持续秒数 */
  durationSeconds: number
  /** 触发概率 0.0 ~ 1.0（河豚式概率生效） */
  probability: number
  /** 是否使用更柔和的环境粒子，缺省 false */
  ambient?: boolean | null
  /** 是否显示效果粒子，缺省 true */
  showParticles?: boolean | null
  /** 是否在 HUD 显示效果图标，缺省 true */
  showIcon?: boolean | null
}

/**
 * FoodTweaker 食物覆盖项（对应 `config/foodtweaker.json` 中 `foods.<物品ID>`）。
 *
 * 语义（依据模组 FoodTweaker 1.0.0 反编译结果）：
 * - 所有字段均可选，**未填写的字段保持物品当前数值不变**；
 * - `saturation` 是「饱和度倍率」，实际饱和度 = nutrition × saturation × 2；
 * - `eatSeconds` ≤ 0.8 记为快速食用，其余按标准速度（1.20.1 只区分这两档）；
 * - 填写 `effects` 会**替换**该物品原有的全部食用效果，留空则保留原效果；
 * - 对当前不是食物的物品，nutrition 与 saturation 必须同时填写，否则模组会跳过该条目。
 */
export interface FoodProperties {
  /** 营养值（饥饿值恢复量，2 = 半个鸡腿） */
  nutrition?: number | null
  /** 饱和度倍率 */
  saturation?: number | null
  /** 饥饿值满时是否仍可食用 */
  canAlwaysEat?: boolean | null
  /** 食用耗时（秒） */
  eatSeconds?: number | null
  /** 食用时施加的效果列表（填写即替换原有全部效果） */
  effects?: FoodEffect[] | null
  /** 置为 true 时从配置中移除该物品的覆盖项，恢复原版数值 */
  remove?: boolean
}

export interface ItemProperties {
  maxStackSize?: number | null
  maxDamage?: number | null
  burnTime?: number | null
  fireResistant?: boolean | null
  rarity?: Rarity | null
  craftingRemainder?: string | null
  tier?: TierProperties | null
  /** 护甲属性（护甲值 / 盔甲韧性），由 KubeJS 脚本承载 */
  armor?: ArmorProperties | null
  /** 由 FoodTweaker 模组读取（写入 config/foodtweaker.json），与 KubeJS 脚本无关 */
  foodProperties?: FoodProperties | null
}

/** 已补齐显示开关默认值的食用效果（表单与配置生成使用，取值确定） */
export interface ResolvedFoodEffect extends Omit<FoodEffect, 'ambient' | 'showParticles' | 'showIcon'> {
  ambient: boolean
  showParticles: boolean
  showIcon: boolean
}

/** 已补齐默认值的食物覆盖项（effects / remove 取值确定） */
export interface ResolvedFoodProperties extends Omit<FoodProperties, 'effects' | 'remove'> {
  effects: ResolvedFoodEffect[]
  remove: boolean
}

/** 单条物品修改记录（本次会话队列项 / 生成脚本的最小单元） */
export interface ItemModification {
  itemId: string
  properties: ItemProperties
}

/** 队列项：在 ItemModification 基础上附带界面展示信息 */
export interface QueueEntry {
  itemId: string
  displayName: string
  properties: ItemProperties
}

/* ------------------------------------------------------------------ */
/* 物品数据库                                                          */
/* ------------------------------------------------------------------ */

/** 内置物品库中的原版食物默认值（JSON 字段沿用 hunger，语义等同 FoodTweaker 的 nutrition） */
export interface FoodDefaults {
  hunger?: number | null
  saturation?: number | null
  canAlwaysEat?: boolean | null
  eatSeconds?: number | null
}

export interface ItemDefaults extends Omit<ItemProperties, 'foodProperties'> {
  /** 原版默认最大堆叠数 */
  defaultStackSize?: number | null
  /** 原版默认食物数值 */
  foodProperties?: FoodDefaults
}

export interface ItemEntry {
  /** 注册名，如 minecraft:ender_pearl */
  id: string
  /** 中文名称 */
  name: string
  /** 所属模组命名空间 */
  mod: string
  category: ItemCategory
  /** 原版是否为食物（决定界面是否默认开启食物属性编辑） */
  edible: boolean
  /**
   * 是否为盔甲类物品（net.minecraft.world.item.ArmorItem）。
   * 由内置的护甲数值表推导：盾牌 / 鞘翅虽然分类为 armor，但**不是** ArmorItem，
   * KubeJS 对其设置 armorProtection / armorToughness 会抛 UnsupportedOperationException。
   */
  armorLike?: boolean
  /** 是否可设置工具/武器属性（对应 KubeJS 的 TieredItem：剑 / 镐 / 斧 / 锹 / 锄） */
  toolLike: boolean
  /**
   * 是否属于 KubeJS 可设置 `item.digSpeed` 的挖掘类工具（DiggerItem：镐 / 斧 / 锹 / 锄）。
   * 剑等非 DiggerItem 设置 digSpeed 会抛出 IllegalArgumentException 并中断整个 modification 事件，
   * 因此生成脚本时必须据此区分。
   */
  diggerLike?: boolean
  /** 原版默认属性值，仅收录确信的数值，未知字段留空 */
  defaults?: ItemDefaults
}

export interface ItemQuery {
  keyword?: string
  mod?: string
  category?: ItemCategory | ''
  offset?: number
  limit?: number
}

export interface ItemQueryResult {
  total: number
  items: ItemEntry[]
}

export interface ItemFacets {
  mods: string[]
  categories: ItemCategory[]
  total: number
}

/* ------------------------------------------------------------------ */
/* 路径检测                                                            */
/* ------------------------------------------------------------------ */

/** 一个可用的 KubeJS 脚本写入位置 */
export interface ScriptLocation {
  /** 游戏目录（启动器实例目录） */
  gameDir: string
  kubejsDir: string
  startupScriptsDir: string
  /** 服务端脚本目录（配方脚本写入此处，需 /reload 或 /kubejs reload server_scripts 生效） */
  serverScriptsDir: string
  /** backup 目录，位于 kubejs/backup，避免被 KubeJS 扫描 */
  backupDir: string
  /** 是否开启版本隔离 */
  isolated: boolean
  versionName?: string
  /** 探测到的 Minecraft 版本 */
  mcVersion?: string
  /** 探测到的 KubeJS 文件名 */
  kubejsJar?: string
  /** 依据探测结果推荐的模板 */
  suggestedProfileId?: KubeJsProfileId
}

export interface DirInspection {
  dir: string
  exists: boolean
  /** 是否可用于写入脚本（存在 kubejs 目录） */
  usable: boolean
  locations: ScriptLocation[]
  message: string
}

export interface CandidateDir {
  dir: string
  /** 候选来源说明，如「官方启动器默认目录」 */
  source: string
  inspection: DirInspection
}

export interface ScanResult {
  candidates: CandidateDir[]
  /** 是否有任何可用目录 */
  anyUsable: boolean
}

/* ------------------------------------------------------------------ */
/* 配置持久化                                                          */
/* ------------------------------------------------------------------ */

export interface GeneratedRecord {
  filePath: string
  at: string
  itemCount: number
  backupPath?: string
}

export interface AppConfig {
  /** 当前选定的游戏目录 */
  gameDir: string
  /** 当前选定的 startup_scripts 目录 */
  startupScriptsDir: string
  /** 当前选定的 server_scripts 目录（配方脚本） */
  serverScriptsDir: string
  /** 配方脚本的文件名 */
  recipeFileName: string
  /** 自定义物品脚本的文件名 */
  customFileName: string
  /** 自定义饰品（Curios）脚本的文件名 */
  curioFileName: string
  /** backup 目录 */
  backupDir: string
  /** 检测到的 MC 版本，如 1.20.1 */
  mcVersion: string
  /** 当前使用的模板 */
  profileId: KubeJsProfileId
  /** 生成脚本的文件名 */
  outputFileName: string
  /** 写入前是否自动备份 */
  backupEnabled: boolean
  /** 已生成脚本索引 */
  generated: GeneratedRecord[]
}

/* ------------------------------------------------------------------ */
/* 编辑记录（写入历史）                                                */
/* ------------------------------------------------------------------ */

/** 编辑记录的目标文件类型：KubeJS 脚本 / FoodTweaker 配置 */
export type EditRecordTarget = 'script' | 'food'

/**
 * 一条编辑记录：某次「应用修改」写入某个目标文件中的某个物品。
 * 同一个物品若同时含有脚本属性与食物属性，会分别记录到两个目标文件下。
 */
export interface EditRecord {
  /** 唯一标识（写入时间 + 目标 + 物品），用于列表渲染 */
  id: string
  /** 写入时间（ISO 字符串） */
  at: string
  /** 所属脚本名称：KubeJS 脚本文件名，或固定为 foodtweaker.json */
  scriptName: string
  /** 目标文件完整路径 */
  filePath: string
  target: EditRecordTarget
  itemId: string
  displayName: string
  /** 已规范化的属性（仅保留实际写入的字段） */
  properties: ItemProperties
}

/** 编辑记录按所属脚本名称分组后的结果 */
export interface EditRecordGroup {
  scriptName: string
  target: EditRecordTarget
  filePath: string
  /** 组内最新一条记录的写入时间 */
  latestAt: string
  /** 组内记录，按写入时间倒序 */
  records: EditRecord[]
}

/**
 * 一条配方记录：某次「应用修改」写入配方脚本时的一个配方条目。
 * 一次写入包含多条配方时会拆成多条记录（写入时间相同），便于按脚本名称分组展示。
 */
export interface RecipeRecord {
  /** 唯一标识（写入时间 + 目标 + 序号） */
  id: string
  /** 写入时间（ISO 字符串） */
  at: string
  /** 所属脚本名称（配方脚本文件名） */
  scriptName: string
  /** 目标文件完整路径 */
  filePath: string
  /** 覆盖前的备份文件（如有） */
  backupPath?: string
  /** 该次写入的配方条目 */
  entry: RecipeEntry
}

/** 配方记录按所属脚本名称分组后的结果 */
export interface RecipeRecordGroup {
  scriptName: string
  filePath: string
  /** 组内最新一条记录的写入时间 */
  latestAt: string
  /** 组内记录，按写入时间倒序 */
  records: RecipeRecord[]
}

/**
 * 一条自定义物品记录：某次「应用修改」写入自定义物品脚本时的一个物品定义。
 * 一次写入包含多个物品时会拆成多条记录（写入时间相同），便于按脚本名称分组展示。
 */
export interface CustomRecord {
  /** 唯一标识（写入时间 + 目标 + 序号） */
  id: string
  /** 写入时间（ISO 字符串） */
  at: string
  /** 所属脚本名称（自定义物品脚本文件名） */
  scriptName: string
  /** 目标文件完整路径 */
  filePath: string
  /** 覆盖前的备份文件（如有） */
  backupPath?: string
  /** 物品注册名（命名空间:物品 ID） */
  itemId: string
  /** 展示名称（未填显示名称时为物品 ID） */
  displayName: string
  /** 物品类型的界面标签（如「武器 · 剑」） */
  kindLabel: string
  /** 属性摘要标签 */
  summary: string[]
}

/** 自定义物品记录按所属脚本名称分组后的结果 */
export interface CustomRecordGroup {
  scriptName: string
  filePath: string
  /** 组内最新一条记录的写入时间 */
  latestAt: string
  /** 组内记录，按写入时间倒序 */
  records: CustomRecord[]
}

/**
 * 一条自定义饰品记录：某次「应用修改」写入 Curios 饰品脚本时的一个饰品定义。
 * 一次写入包含多个饰品时会拆成多条记录（写入时间相同），便于按脚本名称分组展示。
 */
export interface CurioRecord {
  /** 唯一标识（写入时间 + 目标 + 序号） */
  id: string
  /** 写入时间（ISO 字符串） */
  at: string
  /** 所属脚本名称（饰品脚本文件名） */
  scriptName: string
  /** 目标文件完整路径 */
  filePath: string
  /** 覆盖前的备份文件（如有） */
  backupPath?: string
  /** 饰品注册名（命名空间:物品 ID） */
  itemId: string
  /** 展示名称（未填显示名称时为物品 ID） */
  displayName: string
  /** 槽位中文名（如「戒指（ring）」） */
  slotLabel: string
  /** 属性摘要标签 */
  summary: string[]
}

/** 自定义饰品记录按所属脚本名称分组后的结果 */
export interface CurioRecordGroup {
  scriptName: string
  filePath: string
  /** 组内最新一条记录的写入时间 */
  latestAt: string
  /** 组内记录，按写入时间倒序 */
  records: CurioRecord[]
}

/* ------------------------------------------------------------------ */
/* 配方编辑（ServerEvents.recipes / server_scripts）                    */
/* ------------------------------------------------------------------ */

/** 新建配方的类型，对应 KubeJS 的快捷方法 */
export type RecipeTypeId =
  | 'shaped'
  | 'shapeless'
  | 'smelting'
  | 'blasting'
  | 'smoking'
  | 'campfire'
  | 'stonecutting'
  | 'smithing'

/** 删除配方的过滤方式，对应 event.remove 的筛选条件 */
export type RecipeRemoveMode = 'output' | 'input' | 'id' | 'mod' | 'type'

/** 配方队列中的条目种类：新建 / 删除 */
export type RecipeKind = 'add' | 'remove'

/** 界面上的配方子界面标识 */
export type EditorMode = 'items' | 'recipes' | 'custom' | 'curios'

/** 自定义物品脚本预览结果 */
export interface CustomItemPreviewResult {
  code: string
  errors: string[]
  warnings: string[]
  filePath: string
}

/** 自定义饰品脚本预览结果 */
export interface CurioPreviewResult {
  code: string
  errors: string[]
  warnings: string[]
  filePath: string
  /** server_scripts 伴随脚本内容（击杀/受伤/破坏方块等事件卡） */
  eventCode: string
  /** server_scripts 伴随脚本的目标路径 */
  eventFilePath: string
}

/** Curios 栏位配置预览结果（curios-common.toml） */
export interface CuriosConfigPreviewResult {
  code: string
  errors: string[]
  warnings: string[]
  filePath: string
  /** 现有配置文件中是否已有未被注释的 slots 赋值 */
  hasExistingSlots: boolean
}

/** 自定义饰品脚本写入载荷 */
export interface CurioWritePayload {
  /** 完整饰品库（含 Curios 栏位配置） */
  library: CurioLibrary
  fileName?: string
  backup?: boolean
}

/** Curios 栏位配置写入载荷 */
export interface CuriosConfigWritePayload {
  slots: CuriosSlotConfig[]
  backup?: boolean
}

/** Curios 模组与配置文件状态（界面用于提示前置条件） */
export interface CuriosStatus {
  /** config/curios-common.toml 的完整路径（未选择游戏目录时为空） */
  configPath: string
  configExists: boolean
  /** 是否检测到 Curios 本体 */
  curiosInstalled: boolean
  curiosJar?: string
  /** 是否检测到 kubejs_curios 桥接模组（必需，缺了 attachCuriosCapability 不存在） */
  bridgeInstalled: boolean
  bridgeJar?: string
  backupCount: number
}

/** 自定义物品脚本写入载荷 */
export interface CustomItemWritePayload {
  /** 完整自定义物品库（含自定义工具 / 盔甲等级） */
  library: CustomItemLibrary
  fileName?: string
  backup?: boolean
}

/**
 * 新建配方的草稿（界面表单）：字段扁平，便于逐格双向绑定。
 * 每个槽位都是「物品 ID 或 #标签」字符串，空字符串表示该格留空。
 */
export interface RecipeAddDraft {
  type: RecipeTypeId
  /** 产物 */
  output: string
  /** 产物数量，> 1 时生成 Item.of(id, count) */
  outputCount: number | null
  /** 有序合成：3 行 × 3 列（row-major，长度 9）的材料格子 */
  grid: string[]
  /** 无序合成：材料列表 */
  ingredients: string[]
  /** 熔炼类 / 切石机：输入材料 */
  input: string
  /** 锻造台：模板 */
  template: string
  /** 锻造台：基底装备 */
  base: string
  /** 锻造台：添加材料 */
  addition: string
}

/** 删除配方的草稿 */
export interface RecipeRemoveDraft {
  mode: RecipeRemoveMode
  /** 过滤值：物品 ID / 标签（#...）/ 正则（/.../）/ 模组名 / 配方类型 ID */
  value: string
  /** 可选的配方类型限定，对应 { ..., type: '...' } */
  typeFilter: string
}

/** 配方队列中的「新建配方」条目 */
export interface RecipeAddEntry extends RecipeAddDraft {
  kind: 'add'
  /** 队列内唯一标识（界面渲染用） */
  key: string
}

/** 配方队列中的「删除配方」条目 */
export interface RecipeRemoveEntry extends RecipeRemoveDraft {
  kind: 'remove'
  key: string
}

export type RecipeEntry = RecipeAddEntry | RecipeRemoveEntry

/** 配方脚本预览结果 */
export interface RecipePreviewResult {
  code: string
  errors: string[]
  warnings: string[]
  /** 目标文件路径（未选择游戏目录时为空） */
  filePath: string
}

export interface RecipeWritePayload {
  entries: RecipeEntry[]
  fileName?: string
  backup?: boolean
}

/* ------------------------------------------------------------------ */
/* 脚本生成与写入                                                      */
/* ------------------------------------------------------------------ */

/** FoodTweaker 模组与配置文件状态 */
export interface FoodTweakerStatus {
  /** config/foodtweaker.json 的完整路径（未选择游戏目录时为空） */
  configPath: string
  /** 配置文件是否已存在 */
  configExists: boolean
  /** mods 目录中是否检测到 FoodTweaker 模组 */
  modInstalled: boolean
  /** 检测到的 FoodTweaker jar 文件名 */
  modJar?: string
  /** 该配置已有的备份数量 */
  backupCount: number
}

/** 食物配置预览（合并磁盘上已有配置后的结果） */
export interface FoodConfigPreview {
  /** 目标文件路径（未选择游戏目录时为空） */
  filePath: string
  /** 合并后的 JSON 文本 */
  code: string
  /** 仅与该配置文件相关的提示 */
  warnings: string[]
}

export interface PreviewResult {
  code: string
  errors: string[]
  warnings: string[]
  profileId: KubeJsProfileId
  /** 食物配置预览；队列中没有食物修改时为 null */
  food: FoodConfigPreview | null
}

export interface WritePayload {
  modifications: ItemModification[]
  fileName?: string
  backup?: boolean
  profileId?: KubeJsProfileId
}

/** 食物配置写入结果 */
export interface FoodWriteInfo {
  filePath: string
  backupPath?: string
  code: string
  message: string
}

export interface WriteResult {
  ok: boolean
  filePath?: string
  backupPath?: string
  code?: string
  errors: string[]
  warnings: string[]
  message: string
  /** 食物配置（foodtweaker.json）写入结果；队列中没有食物修改时为 undefined */
  food?: FoodWriteInfo
  /** 饰品 server_scripts 伴随脚本写入结果；没有服务端事件卡时为 undefined */
  curioEventsFile?: {
    filePath: string
    backupPath?: string
    code: string
  }
}

/** 目标脚本文件信息（写入前的覆盖提示） */
export interface TargetInfo {
  filePath: string
  exists: boolean
  /** 该脚本已有的备份数量 */
  backupCount: number
}

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

/* ------------------------------------------------------------------ */
/* 运行时信息                                                          */
/* ------------------------------------------------------------------ */

/**
 * 数据目录信息。
 * 默认在用户数据目录（`%APPDATA%\kubejs-item-editor`）；
 * 便携模式（程序目录存在 `portable.txt`）下改为程序所在目录的 `data` 子目录。
 */
export interface AppDataInfo {
  /** 配置与写入记录所在的数据根目录 */
  dataDir: string
  /** 写入记录子目录（dataDir/KieJS） */
  recordDir: string
  /** 当前生效的是否便携模式（数据在程序目录） */
  portable: boolean
  /** 数据目录来源：环境变量 / 便携模式 / 用户数据目录 */
  source: 'env' | 'portable' | 'userData'
  /** 检测到便携标记但不可写时的回退说明 */
  fallbackReason?: string
  /** 程序所在目录（便携标记文件放在这里） */
  exeDir: string
  /** 便携标记文件完整路径 */
  markerPath: string
  /** 便携标记文件当前是否存在（与已生效状态可能不同，需重启才生效） */
  markerExists: boolean
  /** 便携模式下的数据目录（程序目录/data） */
  portableDir: string
  /** 是否允许在界面里切换便携模式 */
  toggleAvailable: boolean
  /** 不允许切换时的原因 */
  toggleReason?: string
}

/* ------------------------------------------------------------------ */
/* IPC 暴露给渲染进程的 API                                            */
/* ------------------------------------------------------------------ */

/** 便携模式切换结果 */
export interface PortableToggleResult {
  ok: boolean
  message: string
  /** 切换后的最新数据目录信息 */
  info: AppDataInfo
}

export interface RendererApi {
  /** 运行时信息（数据目录 / 便携模式） */
  app: {
    info(): Promise<AppDataInfo>
    /** 开启/关闭便携模式（只改标记文件，重启后生效） */
    setPortable(enabled: boolean): Promise<PortableToggleResult>
    /** 立即重启软件 */
    relaunch(): Promise<void>
  }
  config: {
    get(): Promise<AppConfig>
    set(patch: Partial<AppConfig>): Promise<AppConfig>
  }
  detection: {
    scan(): Promise<ScanResult>
    inspect(dir: string): Promise<DirInspection>
    pick(): Promise<DirInspection | null>
  }
  items: {
    query(query: ItemQuery): Promise<ItemQueryResult>
    facets(): Promise<ItemFacets>
  }
  script: {
    preview(modifications: ItemModification[], profileId?: KubeJsProfileId): Promise<PreviewResult>
    targetInfo(): Promise<TargetInfo>
    write(payload: WritePayload): Promise<WriteResult>
  }
  /** 写入记录（保存在 userData/KieJS/ 下，便于直接查看） */
  records: {
    list(): Promise<EditRecord[]>
    clear(): Promise<EditRecord[]>
    listRecipes(): Promise<RecipeRecord[]>
    clearRecipes(): Promise<RecipeRecord[]>
    listCustom(): Promise<CustomRecord[]>
    clearCustom(): Promise<CustomRecord[]>
    listCurios(): Promise<CurioRecord[]>
    clearCurios(): Promise<CurioRecord[]>
  }
  /** 配方编辑（写入 kubejs/server_scripts/） */
  recipe: {
    preview(entries: RecipeEntry[]): Promise<RecipePreviewResult>
    targetInfo(): Promise<TargetInfo>
    write(payload: RecipeWritePayload): Promise<WriteResult>
  }
  /** 自定义物品（KubeJS 物品注册） */
  custom: {
    /** 读取自定义物品库（物品定义 + 自定义工具 / 盔甲等级） */
    get(): Promise<CustomItemLibrary>
    /** 保存物品库（写入数据目录 KieJS/custom-items.json）并同步物品列表 */
    save(library: CustomItemLibrary): Promise<CustomItemLibrary>
    preview(library: CustomItemLibrary): Promise<CustomItemPreviewResult>
    targetInfo(): Promise<TargetInfo>
    write(payload: CustomItemWritePayload): Promise<WriteResult>
  }
  /** 自定义饰品（Curios + kubejs_curios，写入 kubejs/startup_scripts/） */
  curios: {
    /** 读取饰品库（饰品定义 + Curios 栏位配置） */
    get(): Promise<CurioLibrary>
    /** 保存饰品库（写入数据目录 KieJS/curios-items.json）并同步物品列表 */
    save(library: CurioLibrary): Promise<CurioLibrary>
    preview(library: CurioLibrary): Promise<CurioPreviewResult>
    targetInfo(): Promise<TargetInfo>
    write(payload: CurioWritePayload): Promise<WriteResult>
    /** Curios 栏位配置（config/curios-common.toml）预览 */
    configPreview(slots: CuriosSlotConfig[]): Promise<CuriosConfigPreviewResult>
    configTargetInfo(): Promise<TargetInfo>
    configWrite(payload: CuriosConfigWritePayload): Promise<WriteResult>
    /** Curios 模组与配置文件检测结果 */
    info(): Promise<CuriosStatus>
  }
  food: {
    /** FoodTweaker 模组与配置文件状态 */
    info(): Promise<FoodTweakerStatus>
  }
  shell: {
    openPath(target: string): Promise<string>
    /** 打开随包分发的使用手册（返回空字符串表示成功，否则为错误信息） */
    openManual(): Promise<string>
  }
}

/** 渲染进程操作日志条目 */
export interface LogEntry {
  time: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}
