import fs from 'node:fs'
import path from 'node:path'
import type { ItemModification, KubeJsProfileId, TargetInfo, WriteResult } from '@shared/types'
import { sanitizeScriptFileName, sanitizeScriptSubDir, validateModifications } from '@shared/validation'
import { atomicWriteText, backupFile, countBackups, isInside } from './fsUtils'
import { generateScript } from './scriptGenerator'

/**
 * 文件写入模块（开发方案模块四 / 七）。
 * 安全流程：路径规范化校验 → 备份 → 原子写入（临时文件 + 重命名）→ UTF-8 编码。
 *
 * 物品属性脚本（startup_scripts）与配方脚本（server_scripts）共用这里的路径校验与写入流程，
 * 只是生成代码的阶段不同（分别由 scriptGenerator / recipeGenerator 产出）。
 */

export interface WriteRequest {
  gameDir: string
  startupScriptsDir: string
  backupDir: string
  fileName: string
  /** 分类子目录（如 KubeIE/attributes），留空写脚本目录根 */
  subDir?: string
  modifications: ItemModification[]
  profileId?: KubeJsProfileId
  backupEnabled: boolean
}

export interface TargetQuery {
  gameDir: string
  startupScriptsDir: string
  backupDir?: string
  fileName: string
  subDir?: string
}

/** 通用脚本文本的目标查询（不限 startup_scripts） */
export interface CodeTargetQuery {
  gameDir: string
  /** 目标脚本目录，如 kubejs/startup_scripts 或 kubejs/server_scripts */
  scriptsDir: string
  backupDir?: string
  fileName: string
  /** 分类子目录（如 KubeIE/curios），留空写脚本目录根 */
  subDir?: string
}

export interface CodeWriteRequest extends CodeTargetQuery {
  /** 已生成好的脚本文本 */
  code: string
  backupEnabled: boolean
}

type TargetResolution =
  | { ok: true; targetPath: string; scriptsDir: string; backupDir: string; subDir: string }
  | { ok: false; kind: 'missing' | 'path' | 'name'; error: string }

/** 脚本备份扩展名 */
const SCRIPT_BACKUP_EXTENSION = '.js.bak'

const RESOLUTION_MESSAGES: Record<'missing' | 'path' | 'name', string> = {
  missing: '缺少目标路径',
  path: '路径校验失败',
  name: '文件名校验失败'
}

/** 统一解析目标脚本路径，供写入与覆盖提示共用（方案 7.1 路径验证） */
function resolveTarget(query: CodeTargetQuery): TargetResolution {
  const { gameDir, scriptsDir, fileName } = query

  if (!gameDir || !scriptsDir) {
    return {
      ok: false,
      kind: 'missing',
      error: '尚未选择游戏目录与脚本目录，请先在引导页完成配置'
    }
  }

  const resolvedGameDir = path.resolve(gameDir)
  const resolvedScriptsDir = path.resolve(scriptsDir)
  if (!isInside(resolvedGameDir, resolvedScriptsDir)) {
    return {
      ok: false,
      kind: 'path',
      error: `脚本目录不在游戏目录范围内，已拒绝写入：${resolvedScriptsDir}`
    }
  }

  const safeName = sanitizeScriptFileName(fileName)
  if (!safeName) {
    return {
      ok: false,
      kind: 'name',
      error: `输出文件名非法：${fileName}（仅允许字母、数字、下划线、中划线、点，且必须以 .js 结尾）`
    }
  }

  const rawSubDir = (query.subDir ?? '').trim()
  const subDir = rawSubDir ? sanitizeScriptSubDir(rawSubDir) : ''
  if (rawSubDir && !subDir) {
    return {
      ok: false,
      kind: 'name',
      error: `输出分类目录非法：${rawSubDir}（只允许字母、数字、下划线、中划线、点组成的层级）`
    }
  }

  const targetPath = path.join(resolvedScriptsDir, subDir, safeName)
  if (!isInside(resolvedScriptsDir, targetPath)) {
    return { ok: false, kind: 'path', error: '目标文件路径非法' }
  }

  const backupDir = path.resolve(
    query.backupDir || path.join(path.dirname(resolvedScriptsDir), 'backup')
  )
  return { ok: true, targetPath, scriptsDir: resolvedScriptsDir, backupDir, subDir }
}

