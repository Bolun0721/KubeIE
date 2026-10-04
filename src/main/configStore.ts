import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_PROFILE_ID } from '@shared/profiles'
import type { AppConfig, GeneratedRecord } from '@shared/types'
import { sanitizeScriptFileName } from '@shared/validation'

/** 已生成脚本索引最多保留的条数 */
const MAX_GENERATED_RECORDS = 50

const DEFAULT_CONFIG: AppConfig = {
  gameDir: '',
  startupScriptsDir: '',
  serverScriptsDir: '',
  recipeFileName: 'recipes.js',
  customFileName: 'custom_items.js',
  curioFileName: 'curios_trinkets.js',
  backupDir: '',
  mcVersion: '',
  profileId: DEFAULT_PROFILE_ID,
  outputFileName: 'item_modifications.js',
  backupEnabled: true,
  generated: []
}

/**
 * 用户配置持久化（开发方案 4.1 数据层）：只保存设置项，
 * 存放于 Electron 的 userData 目录。写入记录改由 RecordStore 保存在 userData/KieJS/ 下。
 */
export class ConfigStore {
  private readonly filePath: string
  private cache: AppConfig
  /** 旧版本遗留在 config.json 里的编辑记录（已从配置中移除，待迁移到记录文件） */
  private legacyEditRecords: unknown = []

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'config.json')
    this.cache = this.readFromDisk()
    this.legacyEditRecords = this.extractLegacyEditRecords()
  }

  get(): AppConfig {
    return {
      ...this.cache,
      generated: this.cache.generated.map((record) => ({ ...record }))
    }
  }

  /** 取出旧版本遗留在配置里的编辑记录（供 RecordStore 首次迁移到 KieJS/ 目录） */
  takeLegacyEditRecords(): unknown {
    const legacy = this.legacyEditRecords
    this.legacyEditRecords = []
    return legacy
  }

  set(patch: Partial<AppConfig>): AppConfig {
    const next: AppConfig = { ...this.cache }

    if (typeof patch.gameDir === 'string') next.gameDir = patch.gameDir
    if (typeof patch.startupScriptsDir === 'string') next.startupScriptsDir = patch.startupScriptsDir
    if (typeof patch.serverScriptsDir === 'string') next.serverScriptsDir = patch.serverScriptsDir
    if (typeof patch.recipeFileName === 'string') {
      next.recipeFileName = sanitizeScriptFileName(patch.recipeFileName) || DEFAULT_CONFIG.recipeFileName
    }
    if (typeof patch.customFileName === 'string') {
      next.customFileName = sanitizeScriptFileName(patch.customFileName) || DEFAULT_CONFIG.customFileName
    }
    if (typeof patch.curioFileName === 'string') {
      next.curioFileName = sanitizeScriptFileName(patch.curioFileName) || DEFAULT_CONFIG.curioFileName
    }
    if (typeof patch.backupDir === 'string') next.backupDir = patch.backupDir
    if (typeof patch.mcVersion === 'string') next.mcVersion = patch.mcVersion
    if (typeof patch.profileId === 'string') next.profileId = patch.profileId
    if (typeof patch.outputFileName === 'string') {
      next.outputFileName =
        sanitizeScriptFileName(patch.outputFileName) || DEFAULT_CONFIG.outputFileName
    }
    if (typeof patch.backupEnabled === 'boolean') next.backupEnabled = patch.backupEnabled

    this.cache = next
    this.persist()
    return this.get()
  }

  addGenerated(record: GeneratedRecord): AppConfig {
    this.cache.generated = [record, ...this.cache.generated].slice(0, MAX_GENERATED_RECORDS)
    this.persist()
    return this.get()
  }

  clearGenerated(): AppConfig {
    this.cache.generated = []
    this.persist()
    return this.get()
  }

  /**
   * 旧版本（0.1.0 之前）把「编辑记录」存在 config.json 的 editRecords 字段里；
   * 现在记录统一放在 KieJS/ 目录，这里取出遗留数据并从配置中移除（只执行一次）。
   */
  private extractLegacyEditRecords(): unknown {
    const cache = this.cache as unknown as Record<string, unknown>
    if (!('editRecords' in cache)) return []
    const legacy = cache.editRecords
    delete cache.editRecords
    this.persist()
    return legacy
  }

  private readFromDisk(): AppConfig {
    try {
      if (!fs.existsSync(this.filePath)) return { ...DEFAULT_CONFIG }
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        generated: Array.isArray(parsed.generated) ? parsed.generated : []
      }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8')
    } catch (error) {
      console.error('[config] 配置写入失败：', error)
    }
  }
}

let store: ConfigStore | null = null

export function getConfigStore(): ConfigStore {
  if (!store) store = new ConfigStore()
  return store
}
