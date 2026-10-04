import { isValidItemId } from './validation'
import type {
  RecipeAddDraft,
  RecipeAddEntry,
  RecipeEntry,
  RecipeRemoveDraft,
  RecipeRemoveEntry,
  RecipeRemoveMode,
  RecipeTypeId,
  ValidationResult
} from './types'

/**
 * 配方编辑（ServerEvents.recipes）共享模块：
 * 配方类型目录、草稿 ↔ 队列条目转换、校验与摘要标签。
 * 生成具体脚本代码在主进程 recipeGenerator.ts 中完成。
 */

/** 有序合成的格子边长（3×3 工作台） */
export const RECIPE_GRID_SIZE = 3

/** 有序合成的格子总数 */
export const RECIPE_GRID_CELLS = RECIPE_GRID_SIZE * RECIPE_GRID_SIZE

/** 无序合成最多 9 个材料（对应 3×3 工作台格数） */
export const MAX_SHAPELESS_INGREDIENTS = 9

/** 界面上的槽位布局种类 */
export type RecipeSlotLayout = 'grid' | 'list' | 'single' | 'smithing'

export interface RecipeTypeInfo {
  id: RecipeTypeId
  /** 下拉框完整名称 */
  label: string
  /** 简短名称（队列标签用） */
  short: string
  /** 对应的 KubeJS 方法名 */
  method: string
  slot: RecipeSlotLayout
  /** 界面提示 */
  note: string
}

export const RECIPE_TYPES: RecipeTypeInfo[] = [
  {
    id: 'shaped',
    label: '有序合成（3×3 工作台）',
    short: '有序合成',
    method: 'shaped',
    slot: 'grid',
    note: '按格子摆放，留空即不占位；同一物品出现在多格时共用同一个字符，脚本会自动裁掉四周的空行空列'
  },
  {
    id: 'shapeless',
    label: '无序合成（摆放顺序无关）',
    short: '无序合成',
    method: 'shapeless',
    slot: 'list',
    note: '只关心材料种类与个数，最多 9 个；需要多个同种材料再加一格即可'
  },
  { id: 'smelting', label: '熔炉烧炼', short: '熔炉', method: 'smelting', slot: 'single', note: '基础烧炼配方' },
  {
    id: 'blasting',
    label: '高炉冶炼（更快）',
    short: '高炉',
    method: 'blasting',
    slot: 'single',
    note: '和熔炉配方相互独立，若要两种炉子都能烧，需要各加一条'
  },
  { id: 'smoking', label: '烟熏炉', short: '烟熏炉', method: 'smoking', slot: 'single', note: '食物类快速烹饪' },
  {
    id: 'campfire',
    label: '篝火烹饪',
    short: '篝火',
    method: 'campfireCooking',
    slot: 'single',
    note: '无需燃料，但一次只能烤一个'
  },
  {
    id: 'stonecutting',
    label: '切石机',
    short: '切石机',
    method: 'stonecutting',
    slot: 'single',
    note: '1 个输入材料在切石机里产出指定数量，例如 1 石头 → 2 石按钮'
  },
  {
    id: 'smithing',
    label: '锻造台（1.20 模板锻造）',
    short: '锻造台',
    method: 'smithing',
    slot: 'smithing',
    note: '1.20 起锻造台新增模板槽，需要「模板 + 基底装备 + 添加材料」三项'
  }
]

export interface RecipeRemoveModeInfo {
  id: RecipeRemoveMode
  label: string
  /** 队列标签用短名 */
  short: string
  placeholder: string
  note: string
}

export const RECIPE_REMOVE_MODES: RecipeRemoveModeInfo[] = [
  {
    id: 'output',
    label: '按产物删除',
    short: '产物',
    placeholder: 'minecraft:iron_pickaxe 或 #minecraft:planks',
    note: '删除所有产出为该物品 / 标签的配方，支持正则写法 /_pickaxe/'
  },
  {
    id: 'input',
    label: '按材料删除',
    short: '材料',
    placeholder: 'minecraft:apple 或 #forge:ingots/iron',
    note: '删除所有以该物品 / 标签为材料的配方；条件过宽（如 minecraft:stick）会删掉极大量配方，请谨慎'
  },
  {
    id: 'id',
    label: '按配方 ID 删除',
    short: '配方 ID',
    placeholder: 'minecraft:cobblestone',
    note: '游戏内按 F3 + H 开启高级提示后悬停物品可查看配方 ID'
  },
  { id: 'mod', label: '按模组删除', short: '模组', placeholder: 'somemod', note: '删除某个模组的全部配方（命名空间，不含冒号）' },
  {
    id: 'type',
    label: '按配方类型删除',
    short: '配方类型',
    placeholder: 'minecraft:smelting',
    note: '删除所有该类型的配方，例如全部熔炉配方'
  }
]

