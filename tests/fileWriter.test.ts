import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCodeTargetInfo, getTargetInfo, writeCodeFile, writeScriptFile } from '../src/main/fileWriter'
import type { ItemModification } from '../src/shared/types'

/**
 * 文件写入模块集成测试（方案模块四 / 7.1）：
 * 在临时目录中模拟 kubejs 目录结构，验证备份、原子写入与路径安全校验。
 */

let tempRoot = ''

function createGameDir(): { gameDir: string; startupScriptsDir: string; backupDir: string } {
  const gameDir = path.join(tempRoot, 'minecraft')
  const kubejsDir = path.join(gameDir, 'kubejs')
  const startupScriptsDir = path.join(kubejsDir, 'startup_scripts')
  const backupDir = path.join(kubejsDir, 'backup')
  fs.mkdirSync(startupScriptsDir, { recursive: true })
  return { gameDir, startupScriptsDir, backupDir }
}

const modifications: ItemModification[] = [
  { itemId: 'minecraft:ender_pearl', properties: { maxStackSize: 64, rarity: 'UNCOMMON' } }
]

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubejs-editor-test-'))
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('writeScriptFile - 正常写入', () => {
  it('写入 UTF-8 脚本文件并返回结果', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(result.filePath).toBe(path.join(startupScriptsDir, 'item_modifications.js'))
    expect(result.backupPath).toBeUndefined()

    const content = fs.readFileSync(result.filePath!, 'utf8')
    expect(content).toContain('ItemEvents.modification(event => {')
    expect(content).toContain("event.modify('minecraft:ender_pearl'")
    expect(content).toContain('item.maxStackSize = 64')
  })

  it('startup_scripts 目录不存在时自动创建', () => {
    const gameDir = path.join(tempRoot, 'minecraft-nodir')
    const startupScriptsDir = path.join(gameDir, 'kubejs', 'startup_scripts')

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir: path.join(gameDir, 'kubejs', 'backup'),
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(fs.existsSync(startupScriptsDir)).toBe(true)
  })

  it('写入后不残留临时文件（原子写入）', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()

    writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    const leftovers = fs.readdirSync(startupScriptsDir).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toHaveLength(0)
  })
})

describe('writeScriptFile - 备份机制（方案 7.1 修订 #9）', () => {
  it('覆盖写入前备份原文件，扩展名为 .js.bak', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()
    const target = path.join(startupScriptsDir, 'item_modifications.js')
    fs.writeFileSync(target, '// 用户原有脚本\n', 'utf8')

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(result.backupPath).toBeDefined()
    expect(path.extname(result.backupPath!)).toBe('.bak')
    expect(path.basename(result.backupPath!)).toMatch(/\.js\.bak$/)
    expect(path.dirname(result.backupPath!)).toBe(backupDir)
    expect(fs.readFileSync(result.backupPath!, 'utf8')).toBe('// 用户原有脚本\n')
    expect(fs.readFileSync(target, 'utf8')).toContain('ItemEvents.modification')
  })

  it('关闭备份时不生成备份文件', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()
    fs.writeFileSync(path.join(startupScriptsDir, 'item_modifications.js'), '// 原有内容\n', 'utf8')

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: false
    })

    expect(result.ok).toBe(true)
    expect(result.backupPath).toBeUndefined()
    expect(fs.existsSync(backupDir)).toBe(false)
  })
})

describe('getTargetInfo - 覆盖提示（方案模块四）', () => {
  it('目标文件不存在时 exists 为 false', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()

    const info = getTargetInfo({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js'
    })

    expect(info.filePath).toBe(path.join(startupScriptsDir, 'item_modifications.js'))
    expect(info.exists).toBe(false)
    expect(info.backupCount).toBe(0)
  })

  it('目标文件存在时 exists 为 true，并统计历史备份数量', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()
    fs.writeFileSync(path.join(startupScriptsDir, 'item_modifications.js'), '// 已有脚本\n', 'utf8')
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(path.join(backupDir, 'item_modifications_20260101-000000.js.bak'), 'old', 'utf8')
    fs.writeFileSync(path.join(backupDir, 'item_modifications_20260102-000000.js.bak'), 'old', 'utf8')
    fs.writeFileSync(path.join(backupDir, 'other_script_20260102-000000.js.bak'), 'old', 'utf8')

    const info = getTargetInfo({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js'
    })

    expect(info.exists).toBe(true)
    expect(info.backupCount).toBe(2)
  })

  it('路径或文件名非法时返回空信息', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()

    expect(
      getTargetInfo({ gameDir, startupScriptsDir, backupDir, fileName: 'bad.txt' }).filePath
    ).toBe('')
    expect(
      getTargetInfo({
        gameDir,
        startupScriptsDir: path.join(tempRoot, 'outside'),
        backupDir,
        fileName: 'item_modifications.js'
      }).filePath
    ).toBe('')
  })
})

