<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

/**
 * 自定义物品脚本预览（物品自定义子界面中栏下）。
 * 结构对齐配方脚本预览：错误 / 警告 → 目标路径 + 复制 → 代码块。
 */
const { state, refreshCustomPreview } = useEditor()

const fileName = computed(() => state.config?.customFileName || 'custom_items.js')

async function copyText(): Promise<void> {
  await navigator.clipboard.writeText(state.customPreview)
  ElMessage.success('脚本已复制到剪贴板')
}
</script>

<template>
  <div class="panel preview-panel">
    <div class="panel-header">
      <span>自定义物品脚本预览</span>
      <span class="preview-actions">
        <el-tag size="small" type="info" effect="plain">{{ fileName }}</el-tag>
        <el-button size="small" link :icon="Refresh" @click="refreshCustomPreview">刷新</el-button>
      </span>
    </div>

    <div v-if="state.customErrors.length > 0" class="preview-alert">
      <el-alert type="error" :closable="false" title="存在错误，无法写入：">
        <ul class="validation-list">
          <li v-for="error in state.customErrors" :key="error">{{ error }}</li>
        </ul>
      </el-alert>
    </div>
    <div v-else-if="state.customWarnings.length > 0" class="preview-alert">
      <el-alert type="warning" :closable="false" title="提示（不影响写入）：">
        <ul class="validation-list">
          <li v-for="warning in state.customWarnings" :key="warning">{{ warning }}</li>
        </ul>
      </el-alert>
    </div>

    <div class="preview-meta">
      <span class="hint mono ellipsis">
        {{ state.customTargetPath || state.location?.startupScriptsDir || '尚未确定 kubejs/startup_scripts 路径' }}
      </span>
      <el-button size="small" link @click="copyText">复制</el-button>
    </div>

    <div class="preview-body">
      <pre v-if="state.customPreview" class="code-block">{{ state.customPreview }}</pre>
      <div v-else class="empty-placeholder">物品库为空</div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-alert {
  padding: 8px 12px 0;
}

.validation-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
}

.preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
}

.ellipsis {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 12px 12px;
}

.code-block {
  margin: 0;
  padding: 10px;
  background: #f7f8fa;
  border: 1px solid #d9dee7;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
}

.empty-placeholder {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 12px;
}
</style>
