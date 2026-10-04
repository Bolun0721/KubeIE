import fs from 'node:fs'
import path from 'node:path'
import { MAX_CURIO_RECORDS, sanitizeCurioRecords, trimCurioRecords } from '@shared/curioRecords'
import { MAX_CUSTOM_RECORDS, sanitizeCustomRecords, trimCustomRecords } from '@shared/customRecords'
import { MAX_EDIT_RECORDS, sanitizeEditRecords, trimEditRecords } from '@shared/editRecords'
import { MAX_RECIPE_RECORDS, sanitizeRecipeRecords, trimRecipeRecords } from '@shared/recipeRecords'
import type { CurioRecord, CustomRecord, EditRecord, RecipeRecord } from '@shared/types'
import { atomicWriteText } from './fsUtils'

/**
 * 写入记录存储（方案 7.7 记录留存）。
 *
 * 属性记录、配方记录、自定义物品记录与自定义饰品记录各存为一个 JSON 文件，放在应用数据目录下的 KieJS 子文件夹：
 *   %APPDATA%\kubejs-item-editor\KieJS\item-records.json    （物品属性写入记录）
 *   %APPDATA%\kubejs-item-editor\KieJS\recipe-records.json  （配方写入记录）
 *   %APPDATA%\kubejs-item-editor\KieJS\custom-records.json  （自定义物品写入记录）
 *   %APPDATA%\kubejs-item-editor\KieJS\curio-records.json   （自定义饰品写入记录）
 * 文件为 2 空格缩进 + 结尾换行的可读 JSON，便于直接打开查看；config.json 只保留设置项。
 */

/** 记录目录名（应用数据目录下的子文件夹） */
export const RECORD_DIR_NAME = 'KieJS'

/** 属性记录文件名 */
export const EDIT_RECORD_FILE = 'item-records.json'

/** 配方记录文件名 */
export const RECIPE_RECORD_FILE = 'recipe-records.json'

/** 自定义物品记录文件名 */
export const CUSTOM_RECORD_FILE = 'custom-records.json'

/** 自定义饰品记录文件名 */
export const CURIO_RECORD_FILE = 'curio-records.json'

const RECORD_FORMAT = 'kubejs-item-editor/records'
const RECORD_VERSION = 1

/** 记录文件结构：附带说明字段，便于用户直接打开文件时理解内容 */
interface RecordFileShape<T> {
  format: string
  version: number
  description: string
  updatedAt: string
  count: number
  records: T[]
}

function serialize<T>(description: string, records: T[]): string {
  const payload: RecordFileShape<T> = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    description,
    updatedAt: new Date().toISOString(),
    count: records.length,
    records
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

/** 读取记录文件：文件缺失或内容损坏时返回空数组（不阻断应用启动） */
function readRecords<T>(filePath: string, sanitize: (input: unknown) => T[]): T[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { records?: unknown }
    return sanitize(parsed?.records)
  } catch (error) {
    console.error('[records] 记录文件读取失败：', error)
    return []
  }
}

export class RecordStore {
  /** 记录文件所在目录 */
  readonly dir: string

  private editRecords: EditRecord[]
  private recipeRecords: RecipeRecord[]
  private customRecords: CustomRecord[]
  private curioRecords: CurioRecord[]

  /**
   * @param dir 记录目录（通常为 `userData/KieJS`）
   * @param legacyEditRecords 旧版本遗留在 config.json 的编辑记录，首次运行时迁移到记录文件
   */
  constructor(dir: string, legacyEditRecords: unknown = []) {
    this.dir = dir
    this.editRecords = trimEditRecords(
      readRecords(path.join(dir, EDIT_RECORD_FILE), sanitizeEditRecords)
    )
    this.recipeRecords = trimRecipeRecords(
      readRecords(path.join(dir, RECIPE_RECORD_FILE), sanitizeRecipeRecords)
    )
    this.customRecords = trimCustomRecords(
      readRecords(path.join(dir, CUSTOM_RECORD_FILE), sanitizeCustomRecords)
    )
    this.curioRecords = trimCurioRecords(
      readRecords(path.join(dir, CURIO_RECORD_FILE), sanitizeCurioRecords)
    )

    // 旧版本把编辑记录存在 config.json 里：首次迁移到记录文件，避免用户历史丢失
    if (this.editRecords.length === 0) {
      const migrated = trimEditRecords(sanitizeEditRecords(legacyEditRecords))
      if (migrated.length > 0) {
        this.editRecords = migrated
        this.persistEditRecords()
      }
    }
  }

  get editRecordsPath(): string {
    return path.join(this.dir, EDIT_RECORD_FILE)
  }

