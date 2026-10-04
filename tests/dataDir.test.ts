import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LEGACY_USER_DATA_DIR,
  PORTABLE_DATA_DIR,
  PORTABLE_MARKER,
  canWriteDir,
  legacyUserDataDir,
  migrateLegacyData,
  portableMarkerExists,
  portableMarkerPath,
  removePortableMarker,
  resolveDataDir,
  writePortableMarker
} from '../src/main/dataDir'

/**
 * 便携模式数据目录解析测试：
 * 优先级（环境变量 > 便携模式 > 用户数据目录）、只读回退、旧数据迁移、更名后的目录迁移来源。
 */

const USER_DATA = path.join('C:', 'Users', 'tester', 'AppData', 'Roaming', 'kubejs-item-editor')
const PORTABLE = path.join('D:', 'tools', 'KubeJS Item Editor', PORTABLE_DATA_DIR)

describe('legacyUserDataDir - 软件更名后的旧数据目录', () => {
  it('给出同级目录下的旧名字目录', () => {
    expect(legacyUserDataDir(path.join('C:', 'Users', 'tester', 'AppData', 'Roaming', 'kubeie'))).toBe(
      path.join('C:', 'Users', 'tester', 'AppData', 'Roaming', LEGACY_USER_DATA_DIR)
    )
  })

  it('当前目录就叫旧名字时返回 null（无需迁移）', () => {
    expect(legacyUserDataDir(USER_DATA)).toBeNull()
  })
})

describe('resolveDataDir - 数据目录优先级', () => {
  it('未检测到便携标记时使用用户数据目录', () => {
    const result = resolveDataDir({
      userDataDir: USER_DATA,
      portableDir: PORTABLE,
      portableDetected: false,
      portableWritable: true
    })
    expect(result.source).toBe('userData')
    expect(result.portable).toBe(false)
    expect(result.dir).toBe(path.resolve(USER_DATA))
    expect(result.fallbackReason).toBeUndefined()
  })

  it('检测到便携标记且目录可写时使用程序目录', () => {
    const result = resolveDataDir({
      userDataDir: USER_DATA,
      portableDir: PORTABLE,
      portableDetected: true,
      portableWritable: true
    })
    expect(result.source).toBe('portable')
    expect(result.portable).toBe(true)
    expect(result.dir).toBe(path.resolve(PORTABLE))
  })

  it('程序目录不可写时回退到用户数据目录并给出原因', () => {
    const result = resolveDataDir({
      userDataDir: USER_DATA,
      portableDir: PORTABLE,
      portableDetected: true,
      portableWritable: false
    })
    expect(result.source).toBe('userData')
    expect(result.portable).toBe(false)
    expect(result.dir).toBe(path.resolve(USER_DATA))
    expect(result.fallbackReason).toContain('程序目录不可写')
    expect(result.fallbackReason).toContain(path.resolve(PORTABLE))
  })

  it('环境变量优先级最高（相对路径会被解析为绝对路径）', () => {
    const relative = path.join('tmp', 'kiejs-data')
    const result = resolveDataDir({
      userDataDir: USER_DATA,
      portableDir: PORTABLE,
      portableDetected: true,
      portableWritable: true,
      envDir: ` ${relative} `
    })
    expect(result.source).toBe('env')
    expect(result.dir).toBe(path.resolve(relative))
    expect(result.portable).toBe(false)
  })

  it('空的或空白环境变量被忽略', () => {
    for (const envDir of ['', '   ']) {
      const result = resolveDataDir({
        userDataDir: USER_DATA,
        portableDir: PORTABLE,
        portableDetected: false,
        portableWritable: false,
        envDir
      })
      expect(result.source).toBe('userData')
    }
  })

  it('常量命名与约定一致', () => {
    expect(PORTABLE_MARKER).toBe('portable.txt')
    expect(PORTABLE_DATA_DIR).toBe('data')
  })
})