/** 查询目标脚本文件信息：是否存在、已有备份数量（界面用于覆盖提示） */
export function getCodeTargetInfo(query: CodeTargetQuery): TargetInfo {
  const resolution = resolveTarget(query)
  if (!resolution.ok) return { filePath: '', exists: false, backupCount: 0 }

  const { targetPath, backupDir } = resolution
  const baseName = path.basename(targetPath, '.js')

  return {
    filePath: targetPath,
    exists: fs.existsSync(targetPath),
    backupCount: countBackups(backupDir, baseName, SCRIPT_BACKUP_EXTENSION)
  }
}

export function getTargetInfo(query: TargetQuery): TargetInfo {
  return getCodeTargetInfo({
    gameDir: query.gameDir,
    scriptsDir: query.startupScriptsDir,
    backupDir: query.backupDir,
    fileName: query.fileName,
    subDir: query.subDir
  })
}

/** 备份 + 原子写入，两个脚本类型共用 */
function persistScript(
  resolution: Extract<TargetResolution, { ok: true }>,
  code: string,
  backupEnabled: boolean,
  warnings: string[]
): WriteResult {
  const { targetPath, backupDir, scriptsDir, subDir } = resolution

  try {
    // 分类子目录可能还不存在，写入前先建好
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })

    const backupPath = backupFile({
      targetPath,
      backupDir,
      baseName: path.basename(targetPath, '.js'),
      extension: SCRIPT_BACKUP_EXTENSION,
      enabled: backupEnabled
    })

    // 原子写入：先写临时文件，再重命名覆盖目标文件
    atomicWriteText(targetPath, code)

    warnings.push(...migrateLegacyFlatScript(scriptsDir, subDir, targetPath, backupDir))

    return {
      ok: true,
      filePath: targetPath,
      backupPath,
      code,
      errors: [],
      warnings,
      message: backupPath ? `写入成功，原文件已备份至 ${backupPath}` : '写入成功'
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`文件写入失败：${reason}`], warnings, message: '写入失败' }
  }
}

/**
 * 历史版本把脚本直接写在脚本目录根部，改为分类子目录后，
 * 旧文件会被 KubeJS 和新的同名脚本一起加载（物品重复注册 → 报错）。
 * 这里把旧位置的同名脚本移到备份目录，避免重复加载。
 */
function migrateLegacyFlatScript(
  scriptsDir: string,
  subDir: string,
  targetPath: string,
  backupDir: string
): string[] {
  if (!subDir) return []
  const legacyPath = path.join(scriptsDir, path.basename(targetPath))
  if (legacyPath === targetPath || !fs.existsSync(legacyPath)) return []

  try {
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const movedPath = path.join(backupDir, `${path.basename(legacyPath)}.moved-${stamp}.bak`)
    fs.renameSync(legacyPath, movedPath)
    return [
      `检测到旧位置的同名脚本，已移动到备份目录以避免 KubeJS 重复加载：${legacyPath} → ${movedPath}`
    ]
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return [
      `旧位置仍存在同名脚本（${legacyPath}），请手动删除，否则 KubeJS 会重复加载：${reason}`
    ]
  }
}

export function writeScriptFile(request: WriteRequest): WriteResult {
  const warnings: string[] = []

  const { modifications, profileId } = request
  const validation = validateModifications(modifications ?? [], profileId)
  warnings.push(...validation.warnings)

  const resolution = resolveTarget({
    gameDir: request.gameDir,
    scriptsDir: request.startupScriptsDir,
    backupDir: request.backupDir,
    fileName: request.fileName,
    subDir: request.subDir
  })
  if (!resolution.ok) {
    return {
      ok: false,
      errors: [resolution.error],
      warnings,
      message: RESOLUTION_MESSAGES[resolution.kind]
    }
  }

  if (validation.errors.length > 0) {
    return { ok: false, errors: validation.errors, warnings, message: '属性校验未通过，已取消写入' }
  }

  return persistScript(
    resolution,
    generateScript(modifications, { profileId }),
    request.backupEnabled,
    warnings
  )
}

/** 写入任意已生成好的脚本文本（配方脚本走这里，校验由调用方负责） */
export function writeCodeFile(request: CodeWriteRequest): WriteResult {
  const resolution = resolveTarget({
    gameDir: request.gameDir,
    scriptsDir: request.scriptsDir,
    backupDir: request.backupDir,
    fileName: request.fileName,
    subDir: request.subDir
  })
  if (!resolution.ok) {
    return { ok: false, errors: [resolution.error], warnings: [], message: RESOLUTION_MESSAGES[resolution.kind] }
  }

  return persistScript(resolution, request.code, request.backupEnabled, [])
}
