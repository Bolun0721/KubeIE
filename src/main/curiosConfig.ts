import fs from 'node:fs'
import path from 'node:path'
import { CURIOS_COMMON_FILE, validateSlotConfig, type CuriosSlotConfig } from '@shared/curios'
import { findSlotsAssignment, mergeCuriosToml } from '@shared/curiosToml'
import type { CuriosConfigPreviewResult, CuriosStatus, TargetInfo, WriteResult } from '@shared/types'
import { atomicWriteText, backupFile, countBackups, isInside } from './fsUtils'

/** 配置文件名（对外导出，便于界面与测试引用） */
export { CURIOS_COMMON_FILE }

/**
 * Curios 栏位配置模块（config/curios-common.toml）。
 *
 * 依据《Curios API 1.20.1 Forge 配置教程》：
 * - 客户端全局配置位于 <游戏目录>/config/curios-common.toml，负责创建 / 调整饰品栏位；
 * - 单人存档与服务端的 curios-server.toml 位于存档目录（saves/<世界>/serverconfig/），
 *   本工具只维护 config 下的 common 配置，服务端相关设置请在存档目录内自行调整；
 * - 写入策略：只替换文件中未被注释的 `slots = [...]` 赋值，其余内容（含官方注释）原样保留；
 * - 官方默认文件只有被注释的 slots 示例，因此首次写入会追加在文件末尾。
 */

/** 备份扩展名（与脚本 / 食物配置的备份命名风格一致） */
const CURIOS_BACKUP_EXTENSION = '.toml.bak'
const CURIOS_BACKUP_BASE = 'curios-common'

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Curios 栏位配置文件路径（未选择游戏目录时返回空字符串） */
export function resolveCuriosConfigPath(gameDir: string): string {
  const dir = (gameDir ?? '').trim()
  if (!dir) return ''
  return path.join(path.resolve(dir), 'config', CURIOS_COMMON_FILE)
}

/** 列出 mods 目录下的 jar（目录不存在时返回空数组） */
function listModJars(modsDir: string): string[] {
  try {
    return fs.readdirSync(modsDir).filter((name) => name.toLowerCase().endsWith('.jar'))
  } catch {
    return []
  }
}

/** 检测 Curios 本体、kubejs_curios 桥接模组与配置文件状态（界面用于前置条件提示） */
export function detectCurios(gameDir: string, backupDir?: string): CuriosStatus {
  const configPath = resolveCuriosConfigPath(gameDir)
  const modsDir = configPath ? path.join(path.dirname(path.dirname(configPath)), 'mods') : ''
  const jars = modsDir ? listModJars(modsDir) : []

  // kubejs_curios 的文件名形如 kubejs_curios_forge_1.20.1-x.x.x.jar，
  // 先匹配桥接模组，避免被 Curios 本体误判。
  const bridgeJar = jars.find((name) => name.toLowerCase().includes('kubejs_curios'))
  const curiosJar = jars.find(
    (name) => name.toLowerCase().includes('curios') && !name.toLowerCase().includes('kubejs')
  )

  return {
    configPath,
    configExists: !!configPath && fs.existsSync(configPath),
    curiosInstalled: !!curiosJar,
    curiosJar,
    bridgeInstalled: !!bridgeJar,
    bridgeJar,
    backupCount: backupDir ? countBackups(backupDir, CURIOS_BACKUP_BASE, CURIOS_BACKUP_EXTENSION) : 0
  }
}

/** 解析并校验配置目标路径（写入与写入前预检共用） */
export function resolveCuriosTarget(
  gameDir: string
): { ok: true; filePath: string } | { ok: false; error: string } {
  const dir = (gameDir ?? '').trim()
  if (!dir) return { ok: false, error: '尚未选择游戏目录，无法写入 Curios 栏位配置' }

  const filePath = resolveCuriosConfigPath(dir)
  if (!isInside(dir, filePath)) {
    return { ok: false, error: `Curios 配置路径不在游戏目录范围内，已拒绝写入：${filePath}` }
  }
  return { ok: true, filePath }
}

export interface ReadCuriosConfigResult {
  /** 现有文件文本（不存在时为 null） */
  text: string | null
  /** 文件中是否已有未被注释的 slots 赋值 */
  hasExistingSlots: boolean
  /** 读取失败说明（不阻断写入，写入前会备份） */
  error?: string
}

