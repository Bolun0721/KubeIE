<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus, RefreshLeft } from '@element-plus/icons-vue'
import {
  MAX_SHAPELESS_INGREDIENTS,
  RECIPE_REMOVE_MODES,
  RECIPE_TYPES,
  filledGridCells,
  recipeRemoveModeInfo,
  recipeTypeInfo,
  summarizeRecipeEntry
} from '@shared/recipes'
import type { RecipeKind, RecipeRemoveMode, RecipeTypeId } from '@shared/types'
import { useEditor } from '../composables/useEditor'

/**
 * 配方编辑区：先选配方类型，再按类型显示对应的格子，填好后加入配方队列。
 * 布局与物品属性编辑区一致（面板头 + 可滚动表单 + 底部按钮）。
 */
const {
  state,
  recipeDraftEntry,
  recipeDraftValidation,
  setRecipeKind,
  setRecipeType,
  resetRecipeDraft,
  setRecipeActiveSlot,
  addIngredientSlot,
  removeIngredientSlot,
  clearRecipeGrid,
  upsertRecipeQueue
} = useEditor()

const KIND_OPTIONS: { value: RecipeKind; label: string }[] = [
  { value: 'add', label: '新建配方' },
  { value: 'remove', label: '删除配方' }
]

const kind = computed<RecipeKind>({
  get: () => state.recipeKind,
  set: (value) => setRecipeKind(value)
})

const recipeType = computed<RecipeTypeId>({
  get: () => state.recipeAddDraft.type,
  set: (value) => setRecipeType(value)
})

const removeMode = computed<RecipeRemoveMode>({
  get: () => state.recipeRemoveDraft.mode,
  set: (value) => {
    state.recipeRemoveDraft.mode = value
  }
})

const typeInfo = computed(() => recipeTypeInfo(state.recipeAddDraft.type))
const removeModeInfo = computed(() => recipeRemoveModeInfo(state.recipeRemoveDraft.mode))
const draftTags = computed(() => summarizeRecipeEntry(recipeDraftEntry.value))
const gridCells = computed(() => state.recipeAddDraft.grid.length)

/** 格子高亮：当前激活的格子在左侧列表点选物品时会被填入 */
function slotClass(slot: string): Record<string, boolean> {
  return { active: state.recipeActiveSlot === slot }
}

function focusSlot(slot: string): void {
  setRecipeActiveSlot(slot)
}

/** 3×3 网格中已填的格子数（界面提示用） */
const filledCount = computed(() => filledGridCells(state.recipeAddDraft).length)
</script>

