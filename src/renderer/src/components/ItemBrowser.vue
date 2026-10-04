<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { CURIO_ITEM_MOD, curioId } from '@shared/curios'
import { customItemId } from '@shared/customItems'
import { isRecipeIngredient } from '@shared/recipes'
import type { ItemCategory, ItemEntry } from '@shared/types'
import { useEditor } from '../composables/useEditor'
import { CATEGORY_LABELS } from '../utils/labels'

const { state, search, pickItem, applyRecipeItem, selectById, currentTarget } = useEditor()

const categoryOptions = (Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABELS[value]
}))

const manualId = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => [state.filters.keyword, state.filters.mod, state.filters.category],
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void search()
    }, 250)
  }
)

/** 点击物品：物品属性界面切换编辑目标，配方界面填入当前激活的格子 */
function handleSelect(entry: ItemEntry): void {
  pickItem(entry)
}

function handleAddManual(): void {
  const value = manualId.value.trim()
  if (!value) {
    ElMessage.warning('请输入物品注册名，例如 minecraft:ender_pearl')
    return
  }

  if (state.mode === 'recipes') {
    if (!isRecipeIngredient(value)) {
      ElMessage.warning('请输入合法的物品 ID 或 #标签，例如 minecraft:iron_ingot 或 #forge:ingots/iron')
      return
    }
    if (!applyRecipeItem(value)) {
      ElMessage.warning('请先点击要填充的格子（产物 / 材料格 / 输入格）')
      return
    }
    manualId.value = ''
    return
  }

  if (state.mode === 'custom' || state.mode === 'curios') {
    // 自定义物品 / 饰品子界面：输入注册名即载入表单编辑；其他 ID 只作参考
    const entry = state.items.find((item) => item.id === value)
    pickItem(entry ?? { id: value, name: value, mod: '', category: 'general', edible: false, toolLike: false })
    manualId.value = ''
    return
  }

  selectById(value)
  manualId.value = ''
}

function isActive(entry: ItemEntry): boolean {
  if (state.mode === 'recipes') return false
  if (state.mode === 'custom') {
    // 自定义子界面：高亮当前正在编辑的物品（物品列表以「已创建物品」为准，与物品库独立）
    return state.customLibrary.created.some((item) => customItemId(item) === entry.id)
  }
  if (state.mode === 'curios') {
    return state.curioLibrary.created.some((item) => curioId(item) === entry.id)
  }
  const target = currentTarget.value
  return !!target && target.itemId === entry.id
}

/** 自定义饰品（KubeCurios 模组）：始终保留绿色填充与高亮提示 */
function isCurio(entry: ItemEntry): boolean {
  return entry.mod === CURIO_ITEM_MOD
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <span>物品选择</span>
      <span class="hint">
        {{
          state.mode === 'recipes'
            ? '点击物品填入当前格子'
            : state.mode === 'custom'
              ? 'KubeIE 模组 = 自定义物品，点击可载入编辑'
              : state.mode === 'curios'
                ? 'KubeCurios 模组 = 自定义饰品（绿色），点击可载入编辑'
                : `${state.itemTotal} 项`
        }}
      </span>
    </div>

    <div class="filters">
      <el-input v-model="state.filters.keyword" placeholder="按物品 ID 或中文名称搜索" clearable>
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div class="filter-row">
        <el-select v-model="state.filters.mod" placeholder="全部模组" clearable size="default">
          <el-option label="全部模组" value="" />
          <el-option v-for="mod in state.facets.mods" :key="mod" :label="mod" :value="mod" />
        </el-select>

        <el-select v-model="state.filters.category" placeholder="全部类型" clearable size="default">
          <el-option label="全部类型" value="" />
          <el-option
            v-for="option in categoryOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>
    </div>

    <div class="panel-body item-list">
      <el-empty v-if="state.items.length === 0" description="没有匹配的物品" :image-size="70" />
      <div
        v-for="entry in state.items"
        :key="entry.id"
        class="item-row"
        :class="{ active: isActive(entry), 'item-row-curio': isCurio(entry) }"
        @click="handleSelect(entry)"
      >
        <div class="item-name">{{ entry.name }}</div>
        <div class="item-id mono">{{ entry.id }}</div>
      </div>
    </div>

    <div class="panel-footer manual-footer">
      <el-input
        v-model="manualId"
        size="small"
        placeholder="手动输入物品 ID"
        @keyup.enter="handleAddManual"
      />
      <el-button type="primary" size="small" :icon="Plus" @click="handleAddManual">添加</el-button>
    </div>
  </div>
</template>

<style scoped>
.filters {
  flex: none;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid #d9dee7;
}

.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.item-list {
  padding: 6px;
}

.item-row {
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1.4;
}

.item-row:hover {
  background: #eef1f6;
}

.item-row.active {
  background: #ecf5ff;
  outline: 1px solid #a0cfff;
}

/* 自定义饰品（KubeCurios）：始终保留绿色填充与边框高亮 */
.item-row-curio {
  background: #f0f9eb;
  border: 1px solid #b3e19d;
  border-radius: 6px;
}

.item-row-curio:hover {
  background: #e7f5dd;
}

.item-row-curio.active {
  background: #e1f3d8;
  outline: 1px solid #67c23a;
  border-color: #67c23a;
}

.item-name {
  font-size: 13px;
}

.item-id {
  font-size: 11.5px;
  color: #5b6472;
}

.manual-footer {
  align-items: center;
}
</style>
