<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Delete, Edit, Remove } from '@element-plus/icons-vue'
import { customItemId, customItemKindInfo, summarizeCustomItem } from '@shared/customItems'
import { useEditor } from '../composables/useEditor'

/**
 * 自定义物品库面板（物品自定义子界面右栏）：
 * 列出库中已保存的物品定义，可编辑 / 移出物品库 / 从物品列表移除，
 * 底部「应用修改」写入 startup_scripts 脚本。
 */
const {
  state,
  editCustomItem,
  removeCustomItem,
  removeCreatedItem,
  clearCustomItems,
  writeCustomItems,
  openPath
} = useEditor()

const items = computed(() => state.customLibrary.items)
const tierCount = computed(
  () => state.customLibrary.toolTiers.length + state.customLibrary.armorTiers.length
)

/** 物品列表中已创建物品的 ID 集合（用于标记「是否仍在物品列表」） */
const createdIds = computed(
  () => new Set(state.customLibrary.created.map((item) => customItemId(item)))
)

function inItemList(def: { name: string; namespace: string }): boolean {
  return createdIds.value.has(customItemId(def))
}

/** 应用修改：写入前确认，写入成功后弹窗说明生效方式（并更新内联状态行与日志） */
async function handleWrite(): Promise<void> {
  const result = await writeCustomItems()
  if (!result.ok || !result.filePath) return

  const blocks = `<div>自定义物品脚本已写入：<br/><span class="mono">${result.filePath}</span></div>`
  const reloads = '<div>生效方式：必须<b>重启游戏</b>（物品注册属于启动阶段，reload 不保证生效）</div>'

  try {
    await ElMessageBox.confirm(
      `${blocks}<div style="margin-top:10px">生效方式：</div>${reloads}`,
      '写入成功',
      {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '打开目录',
        cancelButtonText: '关闭',
        type: 'success'
      }
    )
    await openPath(state.location?.startupScriptsDir ?? '')
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
      <span>自定义物品库</span>
      <span class="hint">
        {{ items.length }} 个物品{{ tierCount > 0 ? ` · ${tierCount} 个自定义等级` : '' }} · 列表
        {{ state.customLibrary.created.length }} 项
      </span>
    </div>

    <div class="panel-body queue-list">
      <el-empty v-if="items.length === 0" description="还没有自定义物品" :image-size="70" />
      <div
        v-for="(def, index) in items"
        :key="customItemId(def)"
        class="queue-item"
        :class="{ active: state.customEditingIndex === index }"
      >
        <div class="queue-head">
          <span class="queue-name">{{ def.displayName || def.name }}</span>
          <span class="queue-actions">
            <el-tooltip content="编辑" placement="top" :show-after="300">
              <el-button size="small" link :icon="Edit" @click="editCustomItem(index)" />
            </el-tooltip>
            <el-tooltip content="移出物品库（物品列表中仍保留）" placement="top" :show-after="300">
              <el-button size="small" link :icon="Remove" @click="removeCustomItem(index)" />
            </el-tooltip>
            <el-tooltip content="从物品列表移除" placement="top" :show-after="300">
              <el-button
                size="small"
                link
                type="danger"
                :icon="Delete"
                @click="removeCreatedItem(customItemId(def))"
              />
            </el-tooltip>
          </span>
        </div>
        <div class="mono queue-id">{{ customItemId(def) }}</div>
        <div class="tags">
          <el-tag
            v-for="tag in summarizeCustomItem(def)"
            :key="tag"
            size="small"
            type="info"
            effect="plain"
          >
            {{ tag }}
          </el-tag>
        </div>
        <div class="hint kind-hint">
          {{ customItemKindInfo(def.kind).label }}
          <el-tag v-if="!inItemList(def)" size="small" type="warning" effect="plain">
            已从物品列表移除
          </el-tag>
        </div>
      </div>
    </div>

    <div v-if="state.status" class="status-line">
      <el-tag :type="statusTagType" size="small" effect="plain">{{ statusTagText }}</el-tag>
      <span class="status-text">{{ state.status.text }}</span>
    </div>

    <div class="panel-footer">
      <el-button size="small" :disabled="items.length === 0" @click="clearCustomItems">清空</el-button>
      <el-button
        size="small"
        type="primary"
        :loading="state.busy"
        :disabled="items.length === 0"
        @click="handleWrite"
      >
        应用修改
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 自定义物品卡片：始终保留背景填充与边框高亮，选中的一张边框加重 */
.queue-item {
  border: 1px solid #c6e2ff;
  border-radius: 4px;
  padding: 6px 8px;
  background: #f5faff;
}

.queue-item.active {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #b3d8ff;
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.queue-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-actions {
  flex: none;
}

.queue-id {
  font-size: 11px;
  color: #5b6472;
  margin-top: 2px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.kind-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-top: 1px solid #f2f6fc;
}

.status-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #4a5261;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