describe('canWriteDir - 目录可写探测', () => {
  let tempRoot = ''

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kiejs-datadir-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('已存在的可写目录返回 true 且不留探测文件', () => {
    const dir = path.join(tempRoot, 'data')
    fs.mkdirSync(dir, { recursive: true })
    expect(canWriteDir(dir)).toBe(true)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('目录不存在时会自动创建', () => {
    const dir = path.join(tempRoot, 'nested', 'data')
    expect(canWriteDir(dir)).toBe(true)
    expect(fs.statSync(dir).isDirectory()).toBe(true)
  })

  it('路径被文件占用时返回 false', () => {
    const file = path.join(tempRoot, 'occupied')
    fs.writeFileSync(file, 'x', 'utf8')
    expect(canWriteDir(file)).toBe(false)
  })
})

describe('便携标记文件读写（界面开关使用）', () => {
  let tempRoot = ''

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kiejs-marker-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('路径固定为 exe 同目录的 portable.txt', () => {
    expect(portableMarkerPath(tempRoot)).toBe(path.join(tempRoot, PORTABLE_MARKER))
  })

  it('写入标记后存在，且内容自解释', () => {
    expect(portableMarkerExists(tempRoot)).toBe(false)

    writePortableMarker(tempRoot)

    expect(portableMarkerExists(tempRoot)).toBe(true)
    const content = fs.readFileSync(portableMarkerPath(tempRoot), 'utf8')
    expect(content).toContain('便携模式标记')
    expect(content).toContain(PORTABLE_DATA_DIR)
  })

  it('重复写入与删除均幂等', () => {
    writePortableMarker(tempRoot)
    writePortableMarker(tempRoot)
    expect(portableMarkerExists(tempRoot)).toBe(true)

    removePortableMarker(tempRoot)
    expect(portableMarkerExists(tempRoot)).toBe(false)

    // 标记不存在时删除不报错
    expect(() => removePortableMarker(tempRoot)).not.toThrow()
  })
})

describe('migrateLegacyData - 旧位置数据迁移', () => {
  let tempRoot = ''
  let legacyDir = ''
  let targetDir = ''

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kiejs-migrate-test-'))
    legacyDir = path.join(tempRoot, 'roaming', 'kubejs-item-editor')
    targetDir = path.join(tempRoot, 'portable', 'data')
    fs.mkdirSync(path.join(legacyDir, 'KieJS'), { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'config.json'), '{"gameDir":"D:/mc"}', 'utf8')
    fs.writeFileSync(path.join(legacyDir, 'KieJS', 'item-records.json'), '{"count":1}', 'utf8')
    fs.writeFileSync(path.join(legacyDir, 'KieJS', 'recipe-records.json'), '{"count":2}', 'utf8')
    fs.writeFileSync(path.join(legacyDir, 'KieJS', 'custom-records.json'), '{"count":3}', 'utf8')
    fs.writeFileSync(path.join(legacyDir, 'KieJS', 'curio-records.json'), '{"count":4}', 'utf8')
    fs.writeFileSync(path.join(legacyDir, 'KieJS', 'custom-items.json'), '{"count":5}', 'utf8')
    fs.writeFileSync(path.join(legacyDir, 'KieJS', 'curios-items.json'), '{"count":6}', 'utf8')
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('把配置、四类记录与自定义物品库 / 饰品库复制到新目录', () => {
    const copied = migrateLegacyData(legacyDir, targetDir)

    expect(copied).toEqual([
      'config.json',
      path.join('KieJS', 'item-records.json'),
      path.join('KieJS', 'recipe-records.json'),
      path.join('KieJS', 'custom-records.json'),
      path.join('KieJS', 'curio-records.json'),
      path.join('KieJS', 'custom-items.json'),
      path.join('KieJS', 'curios-items.json')
    ])
    expect(fs.readFileSync(path.join(targetDir, 'config.json'), 'utf8')).toBe('{"gameDir":"D:/mc"}')
    expect(fs.readFileSync(path.join(targetDir, 'KieJS', 'item-records.json'), 'utf8')).toBe('{"count":1}')
    expect(fs.readFileSync(path.join(targetDir, 'KieJS', 'recipe-records.json'), 'utf8')).toBe('{"count":2}')
    expect(fs.readFileSync(path.join(targetDir, 'KieJS', 'custom-records.json'), 'utf8')).toBe('{"count":3}')
    expect(fs.readFileSync(path.join(targetDir, 'KieJS', 'curio-records.json'), 'utf8')).toBe('{"count":4}')
    expect(fs.readFileSync(path.join(targetDir, 'KieJS', 'custom-items.json'), 'utf8')).toBe('{"count":5}')
    expect(fs.readFileSync(path.join(targetDir, 'KieJS', 'curios-items.json'), 'utf8')).toBe('{"count":6}')
    // 原文件保留，不做删除
    expect(fs.existsSync(path.join(legacyDir, 'config.json'))).toBe(true)
  })

  it('目标已有文件时不覆盖', () => {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'config.json'), '{"gameDir":"E:/other"}', 'utf8')

    const copied = migrateLegacyData(legacyDir, targetDir)
    expect(copied).not.toContain('config.json')
    expect(fs.readFileSync(path.join(targetDir, 'config.json'), 'utf8')).toBe('{"gameDir":"E:/other"}')
    expect(copied).toHaveLength(6)
  })

  it('旧目录缺少文件时跳过，不报错', () => {
    const emptyLegacy = path.join(tempRoot, 'empty')
    fs.mkdirSync(emptyLegacy, { recursive: true })
    expect(migrateLegacyData(emptyLegacy, targetDir)).toEqual([])
  })

  it('新旧目录相同时不做任何事', () => {
    expect(migrateLegacyData(legacyDir, legacyDir)).toEqual([])
  })
})
