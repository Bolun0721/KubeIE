<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Delete, Edit, RefreshLeft } from '@element-plus/icons-vue'
import { summarizeProperties } from '@shared/properties'
import { useEditor } from '../composables/useEditor'

const { state, editQueue, removeQueue, clearQueue, writeScript, openPath, openFoodConfigDir } = useEditor()

/** 应用修改：写入前有确认框，写入成功后再弹窗说明生效方式（同时更新内联状态行与日志） */
async function handleWrite(): Promise<void> {
  const result = await writeScript()
  if (!result.ok) return

  const blocks: string[] = []
  const reloads: string[] = []
  if (result.filePath) {
    blocks.push(`<div>KubeJS 脚本已写入：<br/><span class="mono">${result.filePath}</span></div>`)
    reloads.push(
      '<div>KubeJS 脚本：首选<b>重启游戏</b>，或尝试 <span class="mono">/kubejs reload startup_scripts</span></div>'
    )
  }
  if (result.food) {
    blocks.push(
      `<div style="margin-top:${blocks.length > 0 ? '10px' : '0'}">FoodTweaker 配置已写入：<br/><span class="mono">${result.food.filePath}</span></div>`
    )
    reloads.push(
      '<div>FoodTweaker 配置：可在游戏内执行 <span class="mono">/foodtweaker reload</span> 立即生效，或重启游戏</div>'
    )
  }
  if (blocks.length === 0) return

  try {
    await ElMessageBox.confirm(
      `${blocks.join('')}<div style="margin-top:10px">生效方式：</div>${reloads.join('')}`,
      '写入成功',
      {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '打开目录',
        cancelButtonText: '关闭',
        type: 'success'
      }
    )
    if (result.filePath) await openPath(state.location?.startupScriptsDir ?? '')
    else await openFoodConfigDir()
  } catch {
    // 用户选择关闭
  }
}

/** 内联状态行的标签颜色 */
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
      <span>修改队列</span>
      <span class="hint">{{ state.queue.length }} 项</span>
    </div>

    <div class="panel-body queue-list">
      <el-empty v-if="state.queue.length === 0" description="队列为空" :image-size="70" />
      <div
        v-for="(entry, index) in state.queue"
        :key="`${entry.itemId}-${index}`"
        class="queue-item"
        :class="{ active: state.editingIndex === index }"
      >
        <div class="queue-head">
          <span class="queue-name">{{ entry.displayName }}</span>
          <span class="queue-actions">
            <el-button size="small" link :icon="Edit" @click="editQueue(index)" />
            <el-button size="small" link type="danger" :icon="Delete" @click="removeQueue(index)" />
          </span>
        </div>
        <div class="mono queue-id">{{ entry.itemId }}</div>
        <div class="tags">
          <el-tag
            v-for="tag in summarizeProperties(entry.properties)"
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
      <el-button :icon="RefreshLeft" :disabled="state.queue.length === 0" @click="clearQueue">清空</el-button>
      <el-button
        type="primary"
        class="grow"
        :loading="state.busy"
        :disabled="state.queue.length === 0"
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

.queue-id {
  font-size: 11.5px;
  color: #5b6472;
  margin-bottom: 6px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.grow {
  flex: 1;
}

/* 内联状态行：替代弹窗提示，显示最近一次操作结果 */
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