<template>
  <div class="panel recipe-editor">
    <div class="panel-header">
      <span>配方编辑</span>
      <span class="hint">点格子 → 左侧列表选物品，也可直接输入 ID</span>
    </div>

    <div class="panel-body recipe-body">
      <div class="selector-row">
        <el-select v-model="kind" size="small" class="kind-select">
          <el-option
            v-for="option in KIND_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-select v-if="state.recipeKind === 'add'" v-model="recipeType" size="small" class="type-select">
          <el-option v-for="item in RECIPE_TYPES" :key="item.id" :label="item.label" :value="item.id" />
        </el-select>
        <el-select v-else v-model="removeMode" size="small" class="type-select">
          <el-option
            v-for="item in RECIPE_REMOVE_MODES"
            :key="item.id"
            :label="item.label"
            :value="item.id"
          />
        </el-select>
      </div>

      <!-- ============ 新建配方 ============ -->
      <template v-if="state.recipeKind === 'add'">
        <div class="section-title">
          <span>产物</span>
          <span class="hint">数量 &gt; 1 时生成 Item.of(物品, 数量)</span>
        </div>
        <div class="slot-row">
          <div class="slot grow" :class="slotClass('output')">
            <el-input
              v-model="state.recipeAddDraft.output"
              size="small"
              placeholder="产物物品 ID，如 minecraft:iron_shovel"
              @focus="focusSlot('output')"
            />
          </div>
          <el-input-number
            v-model="state.recipeAddDraft.outputCount"
            size="small"
            :min="1"
            :max="64"
            controls-position="right"
            class="count-input"
          />
        </div>

        <div class="section-title">
          <span>
            材料
            <span v-if="typeInfo.slot === 'grid'" class="hint">（已填 {{ filledCount }} / {{ gridCells }} 格）</span>
            <span v-else-if="typeInfo.slot === 'list'" class="hint">
              （{{ state.recipeAddDraft.ingredients.length }} 个，最多 {{ MAX_SHAPELESS_INGREDIENTS }} 个）
            </span>
          </span>
          <el-button v-if="typeInfo.slot === 'grid'" size="small" link @click="clearRecipeGrid">清空格子</el-button>
        </div>

        <!-- 有序合成：3×3 网格 -->
        <div v-if="typeInfo.slot === 'grid'" class="recipe-grid">
          <div v-for="index in gridCells" :key="index" class="slot" :class="slotClass(`grid-${index - 1}`)">
            <el-input
              v-model="state.recipeAddDraft.grid[index - 1]"
              size="small"
              placeholder="ID"
              @focus="focusSlot(`grid-${index - 1}`)"
            />
          </div>
        </div>

        <!-- 无序合成：材料列表 -->
        <div v-else-if="typeInfo.slot === 'list'" class="ingredient-list">
          <div
            v-for="index in state.recipeAddDraft.ingredients.length"
            :key="index"
            class="ingredient-row"
          >
            <div class="slot grow" :class="slotClass(`ingredient-${index - 1}`)">
              <el-input
                v-model="state.recipeAddDraft.ingredients[index - 1]"
                size="small"
                placeholder="材料 ID 或 #标签"
                @focus="focusSlot(`ingredient-${index - 1}`)"
              />
            </div>
            <el-button
              size="small"
              link
              type="danger"
              :icon="Delete"
              @click="removeIngredientSlot(index - 1)"
            />
          </div>
          <el-button
            size="small"
            :icon="Plus"
            :disabled="state.recipeAddDraft.ingredients.length >= MAX_SHAPELESS_INGREDIENTS"
            @click="addIngredientSlot"
          >
            添加材料
          </el-button>
        </div>

        <!-- 熔炼类 / 切石机：单一输入 -->
        <div v-else-if="typeInfo.slot === 'single'" class="slot" :class="slotClass('input')">
          <el-input
            v-model="state.recipeAddDraft.input"
            size="small"
            placeholder="输入材料 ID 或 #标签，如 minecraft:sand"
            @focus="focusSlot('input')"
          />
        </div>

        <!-- 锻造台：模板 + 基底 + 添加材料 -->
        <div v-else class="smithing-list">
          <div class="slot" :class="slotClass('template')">
            <el-input
              v-model="state.recipeAddDraft.template"
              size="small"
              placeholder="模板，如 minecraft:netherite_upgrade_smithing_template"
              @focus="focusSlot('template')"
            />
          </div>
          <div class="slot" :class="slotClass('base')">
            <el-input
              v-model="state.recipeAddDraft.base"
              size="small"
              placeholder="基底装备，如 minecraft:diamond_sword"
              @focus="focusSlot('base')"
            />
          </div>
          <div class="slot" :class="slotClass('addition')">
            <el-input
              v-model="state.recipeAddDraft.addition"
              size="small"
              placeholder="添加材料，如 minecraft:netherite_ingot"
              @focus="focusSlot('addition')"
            />
          </div>
        </div>

        <p class="hint note">{{ typeInfo.note }}</p>
      </template>

      <!-- ============ 删除配方 ============ -->
      <template v-else>
        <div class="section-title">
          <span>过滤条件</span>
          <span class="hint">对应 event.remove(...)</span>
        </div>
        <div class="slot" :class="{ active: false }">
          <el-input
            v-model="state.recipeRemoveDraft.value"
            size="small"
            :placeholder="removeModeInfo.placeholder"
          />
        </div>
        <div class="slot">
          <el-input
            v-model="state.recipeRemoveDraft.typeFilter"
            size="small"
            placeholder="可选：限定配方类型，如 minecraft:crafting_shapeless"
          />
        </div>
        <p class="hint note">{{ removeModeInfo.note }}</p>
      </template>

      <div class="tags">
        <el-tag v-for="tag in draftTags" :key="tag" size="small" type="info" effect="plain">
          {{ tag }}
        </el-tag>
      </div>

      <div v-if="recipeDraftValidation.errors.length > 0" class="feedback error-text">
        {{ recipeDraftValidation.errors[0] }}
      </div>
      <div v-else-if="recipeDraftValidation.warnings.length > 0" class="feedback warn-text">
        {{ recipeDraftValidation.warnings[0] }}
      </div>
    </div>

    <div class="panel-footer">
      <el-button size="small" :icon="RefreshLeft" @click="resetRecipeDraft">重置</el-button>
      <el-button type="primary" size="small" class="grow" @click="upsertRecipeQueue">
        {{ state.recipeEditingIndex >= 0 ? '更新配方队列项' : '添加到配方队列' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.recipe-body {
  padding: 10px 12px;
}

.selector-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.kind-select {
  width: 116px;
}

.type-select {
  flex: 1;
  min-width: 0;
}

.section-title {
  margin-bottom: 6px;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.count-input {
  width: 100px;
  flex: none;
}

/* 当前激活的格子：左侧列表点选物品即填入此格 */
.slot.active :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #409eff inset;
}

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  max-width: 380px;
}

.ingredient-list,
.smithing-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ingredient-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.note {
  margin: 10px 0 0;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
}

.feedback {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.error-text {
  color: #f56c6c;
}

.warn-text {
  color: #e6a23c;
}
</style>
