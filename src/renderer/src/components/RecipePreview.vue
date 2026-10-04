<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Refresh } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

/**
 * 配方脚本预览：结构对齐物品属性界的脚本预览区（面板头 + 路径 + 代码）。
 * 与物品属性脚本的区别：配方脚本写入 kubejs/server_scripts/，可用 /kubejs reload server_scripts 热重载。
 */
const { state, refreshRecipePreview } = useEditor()

const recipeFileName = computed(() => state.config?.recipeFileName || 'recipes.js')

async function copyText(): Promise<void> {
  if (!state.recipePreview) return
  await navigator.clipboard.writeText(state.recipePreview)
  ElMessage.success('已复制配方脚本')
}
</script>

<template>
  <div class="panel preview-panel">
    <div class="panel-header">
      <span>配方脚本预览</span>
      <span class="preview-actions">
        <el-tag size="small" type="info" effect="plain">{{ recipeFileName }}</el-tag>
        <el-button size="small" :icon="Refresh" @click="refreshRecipePreview">刷新</el-button>
      </span>
    </div>

    <div v-if="state.recipeErrors.length > 0" class="preview-alert">
      <el-alert type="error" :closable="false" show-icon title="存在校验错误，无法写入">
        <ul class="validation-list">
          <li v-for="error in state.recipeErrors" :key="error">{{ error }}</li>
        </ul>
      </el-alert>
    </div>

    <div v-if="state.recipeWarnings.length > 0" class="preview-alert">
      <el-alert type="warning" :closable="false" show-icon title="配方提示">
        <ul class="validation-list">
          <li v-for="warning in state.recipeWarnings" :key="warning">{{ warning }}</li>
        </ul>
      </el-alert>
    </div>

    <div class="preview-meta">
      <span class="hint mono ellipsis">
        {{ state.recipeTargetPath || state.location?.serverScriptsDir || '尚未确定 kubejs/server_scripts 路径' }}
      </span>
      <el-button
        size="small"
        :icon="CopyDocument"
        :disabled="!state.recipePreview"
        @click="copyText"
      >
        复制
      </el-button>
    </div>

    <div class="preview-body">
      <pre v-if="state.recipePreview" class="code-block">{{ state.recipePreview }}</pre>
      <div v-else class="empty-placeholder">配方队列为空</div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-alert {
  padding: 8px 12px 0;
  flex: none;
}

.preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 6px;
  flex: none;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0 12px 12px;
}

.validation-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
</style>
