import fs from 'node:fs'
import path from 'node:path'
import { createEmptyCurioLibrary, normalizeCurioLibrary, type CurioLibrary } from '@shared/curios'
import { atomicWriteText } from './fsUtils'

/**
 * 自定义饰品库持久化：数据目录下 KieJS/curios-items.json。
 * 文件是可读 JSON（含说明字段），损坏时回退为空库而不是报错退出。
 */

export const CURIO_FILE = 'curios-items.json'

const CURIO_FORMAT = 'kubejs-item-editor/curios'
const CURIO_VERSION = 1
const DESCRIPTION =
  '自定义饰品：items 为饰品库（会被写入 startup_scripts 脚本），created 为应用修改后进入物品列表的饰品，slots 为 Curios 栏位配置（config/curios-common.toml）'

interface CurioFileShape {
  format: string
  version: number
  description: string
  updatedAt: string
  count: number
  createdCount: number
  slotCount: number
  items: CurioLibrary['items']
  created: CurioLibrary['created']
  slots: CurioLibrary['slots']
}

/** 深拷贝（避免外部拿到内部引用） */
function clone(library: CurioLibrary): CurioLibrary {
  return JSON.parse(JSON.stringify(library)) as CurioLibrary
}

export class CurioStore {
  private readonly filePath: string
  private cache: CurioLibrary

  constructor(dir: string) {
    this.filePath = path.join(dir, CURIO_FILE)
    this.cache = this.readFromDisk()
  }

  get path(): string {
    return this.filePath
  }

  get(): CurioLibrary {
    return clone(this.cache)
  }

  /** 保存整库（外部输入会先规范化），返回落盘后的内容 */
  save(input: unknown): CurioLibrary {
    this.cache = normalizeCurioLibrary(input)
    this.persist()
    return this.get()
  }

  private readFromDisk(): CurioLibrary {
    try {
      if (!fs.existsSync(this.filePath)) return createEmptyCurioLibrary()
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<CurioFileShape>
      return normalizeCurioLibrary(parsed)
    } catch (error) {
      console.error('[curios] 自定义饰品库读取失败，已按空库处理：', error)
      return createEmptyCurioLibrary()
    }
  }

  private persist(): void {
    const payload: CurioFileShape = {
      format: CURIO_FORMAT,
      version: CURIO_VERSION,
      description: DESCRIPTION,
      updatedAt: new Date().toISOString(),
      count: this.cache.items.length,
      createdCount: this.cache.created.length,
      slotCount: this.cache.slots.length,
      items: this.cache.items,
      created: this.cache.created,
      slots: this.cache.slots
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      atomicWriteText(this.filePath, `${JSON.stringify(payload, null, 2)}\n`)
    } catch (error) {
      console.error('[curios] 自定义饰品库写入失败：', error)
    }
  }
}
