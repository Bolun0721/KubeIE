import { app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { suggestProfileId } from '@shared/profiles'
import type { CandidateDir, DirInspection, ScanResult, ScriptLocation } from '@shared/types'

/**
 * 路径检测模块（开发方案模块一）。
 * 自动检测常见启动器的 Minecraft 目录，并校验其下是否存在 kubejs 目录
 * （startup_scripts / server_scripts 若缺失会在写入时自动创建）。
 */

const MC_VERSION_PATTERN = /(1\.\d{1,2}(?:\.\d{1,2})?)/

function isDir(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function listDirs(parent: string): string[] {
  try {
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name))
  } catch {
    return []
  }
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

/** 在 mods 目录中查找 KubeJS 的 jar 文件名 */
function findKubeJsJar(modsDir: string): string | undefined {
  try {
    return fs
      .readdirSync(modsDir)
      .find((name) => name.toLowerCase().startsWith('kubejs') && name.toLowerCase().endsWith('.jar'))
  } catch {
    return undefined
  }
}

/** 通过版本 JSON、版本名或 mods 中的 KubeJS jar 推断 Minecraft 版本 */
function detectMcVersion(gameDir: string, versionName?: string): string | undefined {
  if (versionName) {
    const matched = MC_VERSION_PATTERN.exec(versionName)
    if (matched) return matched[1]
  }

  const versionRoot = versionName ? path.join(gameDir, 'versions', versionName) : gameDir
  const versionJson = versionName ? path.join(versionRoot, `${versionName}.json`) : null

  if (versionJson) {
    const content = readText(versionJson)
    if (content) {
      const idMatch = /"id"\s*:\s*"([^"]+)"/.exec(content)
      const inheritsMatch = /"inheritsFrom"\s*:\s*"([^"]+)"/.exec(content)
      const candidate = idMatch?.[1] ?? inheritsMatch?.[1]
      const matched = candidate ? MC_VERSION_PATTERN.exec(candidate) : null
      if (matched) return matched[1]
    }
  }

  const jar = findKubeJsJar(path.join(versionRoot, 'mods'))
  if (jar) {
    const matched = MC_VERSION_PATTERN.exec(jar)
    if (matched) return matched[1]
  }

  // 退回：扫描 versions 目录下形如 1.20.1-forge-47.x 的文件夹名
  for (const dir of listDirs(path.join(gameDir, 'versions'))) {
    const matched = MC_VERSION_PATTERN.exec(path.basename(dir))
    if (matched) return matched[1]
  }

  return undefined
}

function buildLocation(
  gameDir: string,
  kubejsDir: string,
  isolated: boolean,
  versionName?: string
): ScriptLocation {
  const versionRoot = versionName ? path.join(gameDir, 'versions', versionName) : gameDir
  const mcVersion = detectMcVersion(gameDir, versionName)
  return {
    gameDir,
    kubejsDir,
    startupScriptsDir: path.join(kubejsDir, 'startup_scripts'),
    // 配方脚本写入 server_scripts，可用 /kubejs reload server_scripts 热重载
    serverScriptsDir: path.join(kubejsDir, 'server_scripts'),
    // 备份目录置于 kubejs/backup，避免被 KubeJS 扫描（方案 7.1 修订）
    backupDir: path.join(kubejsDir, 'backup'),
    isolated,
    versionName,
    mcVersion,
    kubejsJar: findKubeJsJar(path.join(versionRoot, 'mods')),
    suggestedProfileId: suggestProfileId(mcVersion)
  }
}

/** 校验给定目录并列出所有可写入位置 */
export function inspectDirectory(inputDir: string): DirInspection {
  const dir = path.resolve(inputDir ?? '')

  if (!dir || !isDir(dir)) {
    return {
      dir,
      exists: false,
      usable: false,
      locations: [],
      message: '目录不存在或不是文件夹'
    }
  }

  const locations: ScriptLocation[] = []

  // 1) 目录本身即游戏目录（或版本隔离目录）
  if (isDir(path.join(dir, 'kubejs'))) {
    const isolated = dir.split(path.sep).includes('versions')
    const versionName = isolated ? path.basename(dir) : undefined
    locations.push(buildLocation(dir, path.join(dir, 'kubejs'), isolated, versionName))
  }

  // 2) 版本隔离：.minecraft/versions/<版本名>/kubejs
  for (const versionDir of listDirs(path.join(dir, 'versions'))) {
    const kubejsDir = path.join(versionDir, 'kubejs')
    if (isDir(kubejsDir)) {
      locations.push(buildLocation(dir, kubejsDir, true, path.basename(versionDir)))
    }
  }

  if (locations.length === 0) {
    return {
      dir,
      exists: true,
      usable: false,
      locations: [],
      message: '未找到 kubejs 目录，请先运行一次安装了 KubeJS 的游戏，或手动选择正确目录'
    }
  }

  const missingScripts = locations.filter(
    (location) => !isDir(location.startupScriptsDir) || !isDir(location.serverScriptsDir)
  )
  const suffix =
    missingScripts.length > 0 ? '（startup_scripts / server_scripts 目录将在写入时自动创建）' : ''

  return {
    dir,
    exists: true,
    usable: true,
    locations,
    message: `检测到 ${locations.length} 个可写入位置${suffix}`
  }
}

/** 收集常见启动器的候选目录 */
function collectCandidates(): { dir: string; source: string }[] {
  const appData = app.getPath('appData')
  const home = app.getPath('home')
  const result: { dir: string; source: string }[] = [
    { dir: path.join(appData, '.minecraft'), source: '官方启动器默认目录' }
  ]

  // 版本隔离目录
  for (const versionDir of listDirs(path.join(appData, '.minecraft', 'versions'))) {
    result.push({ dir: versionDir, source: '版本隔离目录' })
  }

  // CurseForge
  for (const instance of listDirs(path.join(home, 'curseforge', 'minecraft', 'Instances'))) {
    result.push({ dir: instance, source: 'CurseForge 实例' })
  }

  // Prism Launcher
  for (const instance of listDirs(path.join(appData, 'PrismLauncher', 'instances'))) {
    result.push({ dir: instance, source: 'Prism Launcher 实例' })
  }

  // MultiMC
  for (const instance of listDirs(path.join(appData, 'MultiMC', 'instances'))) {
    result.push({ dir: instance, source: 'MultiMC 实例' })
  }

  // HMCL（用户常见做法：HMCL 的 .minecraft 位于用户目录下）
  const hmclDefault = path.join(home, '.minecraft')
  if (isDir(hmclDefault)) {
    result.push({ dir: hmclDefault, source: 'HMCL / 用户目录 .minecraft' })
  }

  const seen = new Set<string>()
  return result.filter((item) => {
    const key = item.dir.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 扫描所有候选目录 */
export function scanDirectories(): ScanResult {
  const candidates: CandidateDir[] = collectCandidates().map((item) => ({
    dir: item.dir,
    source: item.source,
    inspection: inspectDirectory(item.dir)
  }))

  candidates.sort((a, b) => Number(b.inspection.usable) - Number(a.inspection.usable))

  return {
    candidates,
    anyUsable: candidates.some((candidate) => candidate.inspection.usable)
  }
}

/** 弹出系统目录选择框 */
export async function pickDirectory(): Promise<DirInspection | null> {
  const result = await dialog.showOpenDialog({
    title: '选择 Minecraft 游戏目录（含 kubejs 文件夹）',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return inspectDirectory(result.filePaths[0])
}
