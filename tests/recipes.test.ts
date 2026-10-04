import { describe, expect, it } from 'vitest'
import { generateRecipeScript, shapedLayout } from '../src/main/recipeGenerator'
import {
  addDraftToEntry,
  addEntryToDraft,
  createEmptyRecipeAddDraft,
  createEmptyRecipeGrid,
  createEmptyRecipeRemoveDraft,
  filledGridCells,
  isRecipeId,
  isRecipeIngredient,
  isRecipeModId,
  isRecipeRegex,
  isRecipeRemoveValue,
  isRecipeTag,
  recipeRemoveModeInfo,
  recipeTypeInfo,
  removeDraftToEntry,
  removeEntryToDraft,
  summarizeRecipeEntry,
  validateRecipeEntries,
  validateRecipeEntry
} from '../src/shared/recipes'
import type { RecipeAddEntry, RecipeRemoveEntry } from '../src/shared/types'

/** 构造新建条目：走与界面一致的草稿转换，保证裁剪 / 数量规范化生效 */
function addEntry(partial: Partial<RecipeAddEntry> = {}): RecipeAddEntry {
  const { key, kind = 'add', ...draft } = partial
  const base = createEmptyRecipeAddDraft(draft.type ?? 'shaped')
  return { ...addDraftToEntry({ ...base, ...draft }, key ?? 'k1'), kind }
}

function removeEntry(partial: Partial<RecipeRemoveEntry> = {}): RecipeRemoveEntry {
  const { key, kind = 'remove', ...draft } = partial
  return { ...removeDraftToEntry({ ...createEmptyRecipeRemoveDraft(), ...draft }, key ?? 'r1'), kind }
}

describe('配方取值格式判断', () => {
  it('区分物品 ID / 标签 / 正则', () => {
    expect(isRecipeId('minecraft:iron_ingot')).toBe(true)
    expect(isRecipeId('#minecraft:planks')).toBe(false)
    expect(isRecipeTag('#minecraft:planks')).toBe(true)
    expect(isRecipeTag('minecraft:planks')).toBe(false)
    expect(isRecipeRegex('/_pickaxe/')).toBe(true)
    expect(isRecipeRegex('minecraft:stick')).toBe(false)
    expect(isRecipeModId('create')).toBe(true)
    expect(isRecipeModId('create:brass')).toBe(false)
  })

  it('isRecipeIngredient 只接受物品 ID 与标签', () => {
    expect(isRecipeIngredient('minecraft:iron_ingot')).toBe(true)
    expect(isRecipeIngredient('#forge:ingots/iron')).toBe(true)
    expect(isRecipeIngredient('/_pickaxe/')).toBe(false)
    expect(isRecipeIngredient('')).toBe(false)
    expect(isRecipeIngredient('Iron_Ingot')).toBe(false)
  })

  it('isRecipeRemoveValue 按删除方式校验', () => {
    expect(isRecipeRemoveValue('mod', 'create')).toBe(true)
    expect(isRecipeRemoveValue('mod', 'create:brass')).toBe(false)
    expect(isRecipeRemoveValue('type', 'minecraft:smelting')).toBe(true)
    expect(isRecipeRemoveValue('type', 'smelting')).toBe(false)
    expect(isRecipeRemoveValue('id', 'minecraft:cobblestone')).toBe(true)
    expect(isRecipeRemoveValue('id', '/_planks/')).toBe(true)
    expect(isRecipeRemoveValue('id', '#minecraft:planks')).toBe(false)
    expect(isRecipeRemoveValue('output', '#minecraft:planks')).toBe(true)
    expect(isRecipeRemoveValue('output', '/_pickaxe/')).toBe(true)
    expect(isRecipeRemoveValue('input', 'minecraft:stick')).toBe(true)
    expect(isRecipeRemoveValue('output', '')).toBe(false)
  })

  it('类型与删除方式目录可查询', () => {
    expect(recipeTypeInfo('campfire').method).toBe('campfireCooking')
    expect(recipeTypeInfo('smithing').slot).toBe('smithing')
    expect(recipeTypeInfo('shaped').slot).toBe('grid')
    expect(recipeRemoveModeInfo('input').short).toBe('材料')
  })
})