export function recipeTypeInfo(type: RecipeTypeId): RecipeTypeInfo {
  return RECIPE_TYPES.find((item) => item.id === type) ?? RECIPE_TYPES[0]
}

export function recipeRemoveModeInfo(mode: RecipeRemoveMode): RecipeRemoveModeInfo {
  return RECIPE_REMOVE_MODES.find((item) => item.id === mode) ?? RECIPE_REMOVE_MODES[0]
}

/* ------------------------------------------------------------------ */
/* 外部输入规范化（IPC / 记录文件读取共用）                             */
/* ------------------------------------------------------------------ */

const REMOVE_MODES: RecipeRemoveMode[] = ['output', 'input', 'id', 'mod', 'type']

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 规范化外来的配方条目（渲染进程传入 / 记录文件读回）：
 * 类型与字段不合法的一律回退为默认值，避免异常数据进入生成器。
 */
export function normalizeRecipeEntries(input: unknown): RecipeEntry[] {
  if (!Array.isArray(input)) return []
  const entries: RecipeEntry[] = []

  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const item = raw as Record<string, unknown>
    const key = asText(item.key) || `entry-${index}`

    if (item.kind === 'remove') {
      const mode = REMOVE_MODES.includes(item.mode as RecipeRemoveMode)
        ? (item.mode as RecipeRemoveMode)
        : 'output'
      entries.push(
        removeDraftToEntry({ mode, value: asText(item.value), typeFilter: asText(item.typeFilter) }, key)
      )
      return
    }

    const type = RECIPE_TYPES.some((info) => info.id === item.type)
      ? (item.type as RecipeTypeId)
      : 'shaped'
    const grid = Array.isArray(item.grid) ? (item.grid as unknown[]) : []
    const ingredients = Array.isArray(item.ingredients) ? (item.ingredients as unknown[]) : null

    const draft: RecipeAddDraft = {
      ...createEmptyRecipeAddDraft(type),
      type,
      output: asText(item.output),
      outputCount: typeof item.outputCount === 'number' ? item.outputCount : null,
      grid: Array.from({ length: RECIPE_GRID_CELLS }, (_value, cell) => asText(grid[cell])),
      ingredients: ingredients ? ingredients.map((cell) => asText(cell)) : [''],
      input: asText(item.input),
      template: asText(item.template),
      base: asText(item.base),
      addition: asText(item.addition)
    }
    entries.push(addDraftToEntry(draft, key))
  })

  return entries
}

/* ------------------------------------------------------------------ */
/* 取值格式判断                                                        */
/* ------------------------------------------------------------------ */

/** 普通物品 / 方块 ID（不含 # 前缀与正则） */
export function isRecipeId(value: string): boolean {
  return isValidItemId((value ?? '').trim())
}

/** 标签：`#namespace:path` */
export function isRecipeTag(value: string): boolean {
  const trimmed = (value ?? '').trim()
  return trimmed.startsWith('#') && isValidItemId(trimmed.slice(1))
}

/** 正则字面量：`/内容/` */
export function isRecipeRegex(value: string): boolean {
  return /^\/[^/\n]+\/$/.test((value ?? '').trim())
}

/** 材料槽位可用取值：物品 ID 或标签（不支持正则） */
export function isRecipeIngredient(value: string): boolean {
  return isRecipeId(value) || isRecipeTag(value)
}

/** 模组命名空间（不含冒号） */
export function isRecipeModId(value: string): boolean {
  return /^[a-z0-9_.-]+$/.test((value ?? '').trim())
}

/** 删除过滤值：按模式判断允许的写法 */
export function isRecipeRemoveValue(mode: RecipeRemoveMode, value: string): boolean {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return false
  switch (mode) {
    case 'mod':
      return isRecipeModId(trimmed)
    case 'type':
      return isRecipeId(trimmed)
    case 'id':
      return isRecipeId(trimmed) || isRecipeRegex(trimmed)
    case 'output':
    case 'input':
      return isRecipeId(trimmed) || isRecipeTag(trimmed) || isRecipeRegex(trimmed)
    default:
      return false
  }
}

/* ------------------------------------------------------------------ */
/* 草稿 ↔ 队列条目                                                     */
/* ------------------------------------------------------------------ */

export function createEmptyRecipeGrid(): string[] {
  return Array.from({ length: RECIPE_GRID_CELLS }, () => '')
}

export function createEmptyRecipeAddDraft(type: RecipeTypeId = 'shaped'): RecipeAddDraft {
  return {
    type,
    output: '',
    outputCount: 1,
    grid: createEmptyRecipeGrid(),
    ingredients: [''],
    input: '',
    template: '',
    base: '',
    addition: ''
  }
}