export function readCuriosConfig(filePath: string): ReadCuriosConfigResult {
  if (!filePath) return { text: null, hasExistingSlots: false }

  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    // 文件不存在属正常情况（首次写入会新建）
    return { text: null, hasExistingSlots: false }
  }

  return {
    text,
    hasExistingSlots: !!findSlotsAssignment(text.replace(/\r\n?/g, '\n'))
  }
}

/** 栏位配置校验汇总（写出错误与提示） */
export function validateSlots(slots: CuriosSlotConfig[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  if (!Array.isArray(slots) || slots.length === 0) {
    errors.push('栏位列表为空，请至少添加一个栏位')
    return { errors, warnings }
  }

  slots.forEach((slot, index) => {
    const result = validateSlotConfig(slot, { items: [], created: [], slots }, index)
    const prefix = `第 ${index + 1} 个栏位（${slot?.id || '未命名'}）：`
    for (const error of result.errors) errors.push(`${prefix}${error}`)
    for (const warning of result.warnings) warnings.push(`${prefix}${warning}`)
  })

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/** Curios 配置目标信息（是否存在、已有备份数量），供界面覆盖提示使用 */
export function getCuriosConfigTargetInfo(gameDir: string, backupDir?: string): TargetInfo {
  const target = resolveCuriosTarget(gameDir)
  if (!target.ok) return { filePath: '', exists: false, backupCount: 0 }
  return {
    filePath: target.filePath,
    exists: fs.existsSync(target.filePath),
    backupCount: backupDir ? countBackups(backupDir, CURIOS_BACKUP_BASE, CURIOS_BACKUP_EXTENSION) : 0
  }
}

/** 生成配置预览：读取现有文件 → 只替换/追加 slots 赋值 */
export function previewCuriosConfig(gameDir: string, slots: CuriosSlotConfig[]): CuriosConfigPreviewResult {
  const validation = validateSlots(slots)
  const filePath = resolveCuriosConfigPath(gameDir)
  const warnings = [...validation.warnings]

  if (!filePath) warnings.push('尚未选择游戏目录，无法确定 config/curios-common.toml 的位置')

  const read = readCuriosConfig(filePath)
  if (read.error) warnings.push(read.error)
  if (read.text && !read.hasExistingSlots) {
    warnings.push('现有配置文件中没有未注释的 slots 赋值，将保留原内容并在末尾追加 slots 配置')
  }

  return {
    code: mergeCuriosToml(read.text, slots),
    errors: validation.errors,
    warnings: [...new Set(warnings)],
    filePath,
    hasExistingSlots: read.hasExistingSlots
  }
}

export interface CuriosConfigWriteRequest {
  gameDir: string
  backupDir: string
  slots: CuriosSlotConfig[]
  backupEnabled: boolean
}

/**
 * 写入 config/curios-common.toml：
 * 路径校验 → 校验栏位 → 读取并合并现有内容 → 备份 → 原子写入（临时文件 + 重命名）→ UTF-8。
 */
export function writeCuriosConfig(request: CuriosConfigWriteRequest): WriteResult {
  const target = resolveCuriosTarget(request?.gameDir ?? '')
  if (!target.ok) {
    return { ok: false, errors: [target.error], warnings: [], message: '路径校验失败' }
  }

  const validation = validateSlots(request.slots ?? [])
  if (validation.errors.length > 0) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      message: '栏位配置校验未通过，已取消写入'
    }
  }

  const filePath = target.filePath
  const read = readCuriosConfig(filePath)
  const warnings = [...validation.warnings]
  if (read.error) warnings.push(read.error)

  const code = mergeCuriosToml(read.text, request.slots ?? [])

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    const backupPath = backupFile({
      targetPath: filePath,
      backupDir: request.backupDir || path.join(path.dirname(filePath), 'backup'),
      baseName: CURIOS_BACKUP_BASE,
      extension: CURIOS_BACKUP_EXTENSION,
      enabled: request.backupEnabled
    })

    atomicWriteText(filePath, code)

    return {
      ok: true,
      filePath,
      backupPath,
      code,
      errors: [],
      warnings,
      message: backupPath ? `写入成功，原文件已备份至 ${backupPath}` : '写入成功'
    }
  } catch (error) {
    return {
      ok: false,
      errors: [`Curios 配置写入失败：${reason(error)}`],
      warnings,
      message: '写入失败'
    }
  }
}
