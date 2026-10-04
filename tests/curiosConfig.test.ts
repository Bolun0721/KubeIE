import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptySlotConfig, type CuriosSlotConfig } from '../src/shared/curios'
import {
  CURIOS_COMMON_FILE,
  detectCurios,
  getCuriosConfigTargetInfo,
  previewCuriosConfig,
  resolveCuriosConfigPath,
  resolveCuriosTarget,
  writeCuriosConfig
} from '../src/main/curiosConfig'

/**
 * Curios 栏位配置模块测试：路径解析、预览、合并写入（保留官方注释）与模组检测。
 * 覆盖需求中的「脚本/配置文件写入位置」：脚本 → kubejs/startup_scripts，配置 → config/curios-common.toml。
 */

let gameDir = ''
let configPath = ''
let backupDir = ''

const OFFICIAL_DEFAULT = [
  '#List of slots to create or modify.',
  '#See documentation for syntax: https://docs.illusivesoulworks.com/curios/configuration#slot-configuration',
  '# slots = [""]'
].join('\n')

function slot(patch: Partial<CuriosSlotConfig> = {}): CuriosSlotConfig {
  return { ...createEmptySlotConfig(), ...patch }
}

beforeEach(() => {
  gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiejs-curios-test-'))
  configPath = path.join(gameDir, 'config', CURIOS_COMMON_FILE)
  backupDir = path.join(gameDir, 'kubejs', 'backup')
})

afterEach(() => {
  fs.rmSync(gameDir, { recursive: true, force: true })
})

describe('Curios 配置路径', () => {
  it('配置文件固定在 <游戏目录>/config/curios-common.toml', () => {
    expect(CURIOS_COMMON_FILE).toBe('curios-common.toml')
    expect(resolveCuriosConfigPath(gameDir)).toBe(configPath)
    expect(resolveCuriosConfigPath('')).toBe('')

    const target = resolveCuriosTarget(gameDir)
    expect(target.ok && target.filePath).toBe(configPath)
    expect(resolveCuriosTarget('').ok).toBe(false)
  })

  it('未选择游戏目录时预览给出提示', () => {
    const preview = previewCuriosConfig('', [slot({ id: 'ring', size: 4 })])
    expect(preview.filePath).toBe('')
    expect(preview.warnings.join()).toContain('尚未选择游戏目录')
    expect(preview.code).toContain('slots = [')
  })
})

describe('Curios 配置预览', () => {
  it('文件不存在时按新建预览（带说明注释）', () => {
    const preview = previewCuriosConfig(gameDir, [slot({ id: 'ring', size: 8 })])
    expect(preview.errors).toEqual([])
    expect(preview.hasExistingSlots).toBe(false)
    expect(preview.code).toContain('slots = [\n  "id=ring;size=8"\n]')
    expect(fs.existsSync(configPath)).toBe(false)
  })

  it('现有官方文件只有注释示例时，预览保留注释并追加 slots', () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, OFFICIAL_DEFAULT, 'utf8')

    const preview = previewCuriosConfig(gameDir, [slot({ id: 'charm', size: 3, addCosmetic: true })])
    expect(preview.hasExistingSlots).toBe(false)
    expect(preview.warnings.join()).toContain('末尾追加')
    expect(preview.code).toContain('#List of slots to create or modify.')
    expect(preview.code).toContain('"id=charm;size=3;add_cosmetic=true"')
  })

  it('已有未注释 slots 时只替换该赋值', () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, `${OFFICIAL_DEFAULT}\nslots = ["id=ring;size=1"]\nkeepMe = 1\n`, 'utf8')

    const preview = previewCuriosConfig(gameDir, [slot({ id: 'ring', size: 6 })])
    expect(preview.hasExistingSlots).toBe(true)
    expect(preview.code).toContain('keepMe = 1')
    expect(preview.code).toContain('"id=ring;size=6"')
    expect(preview.code).not.toContain('"id=ring;size=1"')
  })

  it('栏位非法时预览带错误（不阻断展示）', () => {
    const preview = previewCuriosConfig(gameDir, [slot({ id: 'ring', size: 999 })])
    expect(preview.errors.join()).toContain('0 ~ 48')
  })

  it('栏位列表为空时报错', () => {
    expect(previewCuriosConfig(gameDir, []).errors.join()).toContain('栏位列表为空')
  })
})