export function createEmptyRecipeRemoveDraft(): RecipeRemoveDraft {
  return { mode: 'output', value: '', typeFilter: '' }
}

/** 产物数量规范化：空或 ≤ 1 记为 null（生成时写纯字符串） */
function normalizeCount(count: number | null | undefined): number | null {
  if (count == null) return null
  const value = Math.floor(Number(count))
  if (!Number.isFinite(value) || value <= 1) return null
  return value
}

/** 草稿 → 队列条目（去除两端空格、丢弃空材料格、规范化数量） */
export function addDraftToEntry(draft: RecipeAddDraft, key: string): RecipeAddEntry {
  return {
    kind: 'add',
    key,
    type: draft.type,
    output: (draft.output ?? '').trim(),
    outputCount: normalizeCount(draft.outputCount),
    grid: (draft.grid ?? createEmptyRecipeGrid()).map((cell) => (cell ?? '').trim()),
    ingredients: (draft.ingredients ?? [])
      .map((cell) => (cell ?? '').trim())
      .filter((cell) => cell !== ''),
    input: (draft.input ?? '').trim(),
    template: (draft.template ?? '').trim(),
    base: (draft.base ?? '').trim(),
    addition: (draft.addition ?? '').trim()
  }
}

/** 队列条目 → 草稿（补齐固定长度的网格与至少一个材料格） */
export function addEntryToDraft(entry: RecipeAddEntry): RecipeAddDraft {
  const grid = Array.from({ length: RECIPE_GRID_CELLS }, (_value, index) => entry.grid?.[index] ?? '')
  const ingredients = entry.ingredients?.length ? [...entry.ingredients] : ['']
  return {
    type: entry.type,
    output: entry.output,
    outputCount: entry.outputCount ?? 1,
    grid,
    ingredients,
    input: entry.input,
    template: entry.template,
    base: entry.base,
    addition: entry.addition
  }
}

export function removeDraftToEntry(draft: RecipeRemoveDraft, key: string): RecipeRemoveEntry {
  return {
    kind: 'remove',
    key,
    mode: draft.mode,
    value: (draft.value ?? '').trim(),
    typeFilter: (draft.typeFilter ?? '').trim()
  }
}

export function removeEntryToDraft(entry: RecipeRemoveEntry): RecipeRemoveDraft {
  return { mode: entry.mode, value: entry.value, typeFilter: entry.typeFilter }
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

/** 有序合成中已填材料的格子数（草稿与队列条目通用） */
export function filledGridCells(entry: { grid?: string[] }): string[] {
  return (entry.grid ?? []).filter((cell) => (cell ?? '').trim() !== '')
}

function checkIngredientSlot(
  label: string,
  value: string,
  errors: string[],
  options: { allowTag?: boolean; allowRegex?: boolean } = {}
): void {
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    errors.push(`${label}不能为空`)
    return
  }
  if (isRecipeRegex(trimmed)) {
    if (!options.allowRegex) errors.push(`${label}不支持正则写法：${trimmed}`)
    return
  }
  if (isRecipeId(trimmed)) return
  if (isRecipeTag(trimmed)) {
    if (options.allowTag === false) errors.push(`${label}不支持标签写法：${trimmed}`)
    return
  }
  errors.push(`${label}不是合法的物品 ID 或标签：${trimmed}（应形如 minecraft:iron_ingot 或 #forge:ingots/iron）`)
}

