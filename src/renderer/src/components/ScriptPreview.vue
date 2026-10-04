<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Refresh } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

/**
 * 预览区：KubeJS 脚本（通用 / 工具属性）与 FoodTweaker 配置（食物属性）分页展示。
 * 两者写入的目标文件不同，因此分别预览、分别复制。
 */
const { state, refreshPreview, activeProfile } = useEditor()

const activeTab = ref<'script' | 'food'>('script')

/** 当前自定义的脚本文件名（顶部「脚本名」输入框可改） */
const scriptFileName = computed(() => state.config?.outputFileName || 'item_modifications.js')

async function copyText(kind: 'script' | 'food', content: string): Promise<void> {
  if (!content) return
  await navigator.clipboard.writeText(content)
  ElMessage.success(kind === 'script' ? '已复制 KubeJS 脚本' : '已复制 FoodTweaker 配置')
}
</script>

<template>
  <div class="panel preview-panel">
    <div class="panel-header">
      <span>预览</span>
      <span class="preview-actions">
        <span class="hint">{{ activeProfile.label }}</span>
        <el-button size="small" :icon="Refresh" @click="refreshPreview">刷新</el-button>
      </span>
    </div>

    <div v-if="state.previewErrors.length > 0" class="preview-alert">
      <el-alert type="error" :closable="false" show-icon title="存在校验错误，无法写入">
        <ul class="validation-list">
          <li v-for="error in state.previewErrors" :key="error">{{ error }}</li>
        </ul>
      </el-alert>
    </div>

    <el-tabs v-model="activeTab" class="preview-tabs">
      <el-tab-pane label="KubeJS 脚本" name="script">
        <div class="preview-meta">
          <span class="hint mono ellipsis">{{ state.location?.startupScriptsDir }}</span>
          <span class="preview-meta-actions">
            <el-tag size="small" type="info" effect="plain">{{ scriptFileName }}</el-tag>
            <el-button
              size="small"
              :icon="CopyDocument"
              :disabled="!state.preview"
              @click="copyText('script', state.preview)"
            >
              复制
            </el-button>
          </span>
        </div>
        <div class="preview-body">
          <pre v-if="state.preview" class="code-block">{{ state.preview }}</pre>
          <div v-else class="empty-placeholder">队列中没有 KubeJS 脚本修改</div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="food">
        <template #label>
          <span class="tab-label">
            FoodTweaker 配置
            <el-badge v-if="state.foodPreview" is-dot class="tab-badge" />
          </span>
        </template>

        <div v-if="state.foodWarnings.length > 0" class="food-warnings">
          <el-alert type="warning" :closable="false" show-icon title="食物配置提示">
            <ul class="validation-list">
              <li v-for="warning in state.foodWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </el-alert>
        </div>

        <div class="preview-meta">
          <span class="hint mono ellipsis">
            {{ state.foodTargetPath || state.foodStatus?.configPath || '尚未确定 config/foodtweaker.json 路径' }}
          </span>
          <el-button
            size="small"
            :icon="CopyDocument"
            :disabled="!state.foodPreview"
            @click="copyText('food', state.foodPreview)"
          >
            复制
          </el-button>
        </div>
        <div class="preview-body">
          <pre v-if="state.foodPreview" class="code-block">{{ state.foodPreview }}</pre>
          <div v-else class="empty-placeholder">队列中没有食物修改</div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.preview-panel {
  min-height: 0;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-alert {
  padding: 8px 12px 0;
}

.preview-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 12px;
}

.preview-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
  flex: none;
}

.preview-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.preview-tabs :deep(.el-tab-pane) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tab-badge {
  margin-top: -2px;
}

.food-warnings {
  padding-bottom: 8px;
}

.preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 6px;
  flex: none;
}

.preview-meta-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  padding-bottom: 12px;
}

.validation-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
</style>
