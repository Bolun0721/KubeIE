// 注意：这里只用 `import type`，避免与 ../curios 形成运行时循环依赖
import type { CustomCurioDef } from '../curios'
import { CURIO_EVENT_CARDS, CURIO_EVENT_CATEGORIES, cardsOfCategory, findEventCard } from './cards'
import type {
  CurioEventCard,
  CurioEventCategory,
  CurioEventCategoryId,
  CurioEventContext,
  CurioEventParam,
  CurioEventSelection
} from './types'

export { CURIO_EVENT_CARDS, CURIO_EVENT_CATEGORIES, cardsOfCategory, findEventCard }
export type {
  CurioEventCard,
  CurioEventCategory,
  CurioEventCategoryId,
  CurioEventContext,
  CurioEventParam,
  CurioEventSelection
}

/** 事件卡数量上限（单个饰品） */
export const MAX_CURIO_EVENTS = 8

/**
 * 由种子生成稳定 UUID（同一饰品 + 同一张卡每次生成都一致）。
 * 属性修饰符需要固定 UUID，否则每次重新生成脚本都会叠加一份。
 */
export function stableUuid(seed: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  let h3 = 0x9e3779b9
  let h4 = 0x85ebca6b
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
    h3 = Math.imul(h3 ^ (c + i), 0xc2b2ae35) >>> 0
    h4 = Math.imul(h4 + (c ^ i), 0x27d4eb2f) >>> 0
  }
  const hex = (n: number): string => n.toString(16).padStart(8, '0')
  const s = `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`
}

/** 饰品注册名（本地实现，避免依赖 ../curios 造成循环引用） */
function localCurioId(def: { namespace: string; name: string }): string {
  const namespace = (def.namespace || 'kubejs').trim()
  return `${namespace}:${(def.name || '').trim()}`
}

/** 饰品"已佩戴"标记的 persistentData 键（server 卡用它判断是否佩戴） */
export function curioEventFlagKey(def: { namespace: string; name: string }): string {
  const raw = localCurioId(def).replace(/[^a-z0-9]/gi, '_').toLowerCase()
  return `kubeie_${raw}`
}

/** 参数默认值 */
export function defaultEventParams(card: CurioEventCard): Record<string, number | string> {
  const params: Record<string, number | string> = {}
  for (const item of card.params) params[item.key] = item.value
  return params
}

/** 规范化一个事件选择（卡片必须存在） */
export function normalizeEventSelection(input: unknown): CurioEventSelection | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const cardId = typeof raw.cardId === 'string' ? raw.cardId.trim() : ''
  const card = findEventCard(cardId)
  if (!card) return null
  const params = { ...defaultEventParams(card) }
  const given = raw.params
  if (given && typeof given === 'object') {
    for (const [key, value] of Object.entries(given as Record<string, unknown>)) {
      if (!(key in params)) continue
      if (typeof value === 'number' && Number.isFinite(value)) params[key] = value
      else if (typeof value === 'string') params[key] = value
    }
  }
  return { cardId, params }
}

/** 构建模板生成上下文 */
export function buildEventContext(def: CustomCurioDef, selection: CurioEventSelection): CurioEventContext {
  const card = findEventCard(selection.cardId)
  const params = { ...(card ? defaultEventParams(card) : {}), ...(selection.params ?? {}) }
  const itemId = localCurioId(def)
  return {
    itemId,
    flagKey: curioEventFlagKey(def),
    n(key: string, fallback = 0): number {
      const value = params[key]
      const num = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(num) ? num : fallback
    },
    s(key: string, fallback = ''): string {
      const value = params[key]
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
    },
    uuid(tag: string): string {
      return stableUuid(`${itemId}#${tag}`)
    }
  }
}

/** 该饰品是否含有需要写进 server_scripts 的事件卡 */
export function hasServerEvents(def: CustomCurioDef): boolean {
  return (def.events ?? []).some((selection) => findEventCard(selection.cardId)?.scope === 'server')
}