describe('writeScriptFile - 安全校验', () => {
  it('脚本目录不在游戏目录内时拒绝写入（防路径遍历）', () => {
    const { gameDir, backupDir } = createGameDir()
    const outside = path.join(tempRoot, 'outside', 'startup_scripts')
    fs.mkdirSync(outside, { recursive: true })

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir: outside,
      backupDir,
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('路径校验失败')
    expect(result.errors[0]).toContain('不在游戏目录范围内')
    expect(fs.existsSync(path.join(outside, 'item_modifications.js'))).toBe(false)
  })

  it('非 .js 文件名被拒绝', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.txt',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('输出文件名非法')
  })

  it('属性校验未通过时取消写入', () => {
    const { gameDir, startupScriptsDir, backupDir } = createGameDir()

    const result = writeScriptFile({
      gameDir,
      startupScriptsDir,
      backupDir,
      fileName: 'item_modifications.js',
      modifications: [{ itemId: 'minecraft:apple', properties: { maxStackSize: 200 } }],
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('属性校验未通过，已取消写入')
    expect(fs.existsSync(path.join(startupScriptsDir, 'item_modifications.js'))).toBe(false)
  })

  it('未选择游戏目录时给出明确提示', () => {
    const result = writeScriptFile({
      gameDir: '',
      startupScriptsDir: '',
      backupDir: '',
      fileName: 'item_modifications.js',
      modifications,
      profileId: 'kjs6-1.20',
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('尚未选择游戏目录')
  })
})

describe('writeCodeFile - 配方脚本写入 server_scripts', () => {
  function createRecipeDir(): { gameDir: string; serverScriptsDir: string; backupDir: string } {
    const gameDir = path.join(tempRoot, 'minecraft')
    const serverScriptsDir = path.join(gameDir, 'kubejs', 'server_scripts')
    const backupDir = path.join(gameDir, 'kubejs', 'backup')
    fs.mkdirSync(serverScriptsDir, { recursive: true })
    return { gameDir, serverScriptsDir, backupDir }
  }

  const code = 'ServerEvents.recipes(event => {\n})\n'

  it('写入配方脚本到 server_scripts 目录', () => {
    const { gameDir, serverScriptsDir, backupDir } = createRecipeDir()

    const result = writeCodeFile({
      gameDir,
      scriptsDir: serverScriptsDir,
      backupDir,
      fileName: 'recipes.js',
      code,
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(result.filePath).toBe(path.join(serverScriptsDir, 'recipes.js'))
    expect(result.code).toBe(code)
    expect(fs.readFileSync(result.filePath!, 'utf8')).toBe(code)
  })

  it('server_scripts 目录不存在时自动创建', () => {
    const gameDir = path.join(tempRoot, 'mc-nodir')
    const serverScriptsDir = path.join(gameDir, 'kubejs', 'server_scripts')

    const result = writeCodeFile({
      gameDir,
      scriptsDir: serverScriptsDir,
      backupDir: path.join(gameDir, 'kubejs', 'backup'),
      fileName: 'recipes.js',
      code,
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(fs.existsSync(serverScriptsDir)).toBe(true)
  })

  it('覆盖已有配方脚本前先备份', () => {
    const { gameDir, serverScriptsDir, backupDir } = createRecipeDir()
    const target = path.join(serverScriptsDir, 'recipes.js')
    fs.writeFileSync(target, '// 用户原有配方\n', 'utf8')

    const result = writeCodeFile({
      gameDir,
      scriptsDir: serverScriptsDir,
      backupDir,
      fileName: 'recipes.js',
      code,
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    expect(path.basename(result.backupPath!)).toMatch(/^recipes_.*\.js\.bak$/)
    expect(fs.readFileSync(result.backupPath!, 'utf8')).toBe('// 用户原有配方\n')
    expect(fs.readFileSync(target, 'utf8')).toBe(code)
  })

  it('配方脚本目录越界或文件名非法时拒绝写入', () => {
    const { gameDir, backupDir } = createRecipeDir()
    const outside = path.join(tempRoot, 'outside', 'server_scripts')
    fs.mkdirSync(outside, { recursive: true })

    const escaped = writeCodeFile({
      gameDir,
      scriptsDir: outside,
      backupDir,
      fileName: 'recipes.js',
      code,
      backupEnabled: true
    })
    expect(escaped.ok).toBe(false)
    expect(escaped.errors[0]).toContain('不在游戏目录范围内')

    const badName = writeCodeFile({
      gameDir,
      scriptsDir: path.join(gameDir, 'kubejs', 'server_scripts'),
      backupDir,
      fileName: 'recipes.txt',
      code,
      backupEnabled: true
    })
    expect(badName.ok).toBe(false)
    expect(badName.errors[0]).toContain('输出文件名非法')
  })

  it('getCodeTargetInfo 返回配方脚本路径与存在状态', () => {
    const { gameDir, serverScriptsDir, backupDir } = createRecipeDir()

    const missing = getCodeTargetInfo({
      gameDir,
      scriptsDir: serverScriptsDir,
      backupDir,
      fileName: 'recipes.js'
    })
    expect(missing.filePath).toBe(path.join(serverScriptsDir, 'recipes.js'))
    expect(missing.exists).toBe(false)

    fs.writeFileSync(missing.filePath, code, 'utf8')
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(path.join(backupDir, 'recipes_20260101-000000.js.bak'), 'old', 'utf8')

    const existing = getCodeTargetInfo({
      gameDir,
      scriptsDir: serverScriptsDir,
      backupDir,
      fileName: 'recipes.js'
    })
    expect(existing.exists).toBe(true)
    expect(existing.backupCount).toBe(1)
  })
})