  get recipeRecordsPath(): string {
    return path.join(this.dir, RECIPE_RECORD_FILE)
  }

  get customRecordsPath(): string {
    return path.join(this.dir, CUSTOM_RECORD_FILE)
  }

  get curioRecordsPath(): string {
    return path.join(this.dir, CURIO_RECORD_FILE)
  }

  /* ---------------------------- 属性记录 ---------------------------- */

  getEditRecords(): EditRecord[] {
    return this.editRecords.map((record) => ({ ...record }))
  }

  /** 追加属性记录（最新在前），超出上限时丢弃最旧的 */
  addEditRecords(records: EditRecord[]): EditRecord[] {
    if (!Array.isArray(records) || records.length === 0) return this.getEditRecords()
    this.editRecords = trimEditRecords([...records, ...this.editRecords], MAX_EDIT_RECORDS)
    this.persistEditRecords()
    return this.getEditRecords()
  }

  clearEditRecords(): EditRecord[] {
    this.editRecords = []
    this.persistEditRecords()
    return []
  }

  /* ---------------------------- 配方记录 ---------------------------- */

  getRecipeRecords(): RecipeRecord[] {
    return this.recipeRecords.map((record) => ({ ...record }))
  }

  /** 追加配方记录（最新在前），超出上限时丢弃最旧的 */
  addRecipeRecords(records: RecipeRecord[]): RecipeRecord[] {
    if (!Array.isArray(records) || records.length === 0) return this.getRecipeRecords()
    this.recipeRecords = trimRecipeRecords(
      [...records, ...this.recipeRecords],
      MAX_RECIPE_RECORDS
    )
    this.persistRecipeRecords()
    return this.getRecipeRecords()
  }

  clearRecipeRecords(): RecipeRecord[] {
    this.recipeRecords = []
    this.persistRecipeRecords()
    return []
  }

  /* -------------------------- 自定义物品记录 -------------------------- */

  getCustomRecords(): CustomRecord[] {
    return this.customRecords.map((record) => ({ ...record }))
  }

  /** 追加自定义物品记录（最新在前），超出上限时丢弃最旧的 */
  addCustomRecords(records: CustomRecord[]): CustomRecord[] {
    if (!Array.isArray(records) || records.length === 0) return this.getCustomRecords()
    this.customRecords = trimCustomRecords([...records, ...this.customRecords], MAX_CUSTOM_RECORDS)
    this.persistCustomRecords()
    return this.getCustomRecords()
  }

  clearCustomRecords(): CustomRecord[] {
    this.customRecords = []
    this.persistCustomRecords()
    return []
  }

  /* -------------------------- 自定义饰品记录 -------------------------- */

  getCurioRecords(): CurioRecord[] {
    return this.curioRecords.map((record) => ({ ...record }))
  }

  /** 追加自定义饰品记录（最新在前），超出上限时丢弃最旧的 */
  addCurioRecords(records: CurioRecord[]): CurioRecord[] {
    if (!Array.isArray(records) || records.length === 0) return this.getCurioRecords()
    this.curioRecords = trimCurioRecords([...records, ...this.curioRecords], MAX_CURIO_RECORDS)
    this.persistCurioRecords()
    return this.getCurioRecords()
  }

  clearCurioRecords(): CurioRecord[] {
    this.curioRecords = []
    this.persistCurioRecords()
    return []
  }

  /* ---------------------------- 内部实现 ---------------------------- */

  private persistEditRecords(): void {
    this.write(
      EDIT_RECORD_FILE,
      '物品属性写入记录：每次「应用修改」写入 startup_scripts 后追加，最新在前',
      this.editRecords
    )
  }

  private persistRecipeRecords(): void {
    this.write(
      RECIPE_RECORD_FILE,
      '配方写入记录：每次「应用修改」写入 server_scripts 后追加，最新在前',
      this.recipeRecords
    )
  }

  private persistCustomRecords(): void {
    this.write(
      CUSTOM_RECORD_FILE,
      '自定义物品写入记录：每次「应用修改」写入 startup_scripts 后追加，最新在前',
      this.customRecords
    )
  }

  private persistCurioRecords(): void {
    this.write(
      CURIO_RECORD_FILE,
      '自定义饰品写入记录：每次「应用修改」写入 startup_scripts 后追加，最新在前',
      this.curioRecords
    )
  }

  private write<T>(fileName: string, description: string, records: T[]): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      atomicWriteText(path.join(this.dir, fileName), serialize(description, records))
    } catch (error) {
      console.error('[records] 记录文件写入失败：', error)
    }
  }
}
