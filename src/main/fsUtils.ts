import fs from 'node:fs'
import path from 'node:path'

/**
 * 主进程文件操作公共工具（开发方案模块四 / 7.1）。
 * 供「KubeJS 脚本写入」与「FoodTweaker 配置写入」共用，
 * 统一路径安全校验、备份命名与原子写入行为。
 */

/** 校验目标路径是否位于指定父目录范围内，防止路径遍历 */
export function isInside(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** 形如 20260916-213012 的时间戳，用于备份与临时文件名 */
export function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export interface BackupOptions {
  targetPath: string
  backupDir: string
  /** 备份文件名前缀（不含扩展名） */
  baseName: string
  /** 备份扩展名，如 .js.bak / .json.bak */
  extension: string
  enabled: boolean
}

/** 覆盖前备份原文件，返回备份路径；未开启备份或原文件不存在时返回 undefined */
export function backupFile(options: BackupOptions): string | undefined {
  const { targetPath, backupDir, baseName, extension, enabled } = options
  if (!enabled || !fs.existsSync(targetPath)) return undefined

  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `${baseName}_${timestamp()}${extension}`)
  fs.copyFileSync(targetPath, backupPath)
  return backupPath
}

/** 统计某前缀已有的备份数量（界面用于覆盖提示） */
export function countBackups(backupDir: string, baseName: string, extension: string): number {
  try {
    return fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith(`${baseName}_`) && name.endsWith(extension)).length
  } catch {
    return 0
  }
}

/** 原子写入 UTF-8 文本：先写临时文件，再重命名覆盖目标文件 */
export function atomicWriteText(targetPath: string, content: string): void {
  const tempPath = `${targetPath}.${timestamp()}.tmp`
  fs.writeFileSync(tempPath, content, { encoding: 'utf8' })
  fs.renameSync(tempPath, targetPath)
}