describe('配方草稿与队列条目互转', () => {
  it('空草稿的默认值可直接用于界面', () => {
    const draft = createEmptyRecipeAddDraft()
    expect(draft.grid).toHaveLength(9)
    expect(draft.ingredients).toEqual([''])
    expect(draft.outputCount).toBe(1)
  })

  it('加入队列时去掉两端空格、丢弃空材料格', () => {
    const draft = createEmptyRecipeAddDraft('shapeless')
    draft.output = ' minecraft:flint_and_steel '
    draft.ingredients = [' minecraft:iron_ingot ', '', 'minecraft:flint', '  ']

    const entry = addDraftToEntry(draft, 'k1')
    expect(entry.output).toBe('minecraft:flint_and_steel')
    expect(entry.ingredients).toEqual(['minecraft:iron_ingot', 'minecraft:flint'])
  })

  it('产物数量 ≤ 1 记为 null（生成时写纯字符串）', () => {
    const draft = createEmptyRecipeAddDraft()
    expect(addDraftToEntry({ ...draft, outputCount: 1 }, 'k').outputCount).toBeNull()
    expect(addDraftToEntry({ ...draft, outputCount: 2.6 }, 'k').outputCount).toBe(2)
    expect(addDraftToEntry({ ...draft, outputCount: null }, 'k').outputCount).toBeNull()
  })

  it('由队列条目回到草稿时补齐固定长度网格与材料格', () => {
    const draft = addEntryToDraft(
      addEntry({ grid: ['minecraft:stick'], ingredients: [] })
    )
    expect(draft.grid).toHaveLength(9)
    expect(draft.grid[0]).toBe('minecraft:stick')
    expect(draft.ingredients).toEqual([''])
  })

  it('删除条目与草稿互转', () => {
    const entry = removeEntry({ mode: 'mod', value: ' somemod ', typeFilter: '' })
    expect(entry.value).toBe('somemod')
    expect(removeEntryToDraft(entry)).toEqual({ mode: 'mod', value: 'somemod', typeFilter: '' })
  })
})

describe('配方校验 - 新建', () => {
  it('有序合成：材料格子全空时报错', () => {
    const { errors } = validateRecipeEntry(addEntry({ output: 'minecraft:iron_shovel' }))
    expect(errors.some((error) => error.includes('请至少填入 1 个材料格子'))).toBe(true)
  })

  it('有序合成：只填 1 格时给出改用无序合成的提示', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:iron_ingot'
    const { errors, warnings } = validateRecipeEntry(
      addEntry({ output: 'minecraft:iron_ingot', grid })
    )
    expect(errors).toEqual([])
    expect(warnings.some((warning) => warning.includes('无序合成'))).toBe(true)
  })

  it('产物不能使用标签，材料可以是标签', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = '#minecraft:planks'
    const { errors } = validateRecipeEntry(addEntry({ output: '#minecraft:planks', grid }))
    expect(errors.some((error) => error.includes('产物不支持标签写法'))).toBe(true)
  })

  it('材料格子不支持正则，并指出具体行列', () => {
    const grid = createEmptyRecipeGrid()
    grid[4] = '/_planks/'
    const { errors } = validateRecipeEntry(addEntry({ output: 'minecraft:chest', grid }))
    expect(errors.some((error) => error.includes('第 2 行第 2 列'))).toBe(true)
    expect(errors.some((error) => error.includes('不支持正则写法'))).toBe(true)
  })

  it('无序合成：材料数量与内容都要合法', () => {
    expect(
      validateRecipeEntry(addEntry({ type: 'shapeless', output: 'minecraft:stick', ingredients: [] }))
        .errors.some((error) => error.includes('请至少填入 1 个材料'))
    ).toBe(true)

    const tooMany = Array.from({ length: 10 }, () => 'minecraft:stick')
    expect(
      validateRecipeEntry(addEntry({ type: 'shapeless', output: 'minecraft:stick', ingredients: tooMany }))
        .errors.some((error) => error.includes('最多 9 个'))
    ).toBe(true)

    expect(
      validateRecipeEntry(addEntry({ type: 'shapeless', output: 'minecraft:stick', ingredients: ['BAD'] }))
        .errors.some((error) => error.includes('不是合法的物品 ID 或标签'))
    ).toBe(true)
  })

  it('熔炼类 / 切石机：输入材料必填', () => {
    for (const type of ['smelting', 'blasting', 'smoking', 'campfire', 'stonecutting'] as const) {
      const { errors } = validateRecipeEntry(
        addEntry({ type, output: 'minecraft:glass', input: '' })
      )
      expect(errors.some((error) => error.includes('输入材料不能为空')), type).toBe(true)
    }
  })

  it('锻造台：模板 / 基底 / 添加材料都要填', () => {
    const { errors } = validateRecipeEntry(
      addEntry({
        type: 'smithing',
        output: 'minecraft:netherite_sword',
        template: 'minecraft:netherite_upgrade_smithing_template',
        base: '',
        addition: ''
      })
    )
    expect(errors.filter((error) => error.includes('不能为空'))).toHaveLength(2)
  })

  it('产物数量超出常见范围时给出提醒', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:stone'
    const { warnings } = validateRecipeEntry(
      addEntry({ type: 'stonecutting', output: 'minecraft:stone_button', input: 'minecraft:stone', outputCount: 99, grid })
    )
    expect(warnings.some((warning) => warning.includes('超过一组'))).toBe(true)
  })
})