function validateAdd(entry: RecipeAddEntry, errors: string[], warnings: string[]): void {
  const info = recipeTypeInfo(entry.type)
  const label = info.short

  // 产物：必须是具体物品（Minecraft 不支持用标签作为产物）
  checkIngredientSlot(`${label}：产物`, entry.output, errors, { allowTag: false, allowRegex: false })

  if (entry.outputCount != null) {
    if (!Number.isInteger(entry.outputCount) || entry.outputCount < 1) {
      errors.push(`${label}：产物数量必须是 ≥ 1 的整数`)
    } else if (entry.outputCount > 64) {
      warnings.push(`${label}：产物数量 ${entry.outputCount} 超过一组（64），请确认`)
    }
  }

  switch (entry.type) {
    case 'shaped': {
      const cells = filledGridCells(entry)
      if (cells.length === 0) {
        errors.push('有序合成：请至少填入 1 个材料格子')
        break
      }
      if (cells.length === 1) {
        warnings.push('有序合成：只填了 1 格材料，用「无序合成」更简洁')
      }
      entry.grid.forEach((cell, index) => {
        const value = (cell ?? '').trim()
        if (!value) return
        const row = Math.floor(index / RECIPE_GRID_SIZE) + 1
        const column = (index % RECIPE_GRID_SIZE) + 1
        checkIngredientSlot(`有序合成：第 ${row} 行第 ${column} 列`, value, errors, { allowTag: true })
      })
      break
    }
    case 'shapeless': {
      const items = entry.ingredients ?? []
      if (items.length === 0) {
        errors.push('无序合成：请至少填入 1 个材料')
        break
      }
      if (items.length > MAX_SHAPELESS_INGREDIENTS) {
        errors.push(`无序合成：材料最多 ${MAX_SHAPELESS_INGREDIENTS} 个（当前 ${items.length} 个）`)
      }
      items.forEach((item, index) => {
        checkIngredientSlot(`无序合成：材料 ${index + 1}`, item, errors, { allowTag: true })
      })
      break
    }
    case 'smithing': {
      checkIngredientSlot('锻造台：模板', entry.template, errors, { allowTag: true })
      checkIngredientSlot('锻造台：基底装备', entry.base, errors, { allowTag: true })
      checkIngredientSlot('锻造台：添加材料', entry.addition, errors, { allowTag: true })
      if (entry.outputCount != null && entry.outputCount > 1) {
        warnings.push(`锻造台：产物数量通常为 1，当前设置为 ${entry.outputCount}`)
      }
      break
    }
    default: {
      checkIngredientSlot(`${label}：输入材料`, entry.input, errors, { allowTag: true })
      break
    }
  }
}

function validateRemove(entry: RecipeRemoveEntry, errors: string[], warnings: string[]): void {
  const info = recipeRemoveModeInfo(entry.mode)
  const value = (entry.value ?? '').trim()

  if (!value) {
    errors.push(`删除配方：${info.label}需要填写过滤值`)
  } else if (!isRecipeRemoveValue(entry.mode, value)) {
    errors.push(`删除配方：${info.label}的过滤值非法：${value}（应形如 ${info.placeholder}）`)
  } else if (isRecipeRegex(value) && !/^\/(\^|.*\$)\//.test(value)) {
    warnings.push(`删除配方：正则 ${value} 未使用 ^ / $ 锚点，可能匹配到意料之外的配方`)
  }

  if (entry.mode === 'input') {
    warnings.push('删除配方：按材料删除的范围很广，会删除所有使用该材料的配方，请确认')
  }

  const typeFilter = (entry.typeFilter ?? '').trim()
  if (typeFilter && !isRecipeId(typeFilter)) {
    errors.push(`删除配方：限定的配方类型非法：${typeFilter}（应形如 minecraft:crafting_shapeless）`)
  }
}

/** 校验单条配方条目：errors 阻止写入，warnings 仅提示 */
export function validateRecipeEntry(entry: RecipeEntry): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!entry || typeof entry !== 'object') {
    return { errors: ['配方条目数据缺失'], warnings }
  }
  if (entry.kind === 'remove') validateRemove(entry, errors, warnings)
  else validateAdd(entry, errors, warnings)
  return { errors, warnings }
}

/** 批量校验，返回去重后的错误与警告 */
export function validateRecipeEntries(entries: RecipeEntry[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const seen = new Set<string>()

  for (const entry of entries ?? []) {
    const result = validateRecipeEntry(entry)
    errors.push(...result.errors)
    warnings.push(...result.warnings)

    // 重复的新建配方会导致 KubeJS 冲突，给出提示
    if (entry?.kind === 'add') {
      const signature = JSON.stringify({ type: entry.type, output: entry.output })
      if (seen.has(signature)) warnings.push(`新增配方：${entry.output} 出现了多条同类配方，后写入的会覆盖前面的`)
      seen.add(signature)
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/** 队列条目摘要标签（卡片展示用） */
export function summarizeRecipeEntry(entry: RecipeEntry): string[] {
  if (entry.kind === 'remove') {
    const info = recipeRemoveModeInfo(entry.mode)
    const tags = ['删除配方', `${info.short} ${entry.value}`]
    if (entry.typeFilter) tags.push(`限定 ${entry.typeFilter}`)
    return tags
  }

  const info = recipeTypeInfo(entry.type)
  const tags: string[] = [info.short]

  switch (entry.type) {
    case 'shaped':
      tags.push(`产物 ${entry.output}`, `材料 ${filledGridCells(entry).length} 格`)
      break
    case 'shapeless':
      tags.push(`产物 ${entry.output}`, `材料 ${entry.ingredients.length} 个`)
      break
    case 'smithing':
      tags.push(`产物 ${entry.output}`, '模板 + 基底 + 添加材料')
      break
    default:
      tags.push(`产物 ${entry.output}`, `输入 ${entry.input}`)
      break
  }

  if (entry.outputCount != null) tags.push(`×${entry.outputCount}`)
  return tags
}
