import fs from 'node:fs'
import path from 'node:path'

/**
 * 数据目录解析（便携模式）。
 *
 * 默认：配置与写入记录放在 Electron 的 userData 目录（`%APPDATA%\kubeie`）。
 * 便携模式：把数据放在**程序所在目录的 `data` 子目录**，实现「解压即用、不往系统目录写东西」。
 *
 * 本模块不依赖 electron，便于单元测试；与 electron 的接线在 appData.ts。
 */

/** 便携模式标记文件名（放到 exe 同目录即启用便携模式） */
export const PORTABLE_MARKER = 'portable.txt'

/** 便携模式数据目录名（与 exe 同目录） */
export const PORTABLE_DATA_DIR = 'data'

/** 软件更名前使用的 userData 目录名（项目旧名 kubejs-item-editor），用于自动迁移旧数据 */
export const LEGACY_USER_DATA_DIR = 'kubejs-item-editor'

/**
 * 更名前的默认数据目录（`%APPDATA%\kubejs-item-editor`）。
 * 与当前目录同名时返回 null。
 */
export function legacyUserDataDir(currentUserDataDir: string): string | null {
  const resolved = path.resolve(currentUserDataDir)
  const legacy = path.join(path.dirname(resolved), LEGACY_USER_DATA_DIR)
  return path.resolve(legacy) === resolved ? null : legacy
}

/** 标记文件内容：自解释，用户打开也能看懂 */
export const PORTABLE_MARKER_CONTENT = [
  'KubeIE —— 便携模式标记',
  '',
  '此文件存在时，软件把配置（config.json）与写入记录（KieJS/）',
  `保存在本目录的 ${PORTABLE_DATA_DIR} 子目录下，可整目录拷到 U 盘使用。`,
  '',
  '删除此文件并重启软件，即回到默认位置：%APPDATA%\\kubeie',
  ''
].join('\r\n')

/** 环境变量：显式指定数据目录（调试 / 多实例用，优先级最高） */
export const DATA_DIR_ENV = 'KIEJS_DATA_DIR'

/** 数据目录来源：环境变量 / 便携模式 / 用户数据目录 */
export type DataDirSource = 'env' | 'portable' | 'userData'

export interface DataDirInput {
  /** 非便携模式使用的目录（Electron userData，如 `%APPDATA%\kubejs-item-editor`） */
  userDataDir: string
  /** 便携模式数据目录（程序所在目录下的 data） */
  portableDir: string
  /** 是否检测到便携标记（portable.txt 或 data 目录） */
  portableDetected: boolean
  /** 便携目录是否可写（可能装在 Program Files 等只读位置） */
  portableWritable: boolean
  /** 环境变量指定的目录 */
  envDir?: string
}

export interface DataDirResolution {
  /** 最终使用的数据根目录 */
  dir: string
  /** 是否便携模式（数据在程序目录，会一并接管 Electron 的 userData） */
  portable: boolean
  source: DataDirSource
  /** 检测到便携标记但不可写时的回退说明 */
  fallbackReason?: string
}

/** 解析数据目录：环境变量 > 便携模式（且可写）> 用户数据目录 */
export function resolveDataDir(input: DataDirInput): DataDirResolution {
  const envDir = (input.envDir ?? '').trim()
  if (envDir) {
    return { dir: path.resolve(envDir), portable: false, source: 'env' }
  }

  if (input.portableDetected) {
    if (input.portableWritable) {
      return { dir: path.resolve(input.portableDir), portable: true, source: 'portable' }
    }
    return {
      dir: path.resolve(input.userDataDir),
      portable: false,
      source: 'userData',
      fallbackReason: `检测到便携模式标记，但程序目录不可写，已回退到用户数据目录：${path.resolve(
        input.portableDir
      )}`
    }
  }

  return { dir: path.resolve(input.userDataDir), portable: false, source: 'userData' }
}

/** 目录可写探测：目录不存在时尝试创建；写入失败（只读 / 无权限）返回 false */
export function canWriteDir(dir: string): boolean {
  const probe = path.join(dir, `.write-test-${process.pid}`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(probe, '', 'utf8')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    try {
      fs.rmSync(probe, { force: true })
    } catch {
      // 清理失败不影响结论
    }
    return false
  }
}

/** 便携标记文件的完整路径（exe 同目录） */
export function portableMarkerPath(exeDir: string): string {
  return path.join(exeDir, PORTABLE_MARKER)
}

/** 是否已存在便携标记 */
export function portableMarkerExists(exeDir: string): boolean {
  try {
    return fs.existsSync(portableMarkerPath(exeDir))
  } catch {
    return false
  }
}

/** 写入便携标记（内容自解释，便于用户直接查看） */
export function writePortableMarker(exeDir: string): void {
  fs.mkdirSync(exeDir, { recursive: true })
  fs.writeFileSync(portableMarkerPath(exeDir), PORTABLE_MARKER_CONTENT, 'utf8')
}

/** 删除便携标记（不存在时静默通过） */
export function removePortableMarker(exeDir: string): void {
  fs.rmSync(portableMarkerPath(exeDir), { force: true })
}

/** 需要从旧位置（%APPDATA%）迁移的文件：配置 + 四类写入记录 + 自定义物品库 / 饰品库 */
const LEGACY_FILES: string[] = [
  'config.json',
  path.join('KieJS', 'item-records.json'),
  path.join('KieJS', 'recipe-records.json'),
  path.join('KieJS', 'custom-records.json'),
  path.join('KieJS', 'curio-records.json'),
  path.join('KieJS', 'custom-items.json'),
  path.join('KieJS', 'curios-items.json')
]

/**
 * 便携模式首次启用时，把旧位置的配置与记录复制到新目录，避免用户重新配置、丢历史。
 * 目标文件已存在或源文件缺失时跳过；返回实际复制的相对路径列表。
 */
export function migrateLegacyData(legacyDir: string, targetDir: string): string[] {
  if (!legacyDir || !targetDir) return []
  const from = path.resolve(legacyDir)
  const to = path.resolve(targetDir)
  if (from === to) return []

  const copied: string[] = []
  for (const relative of LEGACY_FILES) {
    const source = path.join(from, relative)
    const target = path.join(to, relative)
    try {
      if (!fs.existsSync(source) || fs.existsSync(target)) continue
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(source, target)
      copied.push(relative)
    } catch (error) {
      console.warn(`[data] 迁移 ${relative} 失败：`, error)
    }
  }
  return copied
}
