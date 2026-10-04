import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CURIO_RECORD_FILE,
  CUSTOM_RECORD_FILE,
  EDIT_RECORD_FILE,
  RECIPE_RECORD_FILE,
  RECORD_DIR_NAME,
  RecordStore
} from '../src/main/recordStore'
import { createEmptyCurio } from '../src/shared/curios'
import { buildCurioRecords } from '../src/shared/curioRecords'
import { createEmptyCustomItem } from '../src/shared/customItems'
import { buildCustomRecords } from '../src/shared/customRecords'
import { addDraftToEntry, createEmptyRecipeAddDraft } from '../src/shared/recipes'
import type { CurioRecord, CustomRecord, EditRecord, RecipeRecord } from '../src/shared/types'

/**
 * 记录存储集成测试：验证属性记录 / 配方记录写为可读 JSON 文件、
 * 重启后能读回、损坏容错与旧配置迁移。
 */

let tempRoot = ''
let recordDir = ''

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubejs-records-test-'))
  recordDir = path.join(tempRoot, RECORD_DIR_NAME)
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

function editRecord(overrides: Partial<EditRecord> = {}): EditRecord {
  return {
    id: 'e1',
    at: '2026-09-20T02:00:00.000Z',
    scriptName: 'item_modifications.js',
    filePath: 'D:/mc/kubejs/startup_scripts/item_modifications.js',
    target: 'script',
    itemId: 'minecraft:apple',
    displayName: '苹果',
    properties: { maxStackSize: 16 },
    ...overrides
  }
}

function recipeRecord(id: string): RecipeRecord {
  const draft = createEmptyRecipeAddDraft('shapeless')
  draft.output = 'minecraft:stick'
  draft.ingredients = ['#minecraft:planks']
  return {
    id,
    at: '2026-09-20T03:00:00.000Z',
    scriptName: 'recipes.js',
    filePath: 'D:/mc/kubejs/server_scripts/recipes.js',
    entry: addDraftToEntry(draft, id)
  }
}

function readFile(fileName: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(recordDir, fileName), 'utf8')) as Record<string, unknown>
}

function customRecord(id: string): CustomRecord {
  return buildCustomRecords({
    items: [{ ...createEmptyCustomItem('sword'), name: 'blade', displayName: '测试之剑' }],
    scriptName: 'custom_items.js',
    filePath: 'D:/mc/kubejs/startup_scripts/custom_items.js',
    at: '2026-09-20T04:00:00.000Z'
  }).map((record) => ({ ...record, id }))[0]
}

function curioRecord(id: string): CurioRecord {
  return buildCurioRecords({
    items: [{ ...createEmptyCurio(), name: 'fire_charm', displayName: '火焰护符', slot: 'charm' }],
    scriptName: 'curios_trinkets.js',
    filePath: 'D:/mc/kubejs/startup_scripts/curios_trinkets.js',
    at: '2026-09-20T05:00:00.000Z'
  }).map((record) => ({ ...record, id }))[0]
}

describe('RecordStore - 文件位置与格式', () => {
  it('记录目录不存在时不创建文件，返回空记录', () => {
    const store = new RecordStore(recordDir)
    expect(store.getEditRecords()).toEqual([])
    expect(store.getRecipeRecords()).toEqual([])
    expect(store.getCustomRecords()).toEqual([])
    expect(store.getCurioRecords()).toEqual([])
    expect(fs.existsSync(recordDir)).toBe(false)
  })

  it('记录写在 KieJS 子目录下的可读 JSON 文件里', () => {
    const store = new RecordStore(recordDir)
    store.addEditRecords([editRecord()])

    expect(store.dir).toBe(recordDir)
    expect(store.editRecordsPath).toBe(path.join(recordDir, EDIT_RECORD_FILE))
    expect(RECORD_DIR_NAME).toBe('KieJS')
    expect(EDIT_RECORD_FILE).toBe('item-records.json')
    expect(RECIPE_RECORD_FILE).toBe('recipe-records.json')

    const content = fs.readFileSync(store.editRecordsPath, 'utf8')
    // 2 空格缩进 + 结尾换行，便于直接打开查看
    expect(content).toContain('\n  "format"')
    expect(content.endsWith('}\n')).toBe(true)

    const parsed = readFile(EDIT_RECORD_FILE)
    expect(parsed.format).toBe('kubejs-item-editor/records')
    expect(parsed.version).toBe(1)
    expect(typeof parsed.description).toBe('string')
    expect(parsed.count).toBe(1)
    expect(Array.isArray(parsed.records)).toBe(true)
  })

  it('属性记录与配方记录分别存两个文件，互不影响', () => {
    const store = new RecordStore(recordDir)
    store.addEditRecords([editRecord()])
    store.addRecipeRecords([recipeRecord('r1')])

    expect(fs.existsSync(path.join(recordDir, EDIT_RECORD_FILE))).toBe(true)
    expect(fs.existsSync(path.join(recordDir, RECIPE_RECORD_FILE))).toBe(true)
    expect(readFile(EDIT_RECORD_FILE).count).toBe(1)
    expect(readFile(RECIPE_RECORD_FILE).count).toBe(1)

    store.clearRecipeRecords()
    expect(readFile(RECIPE_RECORD_FILE).count).toBe(0)
    expect(readFile(EDIT_RECORD_FILE).count).toBe(1)
  })
})

