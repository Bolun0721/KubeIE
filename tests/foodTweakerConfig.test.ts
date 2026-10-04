import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FOOD_CONFIG_FILE,
  detectFoodTweaker,
  mergeFoodConfig,
  previewFoodConfig,
  readFoodConfig,
  resolveFoodConfigPath,
  serializeFoodConfig,
  writeFoodConfig
} from '../src/main/foodTweakerConfig'
import { createEmptyFood, normalizeProperties, withEffectDefaults } from '../src/shared/properties'
import type { FoodProperties, ItemModification } from '../src/shared/types'

/**
 * FoodTweaker 配置模块测试（字段与语义依据模组 foodtweaker-forge-1.0.0 反编译结果）：
 * - 合并规则：保留既有条目与自定义顶层字段、未填写字段不写出；
 * - 字段映射：camelCase → snake_case（can_always_eat / eat_seconds / duration_seconds …）；
 * - 异常场景：配置文件缺失、JSON 非法、路径校验、写入失败。
 */

let tempRoot = ''

function gameDir(): string {
  return path.join(tempRoot, 'minecraft')
}

function configPath(): string {
  return path.join(gameDir(), 'config', FOOD_CONFIG_FILE)
}

function seedConfig(content: string): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), content, 'utf8')
}

function foodMod(itemId: string, foodProperties: FoodProperties): ItemModification {
  return { itemId, properties: normalizeProperties({ foodProperties }) }
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtweaker-test-'))
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('路径与状态检测', () => {
  it('配置路径固定在 <游戏目录>/config/foodtweaker.json', () => {
    // 期望值同样先 path.resolve：Windows 下 'D:\...' 绝对，Linux 下会补前缀（CI 在 ubuntu 上跑）
    expect(resolveFoodConfigPath('D:\\mc\\versions\\1.20.1-Forge')).toBe(
      path.join(path.resolve('D:\\mc\\versions\\1.20.1-Forge'), 'config', FOOD_CONFIG_FILE)
    )
    expect(resolveFoodConfigPath('')).toBe('')
  })

  it('检测模组与配置文件状态（含备份数量）', () => {
    fs.mkdirSync(path.join(gameDir(), 'mods'), { recursive: true })
    fs.writeFileSync(path.join(gameDir(), 'mods', 'foodtweaker-forge-1.0.0.jar'), '', 'utf8')
    seedConfig('{"enabled":true,"logChanges":true,"foods":{}}')

    const backupDir = path.join(gameDir(), 'kubejs', 'backup')
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(path.join(backupDir, 'foodtweaker_20260101-000000.json.bak'), '{}', 'utf8')

    const status = detectFoodTweaker(gameDir(), backupDir)
    expect(status.modInstalled).toBe(true)
    expect(status.modJar).toBe('foodtweaker-forge-1.0.0.jar')
    expect(status.configExists).toBe(true)
    expect(status.backupCount).toBe(1)
  })

  it('未安装模组时 modInstalled 为 false', () => {
    fs.mkdirSync(path.join(gameDir(), 'mods'), { recursive: true })
    const status = detectFoodTweaker(gameDir())
    expect(status.modInstalled).toBe(false)
    expect(status.modJar).toBeUndefined()
    expect(status.configExists).toBe(false)
  })
})

describe('readFoodConfig - 容错读取', () => {
  it('文件不存在时返回空对象且不报错', () => {
    const result = readFoodConfig(configPath())
    expect(result.config).toEqual({})
    expect(result.error).toBeUndefined()
  })

  it('JSON 非法时给出提示并保留原文', () => {
    seedConfig('{ this is not json')
    const result = readFoodConfig(configPath())
    expect(result.error).toContain('不是合法 JSON')
    expect(result.raw).toContain('this is not json')
    expect(result.config).toEqual({})
  })

  it('顶层不是对象时给出提示', () => {
    seedConfig('[1,2,3]')
    expect(readFoodConfig(configPath()).error).toContain('顶层不是 JSON 对象')
  })
})

describe('mergeFoodConfig - 字段映射与保留规则', () => {
  it('按模组字段名写出，未填写的字段不出现', () => {
    const { config } = mergeFoodConfig(null, [
      foodMod('minecraft:apple', { nutrition: 8, saturation: 1, canAlwaysEat: true, eatSeconds: 0.8 })
    ])

    expect(config.foods).toEqual({
      'minecraft:apple': {
        nutrition: 8,
        saturation: 1,
        can_always_eat: true,
        eat_seconds: 0.8
      }
    })
    expect(config.enabled).toBe(true)
    expect(config.logChanges).toBe(true)
  })

  it('效果字段映射为 id / amplifier / duration_seconds / probability', () => {
    const { config } = mergeFoodConfig(null, [
      foodMod('minecraft:cooked_beef', {
        nutrition: 10,
        effects: [
          { id: 'minecraft:regeneration', amplifier: 1, durationSeconds: 10, probability: 1 },
          { id: 'minecraft:speed', amplifier: 0, durationSeconds: 30, probability: 0.25 }
        ]
      })
    ])

    expect(config.foods).toEqual({
      'minecraft:cooked_beef': {
        nutrition: 10,
        effects: [
          { id: 'minecraft:regeneration', amplifier: 1, duration_seconds: 10, probability: 1 },
          { id: 'minecraft:speed', amplifier: 0, duration_seconds: 30, probability: 0.25 }
        ]
      }
    })
  })

  it('显示开关仅在偏离模组默认值（ambient=false / show_particles=true / show_icon=true）时写出', () => {
    const { config } = mergeFoodConfig(null, [
      foodMod('minecraft:bread', {
        nutrition: 5,
        effects: [
          withEffectDefaults({ id: 'minecraft:absorption', ambient: true, showParticles: false, showIcon: false })
        ]
      })
    ])

    const entry = (config.foods as Record<string, Record<string, unknown>>)['minecraft:bread']
    expect(entry.effects).toEqual([
      {
        id: 'minecraft:absorption',
        amplifier: 0,
        duration_seconds: 30,
        probability: 1,
        ambient: true,
        show_particles: false,
        show_icon: false
      }
    ])
  })

  it('保留既有条目、顶层自定义字段与 enabled/logChanges 取值', () => {
    const existing = {
      enabled: false,
      logChanges: false,
      _comment: '模组生成的说明',
      _field_reference: { nutrition: 'int' },
      foods: {
        'minecraft:carrot': { nutrition: 10, saturation: 0.6 },
        'minecraft:apple': { nutrition: 4 }
      }
    }

    const { config } = mergeFoodConfig(existing, [
      foodMod('minecraft:apple', { nutrition: 6, saturation: 0.5 })
    ])

    expect(config.enabled).toBe(false)
    expect(config.logChanges).toBe(false)
    expect(config._comment).toBe('模组生成的说明')
    expect(config._field_reference).toEqual({ nutrition: 'int' })
    expect(config.foods).toEqual({
      'minecraft:apple': { nutrition: 6, saturation: 0.5 },
      'minecraft:carrot': { nutrition: 10, saturation: 0.6 }
    })
  })

  it('新建配置时写入说明字段，foods 键按字典序排列', () => {
    const { config } = mergeFoodConfig(null, [
      foodMod('minecraft:bread', { nutrition: 5 }),
      foodMod('minecraft:apple', { nutrition: 6 })
    ])

    expect(typeof config._comment).toBe('string')
    expect(Object.keys(config.foods as object)).toEqual(['minecraft:apple', 'minecraft:bread'])
  })

  it('remove 标记从 foods 中删除既有条目（恢复原版）', () => {
    const existing = { enabled: true, logChanges: true, foods: { 'minecraft:carrot': { nutrition: 10 } } }
    const merged = mergeFoodConfig(existing, [foodMod('minecraft:carrot', { remove: true })])

    expect(merged.config.foods).toEqual({})
    expect(merged.changed).toBe(1)
  })

  it('效果条目缺少 id 时不产生空条目', () => {
    const merged = mergeFoodConfig(null, [
      {
        itemId: 'minecraft:apple',
        properties: {
          foodProperties: {
            effects: [{ id: '', amplifier: 0, durationSeconds: 10, probability: 1 }]
          }
        }
      }
    ])

    expect(merged.config.foods).toEqual({})
    expect(merged.changed).toBe(0)
    expect(merged.warnings.join('\n')).toContain('食物属性为空')
  })

  it('非食物物品不再产生「非食物 / 未收录」提示（该提示只在属性编辑区显示）', () => {
    const cases: ItemModification[] = [
      foodMod('minecraft:diamond_sword', { nutrition: 5 }),
      foodMod('minecraft:diamond_sword', { nutrition: 5, saturation: 0.5 }),
      foodMod('create:brass_apple', { eatSeconds: 0.8 })
    ]

    for (const modification of cases) {
      const merged = mergeFoodConfig(null, [modification])
      expect(merged.warnings.join('\n')).not.toMatch(/不是食物|不在内置物品库中|变为可食用/)
    }
  })

  it('数值保留 4 位小数，避免浮点噪声', () => {
    const { config } = mergeFoodConfig(null, [
      foodMod('minecraft:apple', { nutrition: 4, saturation: 0.30000000000000004, eatSeconds: 1.2000000001 })
    ])
    expect(config.foods).toEqual({ 'minecraft:apple': { nutrition: 4, saturation: 0.3, eat_seconds: 1.2 } })
  })
})

describe('serializeFoodConfig', () => {
  it('输出 2 空格缩进并以换行结尾', () => {
    const text = serializeFoodConfig({ enabled: true, logChanges: true, foods: {} })
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "enabled": true,')
    expect(JSON.parse(text)).toEqual({ enabled: true, logChanges: true, foods: {} })
  })
})

describe('previewFoodConfig - 预览', () => {
  it('队列中没有食物修改时返回 null', () => {
    expect(previewFoodConfig(gameDir(), [{ itemId: 'minecraft:apple', properties: { maxStackSize: 16 } }])).toBeNull()
  })

  it('合并磁盘上已有配置后输出预览与目标路径', () => {
    seedConfig(
      JSON.stringify({ enabled: true, logChanges: true, foods: { 'minecraft:carrot': { nutrition: 10 } } })
    )

    const preview = previewFoodConfig(gameDir(), [foodMod('minecraft:apple', { nutrition: 6 })])
    expect(preview?.filePath).toBe(configPath())

    const parsed = JSON.parse(preview!.code)
    expect(parsed.foods['minecraft:carrot']).toEqual({ nutrition: 10 })
    expect(parsed.foods['minecraft:apple']).toEqual({ nutrition: 6 })
  })

  it('未选择游戏目录时给出提示（仍可预览内容）', () => {
    const preview = previewFoodConfig('', [foodMod('minecraft:apple', { nutrition: 6 })])
    expect(preview?.filePath).toBe('')
    expect(preview?.warnings.join('\n')).toContain('尚未选择游戏目录')
  })
})

describe('writeFoodConfig - 写入', () => {
  it('写入配置文件并返回路径与内容', () => {
    const result = writeFoodConfig({
      gameDir: gameDir(),
      backupDir: path.join(gameDir(), 'kubejs', 'backup'),
      modifications: [foodMod('minecraft:apple', { nutrition: 8, saturation: 1 })],
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.info.filePath).toBe(configPath())
    expect(result.info.backupPath).toBeUndefined()
    expect(fs.readFileSync(configPath(), 'utf8')).toBe(result.info.code)
    expect(JSON.parse(fs.readFileSync(configPath(), 'utf8')).foods['minecraft:apple']).toEqual({
      nutrition: 8,
      saturation: 1
    })
  })

  it('覆盖写入前备份原文件（.json.bak），且不残留临时文件', () => {
    const backupDir = path.join(gameDir(), 'kubejs', 'backup')
    seedConfig('{"enabled":true,"logChanges":true,"foods":{}}')

    const result = writeFoodConfig({
      gameDir: gameDir(),
      backupDir,
      modifications: [foodMod('minecraft:apple', { nutrition: 8 })],
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.info.backupPath).toBeDefined()
    expect(path.basename(result.info.backupPath!)).toMatch(/^foodtweaker_.*\.json\.bak$/)
    expect(path.dirname(result.info.backupPath!)).toBe(backupDir)
    expect(fs.readFileSync(result.info.backupPath!, 'utf8')).toBe('{"enabled":true,"logChanges":true,"foods":{}}')
    expect(fs.readdirSync(path.dirname(configPath())).filter((name) => name.endsWith('.tmp'))).toHaveLength(0)
  })

  it('关闭备份时不生成备份文件', () => {
    const backupDir = path.join(gameDir(), 'kubejs', 'backup')
    seedConfig('{"enabled":true,"logChanges":true,"foods":{}}')

    const result = writeFoodConfig({
      gameDir: gameDir(),
      backupDir,
      modifications: [foodMod('minecraft:apple', { nutrition: 8 })],
      backupEnabled: false
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.info.backupPath).toBeUndefined()
    expect(fs.existsSync(backupDir)).toBe(false)
  })

  it('现有配置 JSON 非法时：覆盖写入并给出提示', () => {
    seedConfig('{ 坏掉的 json')
    const result = writeFoodConfig({
      gameDir: gameDir(),
      backupDir: path.join(gameDir(), 'kubejs', 'backup'),
      modifications: [foodMod('minecraft:apple', { nutrition: 8 })],
      backupEnabled: true
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.join('\n')).toContain('不是合法 JSON')
    expect(result.info.backupPath).toBeDefined()
    expect(JSON.parse(fs.readFileSync(configPath(), 'utf8')).foods['minecraft:apple']).toEqual({ nutrition: 8 })
  })

  it('未选择游戏目录时拒绝写入', () => {
    const result = writeFoodConfig({
      gameDir: '',
      backupDir: '',
      modifications: [foodMod('minecraft:apple', { nutrition: 8 })],
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toContain('尚未选择游戏目录')
    expect(result.message).toBe('路径校验失败')
  })

  it('队列中没有食物修改时拒绝写入', () => {
    const result = writeFoodConfig({
      gameDir: gameDir(),
      backupDir: '',
      modifications: [{ itemId: 'minecraft:apple', properties: { maxStackSize: 16 } }],
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('没有可写入的内容')
  })

  it('全部条目为空时不产生写入', () => {
    const result = writeFoodConfig({
      gameDir: gameDir(),
      backupDir: '',
      modifications: [foodMod('minecraft:apple', createEmptyFood())],
      backupEnabled: true
    })

    expect(result.ok).toBe(false)
    expect(fs.existsSync(configPath())).toBe(false)
  })

  it('重复写入同一物品时幂等（内容稳定）', () => {
    const request = {
      gameDir: gameDir(),
      backupDir: '',
      modifications: [foodMod('minecraft:apple', { nutrition: 8, saturation: 1 })],
      backupEnabled: false
    }

    const first = writeFoodConfig(request)
    const second = writeFoodConfig(request)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.info.code).toBe(first.info.code)
  })
})
