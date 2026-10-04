import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OUTPUT_CATEGORIES, OUTPUT_ROOT, outputCategoryLabel, outputSubDir } from '../src/shared/outputLayout'
import { sanitizeScriptSubDir } from '../src/shared/validation'
import { getCodeTargetInfo, writeCodeFile } from '../src/main/fileWriter'

/**
 * 输出脚本分类目录测试。
 *
 * KubeJS 6 用 `Files.walk(脚本目录, 10, FOLLOW_LINKS)` 递归加载脚本，
 * 所以生成脚本可以放进 KubeIE/<分类>/ 子目录；这里守住：
 * - 子目录校验（防路径穿越）；
 * - 写入时自动建目录；
 * - 旧版本写在脚本目录根部的同名脚本会被移走，避免 KubeJS 重复加载导致物品重复注册。
 */

let tempRoot = ''
let gameDir = ''
let startupScriptsDir = ''
let backupDir = ''

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'output-layout-test-'))
  gameDir = path.join(tempRoot, 'minecraft')
  startupScriptsDir = path.join(gameDir, 'kubejs', 'startup_scripts')
  backupDir = path.join(gameDir, 'kubejs', 'backup')
  fs.mkdirSync(startupScriptsDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('输出分类目录：常量', () => {
  it('四个分类都挂在 KubeIE 下', () => {
    expect(OUTPUT_CATEGORIES).toHaveLength(4)
    for (const category of OUTPUT_CATEGORIES) {
      expect(category.subDir.startsWith(`${OUTPUT_ROOT}/`)).toBe(true)
      expect(category.label.length).toBeGreaterThan(0)
    }
    expect(outputSubDir('attributes')).toBe('KubeIE/attributes')
    expect(outputSubDir('recipes')).toBe('KubeIE/recipes')
    expect(outputSubDir('items')).toBe('KubeIE/items')
    expect(outputSubDir('curios')).toBe('KubeIE/curios')
    expect(outputCategoryLabel('curios')).toBe('饰品')
  })

  it('目录名是 ASCII（避免跨平台编码问题）', () => {
    for (const category of OUTPUT_CATEGORIES) {
      expect(/^[A-Za-z0-9_\-./]+$/.test(category.subDir)).toBe(true)
    }
  })
})

describe('输出分类目录：子目录校验', () => {
  it('接受正常的相对层级', () => {
    expect(sanitizeScriptSubDir('KubeIE/curios')).toBe('KubeIE/curios')
    expect(sanitizeScriptSubDir('a/b/c/d')).toBe('a/b/c/d')
    expect(sanitizeScriptSubDir('KubeIE')).toBe('KubeIE')
    expect(sanitizeScriptSubDir('  KubeIE\\items  ')).toBe('KubeIE/items')
    expect(sanitizeScriptSubDir('')).toBe('')
  })

  it('拒绝路径穿越与非法字符', () => {
    expect(sanitizeScriptSubDir('../evil')).toBe('')
    expect(sanitizeScriptSubDir('a/../../b')).toBe('')
    expect(sanitizeScriptSubDir('a/./b')).toBe('')
    expect(sanitizeScriptSubDir('/abs/path')).toBe('abs/path')
    expect(sanitizeScriptSubDir('a/b/c/d/e')).toBe('')
    expect(sanitizeScriptSubDir('a b/c')).toBe('')
    expect(sanitizeScriptSubDir('分类/脚本')).toBe('')
  })
})

describe('输出分类目录：写入行为', () => {
  function request(fileName: string, subDir: string, code = '// demo\n') {
    return {
      gameDir,
      scriptsDir: startupScriptsDir,
      backupDir,
      fileName,
      subDir,
      code,
      backupEnabled: false
    }
  }

  it('自动创建分类子目录并写入', () => {
    const result = writeCodeFile(request('curios_trinkets.js', outputSubDir('curios'), '// curio\n'))
    expect(result.ok).toBe(true)
    const expected = path.join(startupScriptsDir, 'KubeIE', 'curios', 'curios_trinkets.js')
    expect(result.filePath).toBe(expected)
    expect(fs.readFileSync(expected, 'utf8')).toBe('// curio\n')
  })

  it('目标信息指向子目录内的文件', () => {
    const info = getCodeTargetInfo({
      gameDir,
      scriptsDir: startupScriptsDir,
      backupDir,
      fileName: 'custom_items.js',
      subDir: outputSubDir('items')
    })
    expect(info.filePath).toBe(path.join(startupScriptsDir, 'KubeIE', 'items', 'custom_items.js'))
    expect(info.exists).toBe(false)
  })

  it('非法子目录直接拒绝写入', () => {
    const result = writeCodeFile(request('evil.js', '../evil'))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('输出分类目录非法')
    expect(fs.existsSync(path.join(path.dirname(startupScriptsDir), 'evil.js'))).toBe(false)
  })

  it('旧位置（脚本目录根部）的同名脚本会被移走，避免重复加载', () => {
    const legacy = path.join(startupScriptsDir, 'curios_trinkets.js')
    fs.writeFileSync(legacy, '// 旧版扁平位置\n', 'utf8')

    const result = writeCodeFile(request('curios_trinkets.js', outputSubDir('curios'), '// 新版\n'))
    expect(result.ok).toBe(true)
    // 旧文件已被移走
    expect(fs.existsSync(legacy)).toBe(false)
    expect(result.warnings.join('\n')).toContain('已移动到备份目录')

    const moved = fs.readdirSync(backupDir).filter((name) => name.includes('curios_trinkets.js'))
    expect(moved.length).toBe(1)
    expect(fs.readFileSync(path.join(backupDir, moved[0]), 'utf8')).toBe('// 旧版扁平位置\n')
  })

  it('不写子目录时行为不变（直接写脚本目录根部）', () => {
    const result = writeCodeFile({
      gameDir,
      scriptsDir: startupScriptsDir,
      backupDir,
      fileName: 'flat.js',
      code: '// flat\n',
      backupEnabled: false
    })
    expect(result.ok).toBe(true)
    expect(result.filePath).toBe(path.join(startupScriptsDir, 'flat.js'))
  })
})