describe('配方校验 - 删除', () => {
  it('过滤值必填且格式要与删除方式匹配', () => {
    expect(
      validateRecipeEntry(removeEntry({ mode: 'output', value: '' })).errors.some((error) =>
        error.includes('需要填写过滤值')
      )
    ).toBe(true)

    expect(
      validateRecipeEntry(removeEntry({ mode: 'mod', value: 'create:brass' })).errors.some((error) =>
        error.includes('过滤值非法')
      )
    ).toBe(true)

    expect(
      validateRecipeEntry(removeEntry({ mode: 'type', value: '#minecraft:planks' })).errors.some((error) =>
        error.includes('过滤值非法')
      )
    ).toBe(true)

    expect(validateRecipeEntry(removeEntry({ mode: 'output', value: '/_pickaxe/' })).errors).toEqual([])
  })

  it('按材料删除会给出范围过广的提醒', () => {
    const { warnings } = validateRecipeEntry(removeEntry({ mode: 'input', value: 'minecraft:stick' }))
    expect(warnings.some((warning) => warning.includes('范围很广'))).toBe(true)
  })

  it('正则未加锚点时提醒', () => {
    const { warnings } = validateRecipeEntry(removeEntry({ mode: 'output', value: '/_pickaxe/' }))
    expect(warnings.some((warning) => warning.includes('锚点'))).toBe(true)
  })

  it('限定的配方类型必须合法', () => {
    const { errors } = validateRecipeEntry(
      removeEntry({ mode: 'output', value: 'minecraft:iron_pickaxe', typeFilter: 'not valid' })
    )
    expect(errors.some((error) => error.includes('限定的配方类型非法'))).toBe(true)
  })
})

describe('配方批量校验与摘要标签', () => {
  it('重复的新建配方给出覆盖提醒', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:diamond'
    const first = addEntry({ key: 'a', output: 'minecraft:diamond_sword', grid })
    const second = addEntry({ key: 'b', output: 'minecraft:diamond_sword', grid })
    const { warnings } = validateRecipeEntries([first, second])
    expect(warnings.some((warning) => warning.includes('出现了多条同类配方'))).toBe(true)
  })

  it('摘要标签反映配方要点', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:iron_ingot'
    grid[3] = 'minecraft:stick'

    const shaped = addEntry({ output: 'minecraft:iron_shovel', outputCount: 2, grid })
    const tags = summarizeRecipeEntry(shaped)
    expect(tags).toContain('有序合成')
    expect(tags).toContain('产物 minecraft:iron_shovel')
    expect(tags).toContain('材料 2 格')
    expect(tags).toContain('×2')

    expect(summarizeRecipeEntry(removeEntry({ mode: 'mod', value: 'somemod' }))).toEqual([
      '删除配方',
      '模组 somemod'
    ])
  })

  it('filledGridCells 只统计已填格子', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:stick'
    grid[8] = ' '
    expect(filledGridCells(addEntry({ grid }))).toEqual(['minecraft:stick'])
  })
})