describe('Curios 配置写入', () => {
  it('新建文件并返回路径与内容', () => {
    const result = writeCuriosConfig({
      gameDir,
      backupDir,
      slots: [slot({ id: 'ring', size: 8 }), slot({ id: 'charm', size: 3 })],
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(result.filePath).toBe(configPath)
    expect(result.backupPath).toBeUndefined()
    const written = fs.readFileSync(configPath, 'utf8')
    expect(written).toContain('"id=ring;size=8"')
    expect(written).toContain('"id=charm;size=3"')
  })

  it('已有文件时先备份再合并（官方注释保留）', () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, `${OFFICIAL_DEFAULT}\notherLine = true\n`, 'utf8')

    const result = writeCuriosConfig({
      gameDir,
      backupDir,
      slots: [slot({ id: 'necklace', size: 2 })],
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(result.backupPath).toMatch(/\.toml\.bak$/)
    expect(fs.readFileSync(result.backupPath ?? '', 'utf8')).toContain('otherLine = true')

    const written = fs.readFileSync(configPath, 'utf8')
    expect(written).toContain('otherLine = true')
    expect(written).toContain('#List of slots to create or modify.')
    expect(written).toContain('"id=necklace;size=2"')
  })

  it('栏位非法 / 列表为空时拒绝写入', () => {
    expect(
      writeCuriosConfig({ gameDir, backupDir, slots: [], backupEnabled: false }).errors.join()
    ).toContain('栏位列表为空')
    expect(
      writeCuriosConfig({
        gameDir,
        backupDir,
        slots: [slot({ id: 'ring', size: 999 })],
        backupEnabled: false
      }).errors.join()
    ).toContain('0 ~ 48')
    expect(fs.existsSync(configPath)).toBe(false)
  })

  it('未选择游戏目录时拒绝写入', () => {
    const result = writeCuriosConfig({
      gameDir: '',
      backupDir: 'D:/backup',
      slots: [slot({ id: 'ring' })],
      backupEnabled: false
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('尚未选择游戏目录')
  })

  it('目标信息包含是否存在与备份数量', () => {
    const before = getCuriosConfigTargetInfo(gameDir, backupDir)
    expect(before.filePath).toBe(configPath)
    expect(before.exists).toBe(false)

    writeCuriosConfig({ gameDir, backupDir, slots: [slot({ id: 'ring' })], backupEnabled: false })
    const after = getCuriosConfigTargetInfo(gameDir, backupDir)
    expect(after.exists).toBe(true)
  })
})

describe('Curios 模组检测', () => {
  it('分别识别 Curios 本体与 kubejs_curios 桥接模组', () => {
    const modsDir = path.join(gameDir, 'mods')
    fs.mkdirSync(modsDir, { recursive: true })
    fs.writeFileSync(path.join(modsDir, 'curios-forge-5.9.1+1.20.1.jar'), '', 'utf8')
    fs.writeFileSync(path.join(modsDir, 'kubejs_curios_forge_1.20.1-1.0.0.jar'), '', 'utf8')

    const status = detectCurios(gameDir, backupDir)
    expect(status.curiosInstalled).toBe(true)
    expect(status.curiosJar).toContain('curios-forge')
    expect(status.bridgeInstalled).toBe(true)
    expect(status.bridgeJar).toContain('kubejs_curios')
    expect(status.configExists).toBe(false)
  })

  it('缺少桥接模组时 bridgeInstalled 为 false（提示玩家必须安装）', () => {
    const modsDir = path.join(gameDir, 'mods')
    fs.mkdirSync(modsDir, { recursive: true })
    fs.writeFileSync(path.join(modsDir, 'curios-forge-5.9.1+1.20.1.jar'), '', 'utf8')

    const status = detectCurios(gameDir)
    expect(status.curiosInstalled).toBe(true)
    expect(status.bridgeInstalled).toBe(false)
  })

  it('没有 mods 目录时不报错', () => {
    const status = detectCurios(gameDir)
    expect(status.curiosInstalled).toBe(false)
    expect(status.bridgeInstalled).toBe(false)
  })
})
