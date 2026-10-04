<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Delete, Edit, RefreshLeft } from '@element-plus/icons-vue'
import { summarizeRecipeEntry } from '@shared/recipes'
import { useEditor } from '../composables/useEditor'

/**
 * 配方队列：本次待写入的配方操作清单，点「应用修改」写入 kubejs/server_scripts/。
 * 结构与物品属性界的修改队列一致。
 */
const {
  state,
  editRecipeQueue,
  removeRecipeQueue,
  clearRecipeQueue,
  writeRecipes,
  openServerScriptsDir
} = useEditor()

/** 应用修改：写入前确认框 → 写入成功弹窗说明生效方式 */
async function handleWrite(): Promise<void> {
  const result = await writeRecipes()
  if (!result.ok) return

  try {
    await ElMessageBox.confirm(
      `<div>配方脚本已写入：<br/><span class="mono">${result.filePath ?? ''}</span></div>` +
        '<div style="margin-top:10px">生效方式：</div>' +
        '<div>游戏内执行 <span class="mono">/kubejs reload server_scripts</span> 或 <span class="mono">/reload</span>（无需重启游戏）</div>',
      '写入成功',
      {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '打开目录',
        cancelButtonText: '关闭',
        type: 'success'
      }
    )
    await openServerScriptsDir()
  } catch {
    // 用户选择关闭
  }
}

const statusTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  switch (state.status?.level) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'info'
  }
})

const statusTagText = computed(() => {
  switch (state.status?.level) {
    case 'success':
      return '成功'
    case 'warning':
      return '提示'
    case 'error':
      return '失败'
    default:
      return '信息'
  }
})
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <span>配方队列</span>
      <span class="hint">{{ state.recipeQueue.length }} 项</span>
    </div>

    <div class="panel-body queue-list">
      <el-empty v-if="state.recipeQueue.length === 0" description="队列为空" :image-size="70" />
      <div
        v-for="(entry, index) in state.recipeQueue"
        :key="entry.key"
        class="queue-item"
        :class="{ active: state.recipeEditingIndex === index }"
      >
        <div class="queue-head">
          <span class="queue-name">{{ entry.kind === 'add' ? '新建配方' : '删除配方' }}</span>
          <span class="queue-actions">
            <el-button size="small" link :icon="Edit" @click="editRecipeQueue(index)" />
            <el-button size="small" link type="danger" :icon="Delete" @click="removeRecipeQueue(index)" />
          </span>
        </div>
        <div class="tags">
          <el-tag
            v-for="tag in summarizeRecipeEntry(entry)"
            :key="tag"
            size="small"
            type="info"
            effect="plain"
          >
            {{ tag }}
          </el-tag>
        </div>
      </div>
    </div>

    <div v-if="state.status" class="status-line">
      <el-tag :type="statusTagType" size="small" effect="plain">{{ statusTagText }}</el-tag>
      <span class="status-text">{{ state.status.text }}</span>
    </div>

    <div class="panel-footer">
      <el-button :icon="RefreshLeft" :disabled="state.recipeQueue.length === 0" @click="clearRecipeQueue">
        清空
      </el-button>
      <el-button
        type="primary"
        class="grow"
        :loading="state.busy"
        :disabled="state.recipeQueue.length === 0"
        @click="handleWrite"
      >
        应用修改
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.queue-list {
  padding: 8px;
}

.queue-item {
  padding: 8px 10px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  margin-bottom: 8px;
}

.queue-item.active {
  border-color: #a0cfff;
  background: #ecf5ff;
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.queue-name {
  font-size: 13px;
  font-weight: 600;
}

.queue-actions {
  display: flex;
  gap: 2px;
  flex: none;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.grow {
  flex: 1;
}

.status-line {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid #d9dee7;
  background: #fafafa;
}

.status-text {
  font-size: 12px;
  line-height: 1.6;
  color: #4a5261;
  word-break: break-all;
}
</style>
