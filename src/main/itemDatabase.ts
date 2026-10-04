import rawItems from '@shared/data/items.json'
import { isArmorItem } from '@shared/data/armorValues'
import { CURIO_ITEM_MOD, curiosToEntries, type CurioLibrary } from '@shared/curios'
import { CUSTOM_ITEM_MOD, customItemsToEntries, type CustomItemLibrary } from '@shared/customItems'
import type { ItemEntry, ItemFacets, ItemQuery, ItemQueryResult } from '@shared/types'

/**
 * 物品数据库模块（开发方案模块二 / 5.1 左侧物品列表）。
 * 数据随应用内置（src/shared/data/items.json），查询在主进程完成，渲染进程按需分页取用。
 * 自定义物品（KubeIE 模组）与自定义饰品（KubeCurios 模组）由各自的 Store 提供，
 * 通过 setCustomItems / setCurioItems 覆盖层并入列表（饰品排在物品之前）。
 */

const BUILTIN_ITEMS: ItemEntry[] = (rawItems as ItemEntry[])
  .filter((item) => !!item && typeof item.id === 'string')
  .map((item) => ({
    ...item,
    // 是否为 ArmorItem 由内置护甲数值表推导（盾牌 / 鞘翅虽然分类为 armor，但不是 ArmorItem）
    armorLike: isArmorItem(item.id)
  }))
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id))

/** 自定义物品（来自用户的自定义物品库） */
let customItems: ItemEntry[] = []

/** 自定义饰品（应用修改后进入，界面绿色高亮） */
let curioItems: ItemEntry[] = []

/** 合并后的完整列表（饰品 → 自定义物品 → 内置物品） */
let ALL_ITEMS: ItemEntry[] = BUILTIN_ITEMS

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

/** 重新拼装列表（自定义覆盖层始终排在内置物品之前） */
function rebuild(): void {
  ALL_ITEMS = [...curioItems, ...customItems, ...BUILTIN_ITEMS]
}

/** 应用（或清空）自定义物品库覆盖层 */
export function setCustomItems(library: CustomItemLibrary): void {
  customItems = customItemsToEntries(library)
  rebuild()
}

/** 应用（或清空）自定义饰品覆盖层 */
export function setCurioItems(library: CurioLibrary): void {
  curioItems = curiosToEntries(library)
  rebuild()
}

export function getCustomItems(): ItemEntry[] {
  return customItems
}

export function getCurioItems(): ItemEntry[] {
  return curioItems
}

export function getAllItems(): ItemEntry[] {
  return ALL_ITEMS
}

export function findItem(itemId: string): ItemEntry | undefined {
  return ALL_ITEMS.find((item) => item.id === itemId)
}

export function queryItems(query: ItemQuery): ItemQueryResult {
  const keyword = (query.keyword ?? '').trim().toLowerCase()
  const mod = (query.mod ?? '').trim()
  const category = query.category ?? ''
  const offset = Math.max(0, Number(query.offset) || 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT))

  const filtered = ALL_ITEMS.filter((item) => {
    if (mod && item.mod !== mod) return false
    if (category && item.category !== category) return false
    if (!keyword) return true
    return item.id.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword)
  })

  return {
    total: filtered.length,
    items: filtered.slice(offset, offset + limit)
  }
}

export function getFacets(): ItemFacets {
  const mods = new Set<string>()
  const categories = new Set<ItemEntry['category']>()
  for (const item of ALL_ITEMS) {
    mods.add(item.mod)
    categories.add(item.category)
  }
  // 模组下拉表里始终保留 KubeIE 与 KubeCurios：自定义物品 / 自定义饰品归类在这里
  mods.add(CUSTOM_ITEM_MOD)
  mods.add(CURIO_ITEM_MOD)
  return {
    mods: [...mods].sort(),
    categories: [...categories],
    total: ALL_ITEMS.length
  }
}

