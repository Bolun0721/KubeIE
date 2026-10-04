/**
 * 饰品事件卡（脚本语句模板）类型定义。
 *
 * 一张事件卡 = 一段可复用的 KubeJS 语句模板 + 若干可调参数。
 * 卡片按「作用域」分两类：
 * - capability：写进饰品本体的 `.attachCuriosCapability(...)`（startup 脚本），
 *   例如条件属性加成（modifyAttribute）、佩戴时持续效果（curioTick）、特殊能力钩子；
 * - server：必须写进 `server_scripts` 的事件脚本（KubeJS 规定全局事件不能写在 startup），
 *   例如击杀生物、受伤、破坏方块等，通过玩家 `persistentData` 标记判断是否佩戴了该饰品。
 *
 * 所有模板都遵循"KubeJS 6 运行时约束"：
 * - 不用可选链调用 Java 方法（会丢接收者直接崩游戏）；
 * - 不用 `entity.tickCount`（KubeJS 未暴露该字段）；
 * - 不写渲染相关代码。
 */

export type CurioEventCategoryId =
  | 'growth'
  | 'hurt'
  | 'condition'
  | 'block'
  | 'curse'
  | 'team'
  | 'special'

export interface CurioEventCategory {
  id: CurioEventCategoryId
  label: string
  summary: string
}

export type CurioEventParamKind = 'number' | 'text' | 'effect' | 'item' | 'block' | 'attribute'

export interface CurioEventParam {
  key: string
  label: string
  kind: CurioEventParamKind
  /** 默认值（number 类型也允许写字符串再解析） */
  value: number | string
  min?: number
  max?: number
  /** 数字后缀，如 %、秒、点 */
  suffix?: string
  hint?: string
}

/** 一个饰品上勾选的一张事件卡（含该卡片的参数取值） */
export interface CurioEventSelection {
  cardId: string
  params?: Record<string, number | string>
}

/** 生成模板时的上下文 */
export interface CurioEventContext {
  /** 饰品注册名，如 kubejs:my_ring */
  itemId: string
  /** 玩家 persistentData 上的"已佩戴"标记键（server 卡用） */
  flagKey: string
  /** 读取数字参数（缺失时用默认值） */
  n(key: string, fallback?: number): number
  /** 读取字符串参数（缺失时用默认值） */
  s(key: string, fallback?: string): string
  /** 生成稳定 UUID（同一饰品 + 同一 tag 每次生成一致），用于属性修饰符 */
  uuid(tag: string): string
}

/** capability 卡片的产出：追加到饰品能力链/回调体里的代码行（不含缩进） */
export interface CurioCapabilityPatch {
  /** 追加到 .attachCuriosCapability(...) 链（生成器会加 8 空格缩进） */
  chain?: string[]
  /** 追加到 onEquip 回调体（生成器会加 10 空格缩进） */
  equip?: string[]
  /** 追加到 onUnequip 回调体 */
  unequip?: string[]
  /** 追加到 curioTick 回调体 */
  tick?: string[]
}

/** server 卡片的产出：追加到 server_scripts 事件脚本的整块代码 */
export interface CurioServerPatch {
  blocks?: string[]
}

export interface CurioEventCard {
  id: string
  category: CurioEventCategoryId
  name: string
  /** 界面卡片上的一行说明 */
  summary: string
  scope: 'capability' | 'server'
  params: CurioEventParam[]
  /** scope=capability 时调用 */
  capability?(ctx: CurioEventContext): CurioCapabilityPatch
  /** scope=server 时调用 */
  server?(ctx: CurioEventContext): CurioServerPatch
}
