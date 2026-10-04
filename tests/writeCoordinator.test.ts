import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeCoordinated } from '../src/main/writeCoordinator'
import { normalizeProperties } from '../src/shared/properties'
import type { ItemModification } from '../src/shared/types'

/**
 * 双目标写入集成测试：在临时游戏目录中同时准备 kubejs/ 与 config/ 结构，
 * 验证「KubeJS 脚本」与「FoodTweaker 配置」的写入边界，确保两条链路互不干扰。
 */

let tempRoot = ''
let gameDir = ''
let startupScriptsDir = ''
let backupDir = ''
let scriptPath = ''
let foodPath = ''

function baseRequest(modifications: ItemModification[]) {
  return {
    gameDir,
    startupScriptsDir,
    backupDir,
    outputFileName: 'item_modifications.js',
    backupEnabled: true,
    profileId: 'kjs6-1.20' as const,
    modifications
  }
}

function foodMod(itemId: string, foodProperties: ItemModification['properties']['foodProperties']): ItemModification {
  return { itemId, properties: normalizeProperties({ foodProperties }) }
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-write-test-'))
  gameDir = path.join(tempRoot, 'minecraft')
  startupScriptsDir = path.join(gameDir, 'kubejs', 'startup_scripts')
  backupDir = path.join(gameDir, 'kubejs', 'backup')
  scriptPath = path.join(startupScriptsDir, 'KubeIE', 'attributes', 'item_modifications.js')
  foodPath = path.join(gameDir, 'config', 'foodtweaker.json')
  fs.mkdirSync(startupScriptsDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('writeCoordinated - 双目标写入', () => {
  it('纯食物队列：只写 FoodTweaker 配置，绝不覆盖已有 KubeJS 脚本', () => {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
    fs.writeFileSync(scriptPath, '// 用户已有的其它脚本内容\n', 'utf8')

    const result = writeCoordinated(
      baseRequest([foodMod('minecraft:apple', { nutrition: 8, saturation: 1 })])
    )

    expect(result.ok).toBe(true)
    expect(result.filePath).toBeUndefined()
    expect(result.scriptItemCount).toBe(0)
    expect(result.food?.filePath).toBe(foodPath)
    expect(result.message).toContain('FoodTweaker 配置已更新')

    // 脚本原样保留，配置正确写出
    expect(fs.readFileSync(scriptPath, 'utf8')).toBe('// 用户已有的其它脚本内容\n')
    expect(JSON.parse(fs.readFileSync(foodPath, 'utf8')).foods['minecraft:apple']).toEqual({
      nutrition: 8,
      saturation: 1
    })
  })

  it('纯脚本队列：只写脚本，不创建 FoodTweaker 配置', () => {
    const result = writeCoordinated(
      baseRequest([{ itemId: 'minecraft:ender_pearl', properties: { maxStackSize: 64 } }])
    )

    expect(result.ok).toBe(true)
    expect(result.filePath).toBe(scriptPath)
    expect(result.food).toBeUndefined()
    expect(result.scriptItemCount).toBe(1)
    expect(fs.existsSync(foodPath)).toBe(false)
    expect(fs.readFileSync(scriptPath, 'utf8')).toContain('item.maxStackSize = 64')
  })

  it('混合队列：脚本只含通用属性，配置只含食物属性', () => {
    const result = writeCoordinated(
      baseRequest([
        { itemId: 'minecraft:apple', properties: normalizeProperties({ maxStackSize: 64, foodProperties: { nutrition: 6 } }) },
        { itemId: 'minecraft:golden_apple', properties: normalizeProperties({ foodProperties: { nutrition: 8, canAlwaysEat: true } }) }
      ])
    )

    expect(result.ok).toBe(true)
    expect(result.filePath).toBe(scriptPath)
    expect(result.food?.filePath).toBe(foodPath)

    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain("event.modify('minecraft:apple'")
    expect(script).toContain('item.maxStackSize = 64')
    // 食物属性属于 FoodTweaker 配置，不应出现在 KubeJS 脚本中
    expect(script).not.toContain('foodProperties')
    expect(script).not.toContain('minecraft:golden_apple')

    const foodConfig = JSON.parse(fs.readFileSync(foodPath, 'utf8'))
    expect(foodConfig.foods['minecraft:apple']).toEqual({ nutrition: 6 })
    expect(foodConfig.foods['minecraft:golden_apple']).toEqual({ nutrition: 8, can_always_eat: true })
  })

  it('校验失败时两个文件都不写入', () => {
    const result = writeCoordinated(
      baseRequest([
        { itemId: 'minecraft:ender_pearl', properties: { maxStackSize: 200 } },
        foodMod('minecraft:apple', { nutrition: 8 })
      ])
    )

    expect(result.ok).toBe(false)
    expect(result.message).toBe('属性校验未通过，已取消写入')
    expect(fs.existsSync(scriptPath)).toBe(false)
    expect(fs.existsSync(foodPath)).toBe(false)
  })

  it('脚本目标路径非法时整体取消写入（食物配置也不写）', () => {
    const outside = path.join(tempRoot, 'outside', 'startup_scripts')
    fs.mkdirSync(outside, { recursive: true })

    const result = writeCoordinated({
      ...baseRequest([
        { itemId: 'minecraft:ender_pearl', properties: { maxStackSize: 64 } },
        foodMod('minecraft:apple', { nutrition: 8 })
      ]),
      startupScriptsDir: outside
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('路径校验失败')
    expect(fs.existsSync(foodPath)).toBe(false)
    expect(fs.existsSync(path.join(outside, 'item_modifications.js'))).toBe(false)
  })

  it('游戏目录缺失时给出明确失败原因', () => {
    const result = writeCoordinated({
      ...baseRequest([foodMod('minecraft:apple', { nutrition: 8 })]),
      gameDir: '',
      startupScriptsDir: ''
    })

    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('尚未选择游戏目录')
  })

  it('队列为空时直接失败', () => {
    const result = writeCoordinated(baseRequest([]))
    expect(result.ok).toBe(false)
    expect(result.message).toBe('没有可写入的内容')
  })

  it('覆盖写入时分别为脚本与配置生成备份', () => {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
    fs.writeFileSync(scriptPath, '// 旧脚本\n', 'utf8')
    fs.mkdirSync(path.dirname(foodPath), { recursive: true })
    fs.writeFileSync(foodPath, '{"enabled":true,"logChanges":true,"foods":{}}\n', 'utf8')

    const result = writeCoordinated(
      baseRequest([
        { itemId: 'minecraft:ender_pearl', properties: { maxStackSize: 16 } },
        foodMod('minecraft:apple', { nutrition: 8 })
      ])
    )

    expect(result.ok).toBe(true)
    expect(path.basename(result.backupPath ?? '')).toMatch(/\.js\.bak$/)
    expect(path.basename(result.food?.backupPath ?? '')).toMatch(/\.json\.bak$/)
    expect(path.dirname(result.backupPath ?? '')).toBe(backupDir)
    expect(path.dirname(result.food?.backupPath ?? '')).toBe(backupDir)
    expect(fs.readFileSync(result.backupPath!, 'utf8')).toBe('// 旧脚本\n')
    expect(fs.readFileSync(result.food!.backupPath!, 'utf8')).toBe(
      '{"enabled":true,"logChanges":true,"foods":{}}\n'
    )
  })
})