describe('RecordStore - 读写与重启恢复', () => {
  it('追加的记录最新在前，重新构造实例后可读回（模拟重启）', () => {
    const store = new RecordStore(recordDir)
    store.addEditRecords([editRecord({ id: 'old', at: '2026-09-19T02:00:00.000Z' })])
    store.addEditRecords([editRecord({ id: 'new', at: '2026-09-21T02:00:00.000Z' })])

    const reopened = new RecordStore(recordDir)
    expect(reopened.getEditRecords().map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('配方记录同样可读回且保留条目内容', () => {
    const store = new RecordStore(recordDir)
    store.addRecipeRecords([recipeRecord('r1')])

    const reopened = new RecordStore(recordDir)
    const records = reopened.getRecipeRecords()
    expect(records).toHaveLength(1)
    expect(records[0].scriptName).toBe('recipes.js')
    expect(records[0].entry.kind).toBe('add')
  })

  it('自定义物品记录写在独立文件里，可读回并单独清空', () => {
    const store = new RecordStore(recordDir)
    store.addCustomRecords([customRecord('c1')])
    store.addEditRecords([editRecord()])

    expect(store.customRecordsPath).toBe(path.join(recordDir, CUSTOM_RECORD_FILE))
    expect(CUSTOM_RECORD_FILE).toBe('custom-records.json')
    expect(readFile(CUSTOM_RECORD_FILE).count).toBe(1)

    const reopened = new RecordStore(recordDir)
    const records = reopened.getCustomRecords()
    expect(records).toHaveLength(1)
    expect(records[0].itemId).toBe('kubejs:blade')
    expect(records[0].kindLabel).toBe('武器 · 剑')
    expect(records[0].summary).toContain('kubejs:blade')

    expect(reopened.clearCustomRecords()).toEqual([])
    expect(readFile(CUSTOM_RECORD_FILE).records).toEqual([])
    // 清空自定义物品记录不影响属性记录
    expect(readFile(EDIT_RECORD_FILE).count).toBe(1)
  })

  it('自定义饰品记录写在独立文件里，可读回并单独清空', () => {
    const store = new RecordStore(recordDir)
    store.addCurioRecords([curioRecord('k1')])
    store.addCustomRecords([customRecord('c1')])

    expect(store.curioRecordsPath).toBe(path.join(recordDir, CURIO_RECORD_FILE))
    expect(CURIO_RECORD_FILE).toBe('curio-records.json')
    expect(readFile(CURIO_RECORD_FILE).count).toBe(1)

    const reopened = new RecordStore(recordDir)
    const records = reopened.getCurioRecords()
    expect(records).toHaveLength(1)
    expect(records[0].itemId).toBe('kubejs:fire_charm')
    expect(records[0].slotLabel).toContain('饰品')
    expect(records[0].summary).toContain('槽位 charm')

    expect(reopened.clearCurioRecords()).toEqual([])
    expect(readFile(CURIO_RECORD_FILE).records).toEqual([])
    // 清空饰品记录不影响自定义物品记录
    expect(readFile(CUSTOM_RECORD_FILE).count).toBe(1)
  })

  it('清空记录后文件里 records 为空数组', () => {
    const store = new RecordStore(recordDir)
    store.addEditRecords([editRecord()])

    expect(store.clearEditRecords()).toEqual([])
    expect(readFile(EDIT_RECORD_FILE).records).toEqual([])
    expect(new RecordStore(recordDir).getEditRecords()).toEqual([])
  })

  it('记录文件内容损坏时返回空记录，不抛异常', () => {
    fs.mkdirSync(recordDir, { recursive: true })
    fs.writeFileSync(path.join(recordDir, EDIT_RECORD_FILE), '{ 不是合法 JSON', 'utf8')

    const store = new RecordStore(recordDir)
    expect(store.getEditRecords()).toEqual([])
  })
})

describe('RecordStore - 旧配置迁移', () => {
  it('首次运行时把 config.json 里遗留的编辑记录迁移到记录文件', () => {
    const legacy = [editRecord({ id: 'legacy', at: '2026-09-18T02:00:00.000Z' })]

    const store = new RecordStore(recordDir, legacy)
    expect(store.getEditRecords().map((item) => item.id)).toEqual(['legacy'])
    expect(readFile(EDIT_RECORD_FILE).count).toBe(1)

    // 迁移只发生一次：再次构造时以记录文件为准
    const reopened = new RecordStore(recordDir, legacy)
    expect(reopened.getEditRecords()).toHaveLength(1)
  })

  it('记录文件已有内容时忽略遗留数据', () => {
    const store = new RecordStore(recordDir)
    store.addEditRecords([editRecord({ id: 'file' })])

    const reopened = new RecordStore(recordDir, [editRecord({ id: 'legacy' })])
    expect(reopened.getEditRecords().map((item) => item.id)).toEqual(['file'])
  })

  it('遗留数据非法时不写入记录文件', () => {
    const store = new RecordStore(recordDir, [{ itemId: 'BAD ID' }, null, 'text'])
    expect(store.getEditRecords()).toEqual([])
    expect(fs.existsSync(path.join(recordDir, EDIT_RECORD_FILE))).toBe(false)
  })
})