describe('配方脚本生成', () => {
  it('队列为空时只输出骨架与提示注释', () => {
    const code = generateRecipeScript([])
    expect(code).toContain('ServerEvents.recipes(event => {')
    expect(code).toContain('// 配方队列为空')
    expect(code.trimEnd().endsWith('})')).toBe(true)
    expect(code).toContain('/kubejs reload server_scripts')
  })

  it('有序合成：自动分配字符并裁掉空行空列', () => {
    const grid = createEmptyRecipeGrid()
    // 第 1 列：铁锭 / 木棍（对应教程里的铁锹写法）
    grid[0] = 'minecraft:iron_ingot'
    grid[3] = 'minecraft:stick'

    const code = generateRecipeScript([
      addEntry({ output: 'minecraft:iron_shovel', outputCount: 2, grid })
    ])

    expect(code).toContain(
      [
        "  event.shaped(Item.of('minecraft:iron_shovel', 2), [",
        "    'A',",
        "    'B'",
        '  ], {',
        "    A: 'minecraft:iron_ingot',",
        "    B: 'minecraft:stick'",
        '  })'
      ].join('\n')
    )
  })

  it('有序合成：同一物品复用同一字符，保留图案中的空格', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:iron_ingot'
    grid[1] = 'minecraft:iron_ingot'
    grid[4] = 'minecraft:stick'

    const code = generateRecipeScript([addEntry({ output: 'minecraft:iron_ingot', grid })])
    expect(code).toContain("    'AA',\n    ' B'\n  ], {\n    A: 'minecraft:iron_ingot',\n    B: 'minecraft:stick'\n  })")
  })

  it('有序合成：材料格子全空时写成注释而不生成调用', () => {
    const code = generateRecipeScript([addEntry({ output: 'minecraft:chest' })])
    expect(code).toContain('// 材料格子为空，已跳过该配方')
    expect(code).not.toContain('event.shaped')
  })

  it('shapedLayout 裁掉四周空行空列', () => {
    const grid = createEmptyRecipeGrid()
    grid[4] = 'minecraft:diamond'
    const layout = shapedLayout(addEntry({ grid }))
    expect(layout?.rows).toEqual(['A'])
    expect(layout?.keys).toEqual([{ char: 'A', id: 'minecraft:diamond' }])
    expect(shapedLayout(addEntry())).toBeNull()
  })

  it('无序合成：逐个列出材料，数量为 1 时不写 Item.of', () => {
    const code = generateRecipeScript([
      addEntry({
        type: 'shapeless',
        output: 'minecraft:flint_and_steel',
        ingredients: ['minecraft:iron_ingot', 'minecraft:flint']
      })
    ])
    expect(code).toContain(
      [
        "  event.shapeless('minecraft:flint_and_steel', [",
        "    'minecraft:iron_ingot',",
        "    'minecraft:flint'",
        '  ])'
      ].join('\n')
    )
  })

  it('熔炼类与切石机使用各自的方法名', () => {
    const cases: [string, string][] = [
      ['smelting', 'smelting'],
      ['blasting', 'blasting'],
      ['smoking', 'smoking'],
      ['campfire', 'campfireCooking'],
      ['stonecutting', 'stonecutting']
    ]
    for (const [type, method] of cases) {
      const code = generateRecipeScript([
        addEntry({
          type: type as RecipeAddEntry['type'],
          output: 'minecraft:glass',
          input: 'minecraft:sand'
        })
      ])
      expect(code, type).toContain(
        `  event.${method}('minecraft:glass', 'minecraft:sand')`
      )
    }
  })

  it('锻造台输出 4 个参数', () => {
    const code = generateRecipeScript([
      addEntry({
        type: 'smithing',
        output: 'minecraft:netherite_sword',
        template: 'minecraft:netherite_upgrade_smithing_template',
        base: 'minecraft:diamond_sword',
        addition: 'minecraft:netherite_ingot'
      })
    ])
    expect(code).toContain(
      [
        '  event.smithing(',
        "    'minecraft:netherite_sword',",
        "    'minecraft:netherite_upgrade_smithing_template',",
        "    'minecraft:diamond_sword',",
        "    'minecraft:netherite_ingot'",
        '  )'
      ].join('\n')
    )
  })

  it('删除规则：过滤字段与正则写法', () => {
    const output = generateRecipeScript([removeEntry({ mode: 'output', value: 'minecraft:iron_pickaxe' })])
    expect(output).toContain("  event.remove({ output: 'minecraft:iron_pickaxe' })")

    const regex = generateRecipeScript([removeEntry({ mode: 'output', value: '/_pickaxe/' })])
    expect(regex).toContain('  event.remove({ output: /_pickaxe/ })')

    const mod = generateRecipeScript([removeEntry({ mode: 'mod', value: 'somemod' })])
    expect(mod).toContain("  event.remove({ mod: 'somemod' })")

    const type = generateRecipeScript([removeEntry({ mode: 'type', value: 'minecraft:smelting' })])
    expect(type).toContain("  event.remove({ type: 'minecraft:smelting' })")

    const withFilter = generateRecipeScript([
      removeEntry({
        mode: 'output',
        value: '#minecraft:planks',
        typeFilter: 'minecraft:crafting_shapeless'
      })
    ])
    expect(withFilter).toContain(
      "  event.remove({ output: '#minecraft:planks', type: 'minecraft:crafting_shapeless' })"
    )
  })

  it('无论队列顺序如何，删除规则都排在新增配方之前', () => {
    const grid = createEmptyRecipeGrid()
    grid[0] = 'minecraft:paper'
    const code = generateRecipeScript([
      addEntry({ key: 'a', output: 'minecraft:book', grid }),
      removeEntry({ key: 'b', mode: 'output', value: 'minecraft:book' })
    ])

    expect(code.indexOf('event.remove')).toBeLessThan(code.indexOf('event.shaped'))
    expect(code).toContain('===== 删除配方（1 条）')
    expect(code).toContain('===== 新增配方（1 条）')
  })
})
