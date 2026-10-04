import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  DATA_DIR_ENV,
  PORTABLE_DATA_DIR,
  canWriteDir,
  legacyUserDataDir,
  migrateLegacyData,
  portableMarkerExists,
  portableMarkerPath,
  removePortableMarker,
  resolveDataDir,
  writePortableMarker,
  type DataDirResolution
} from './dataDir'

/**
 * 数据目录接线（与 electron 相关，必须在 app ready 之前调用 initDataDir）。
 *
 * 便携模式（exe 同目录存在 portable.txt）下把 Electron 的 userData 一并指到
 * 「程序目录/data」，这样配置、写入记录、连 Chromium 缓存都留在程序目录，实现真正的解压即用。
 *
 * 软件更名（kubejs-item-editor → kubeie）后 userData 目录会变，首次启动会把旧目录里的
 * 配置与记录复制过来，避免用户丢历史。
 */

let cached: DataDirResolution | null = null

/** 程序所在目录（便携标记就放在这里） */
export function getExeDir(): string {
  return path.dirname(app.getPath('exe'))
}

/** 便携模式下的数据目录（程序目录/data） */
export function getPortableDir(): string {
  return path.join(getExeDir(), PORTABLE_DATA_DIR)
}

/**
 * 判定并接管数据目录，返回解析结果。
 * 便携标记：程序目录下存在 `portable.txt`（环境变量 KIEJS_DATA_DIR 优先级更高）。
 * 开发运行时不启用便携探测，避免写进 electron 的安装目录。
 */
export function initDataDir(): DataDirResolution {
  if (cached) return cached

  // 必须在 setPath 之前取到默认 userData（%APPDATA%\kubeie）
  const currentUserDataDir = app.getPath('userData')
  // 软件更名前（kubejs-item-editor）的数据目录：里面有配置时优先作为迁移来源
  const previousDir = legacyUserDataDir(currentUserDataDir)
  const previousHasData = Boolean(previousDir && fs.existsSync(path.join(previousDir, 'config.json')))
  const migrateFrom = previousHasData && previousDir ? previousDir : currentUserDataDir
  const exeDir = getExeDir()
  const portableDir = getPortableDir()
  const portableDetected = app.isPackaged && portableMarkerExists(exeDir)

  cached = resolveDataDir({
    userDataDir: currentUserDataDir,
    portableDir,
    portableDetected,
    portableWritable: portableDetected ? canWriteDir(portableDir) : false,
    envDir: process.env[DATA_DIR_ENV]
  })

  if (cached.source !== 'userData') {
    fs.mkdirSync(cached.dir, { recursive: true })
    app.setPath('userData', cached.dir)
  }
  if (path.resolve(cached.dir) !== path.resolve(migrateFrom)) {
    const copied = migrateLegacyData(migrateFrom, cached.dir)
    if (copied.length > 0) {
      console.log(`[data] 已从 ${migrateFrom} 迁移：${copied.join('、')}`)
    }
  }

  if (cached.portable) {
    console.log(`[data] 便携模式（数据位于程序目录）：${cached.dir}`)
  } else if (cached.source === 'env') {
    console.log(`[data] 数据目录（环境变量 ${DATA_DIR_ENV}）：${cached.dir}`)
  }
  if (cached.fallbackReason) console.warn(`[data] ${cached.fallbackReason}`)

  return cached
}

/** 已解析的数据目录（未初始化时先初始化） */
export function getDataDir(): DataDirResolution {
  return cached ?? initDataDir()
}

export interface PortableToggleAvailability {
  available: boolean
  reason?: string
}

/**
 * 是否允许在界面里切换便携模式：
 * 环境变量已指定数据目录、开发运行模式、或程序目录不可写时都不允许。
 */
export function getPortableToggleAvailability(): PortableToggleAvailability {
  const resolution = getDataDir()

  if (resolution.source === 'env') {
    return { available: false, reason: `数据目录已由环境变量 ${DATA_DIR_ENV} 指定，无法切换便携模式` }
  }
  if (!app.isPackaged) {
    return { available: false, reason: '当前是开发运行模式（未打包），便携模式仅对打包后的程序生效' }
  }

  const exeDir = getExeDir()
  if (!canWriteDir(exeDir)) {
    return {
      available: false,
      reason: `程序目录不可写，无法切换便携模式：${exeDir}（例如安装在 Program Files 下时需要管理员权限）`
    }
  }
  return { available: true }
}

export interface PortableToggleResult {
  ok: boolean
  message: string
}

/** 开启/关闭便携模式：只负责创建或删除 exe 同目录的 portable.txt，重启后生效 */
export function setPortableMode(enabled: boolean): PortableToggleResult {
  const availability = getPortableToggleAvailability()
  if (!availability.available) {
    return { ok: false, message: availability.reason ?? '当前无法切换便携模式' }
  }

  const exeDir = getExeDir()
  try {
    if (enabled) {
      writePortableMarker(exeDir)
      return {
        ok: true,
        message: `已开启便携模式，重启软件后生效（配置与记录将迁移到 ${path.join(exeDir, PORTABLE_DATA_DIR)}）`
      }
    }
    removePortableMarker(exeDir)
    return {
      ok: true,
      message: `已关闭便携模式，重启软件后生效（数据回到用户数据目录；${path.join(
        exeDir,
        PORTABLE_DATA_DIR
      )} 里的记录不会自动搬回，如需保留请先手动拷贝）`
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `便携模式切换失败：${reason}` }
  }
}

/** 便携标记文件路径与当前是否存在（界面用于判断"是否已改、需重启"） */
export function getPortableMarkerState(): { markerPath: string; markerExists: boolean } {
  const exeDir = getExeDir()
  return { markerPath: portableMarkerPath(exeDir), markerExists: portableMarkerExists(exeDir) }
}
