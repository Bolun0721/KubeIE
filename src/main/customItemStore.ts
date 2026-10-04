import fs from 'node:fs'
import path from 'node:path'
import { createEmptyCustomLibrary, normalizeCustomLibrary, type CustomItemLibrary } from '@shared/customItems'
import { atomicWriteText } from './fsUtils'

/**
 * 自定义物品库持久化：数据目录下 KieJS/custom-items.json。
 * 文件是可读 JSON（含说明字段），损坏时回退为空库而不是报错退出。
 */

export const CUSTOM_ITEM_FILE = 'custom-items.json'

const CUSTOM_FORMAT = 'kubejs-item-editor/custom-items'
const CUSTOM_VERSION = 1
const DESCRIPTION =
  '自定义物品：items 为物品库（会被写入脚本），created 为物品列表中的已创建物品，toolTiers / armorTiers 为自定义等级'

interface CustomItemFileShape {
  format: string
  version: number
  description: string
  updatedAt: string
  count: number
  createdCount: number
  items: CustomItemLibrary['items']
  created: CustomItemLibrary['created']
  toolTiers: CustomItemLibrary['toolTiers']
  armorTiers: CustomItemLibrary['armorTiers']
}

/** 深拷贝（避免外部拿到内部引用） */
function clone(library: CustomItemLibrary): CustomItemLibrary {
  return JSON.parse(JSON.stringify(library)) as CustomItemLibrary
}

export class CustomItemStore {
  private readonly filePath: string
  private cache: CustomItemLibrary

  constructor(dir: string) {
    this.filePath = path.join(dir, CUSTOM_ITEM_FILE)
    this.cache = this.readFromDisk()
  }

  get path(): string {
    return this.filePath
  }

  get(): CustomItemLibrary {
    return clone(this.cache)
  }

  /** 保存整库（外部输入会先规范化），返回落盘后的内容 */
  save(input: unknown): CustomItemLibrary {
    this.cache = normalizeCustomLibrary(input)
    this.persist()
    return this.get()
  }

  private readFromDisk(): CustomItemLibrary {
    try {
      if (!fs.existsSync(this.filePath)) return createEmptyCustomLibrary()
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<CustomItemFileShape>
      return normalizeCustomLibrary(parsed)
    } catch (error) {
      console.error('[custom] 自定义物品库读取失败，已按空库处理：', error)
      return createEmptyCustomLibrary()
    }
  }

  private persist(): void {
    const payload: CustomItemFileShape = {
      format: CUSTOM_FORMAT,
      version: CUSTOM_VERSION,
      description: DESCRIPTION,
      updatedAt: new Date().toISOString(),
      count: this.cache.items.length,
      createdCount: this.cache.created.length,
      items: this.cache.items,
      created: this.cache.created,
      toolTiers: this.cache.toolTiers,
      armorTiers: this.cache.armorTiers
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      atomicWriteText(this.filePath, `${JSON.stringify(payload, null, 2)}\n`)
    } catch (error) {
      console.error('[custom] 自定义物品库写入失败：', error)
    }
  }
}
