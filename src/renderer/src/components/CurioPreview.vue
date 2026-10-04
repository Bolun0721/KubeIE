<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

/**
 * 自定义饰品脚本预览（饰品自定义子界面中栏下）。
 * 「饰品脚本」写入 kubejs/startup_scripts/（需重启游戏生效）；
 * 「事件脚本」写入 kubejs/server_scripts/（击杀 / 受伤 / 破坏方块等服务端事件卡）；
 * Curios 栏位配置写入 config/curios-common.toml。
 */
const { state, refreshCuriosPreview, openCuriosConfig } = useEditor()

/** 预览标签页：饰品本体脚本 / 服务端事件伴随脚本 */
const tab = ref<'item' | 'events'>('item')

const itemFileName = computed(() => state.config?.curioFileName || 'curios_trinkets.js')
const eventFileName = computed(() => itemFileName.value.replace(/\.js$/i, '') + '_events.js')

const fileName = computed(() => (tab.value === 'events' ? eventFileName.value : itemFileName.value))
const code = computed(() => (tab.value === 'events' ? state.curioEventPreview : state.curioPreview))
const targetPath = computed(() => (tab.value === 'events' ? state.curioEventTargetPath : state.curioTargetPath))
const fallbackDir = computed(() =>
  tab.value === 'events'
    ? state.location?.serverScriptsDir || '尚未确定 kubejs/server_scripts 路径'
    : state.location?.startupScriptsDir || '尚未确定 kubejs/startup_scripts 路径'
)

async function copyText(): Promise<void> {
  await navigator.clipboard.writeText(code.value)
  ElMessage.success('脚本已复制到剪贴板')
}
</script>

<template>
  <div class="panel preview-panel">
    <div class="panel-header">
      <span>自定义饰品脚本预览</span>
      <span class="preview-actions">
        <el-radio-group v-model="tab" size="small">
          <el-radio-button label="item">饰品脚本</el-radio-button>
          <el-radio-button label="events">事件脚本</el-radio-button>
        </el-radio-group>
        <el-tag size="small" type="info" effect="plain">{{ fileName }}</el-tag>
        <el-button size="small" link @click="openCuriosConfig">栏位配置</el-button>
        <el-button size="small" link :icon="Refresh" @click="refreshCuriosPreview">刷新</el-button>
      </span>
    </div>

    <div v-if="tab === 'item' && state.curioErrors.length > 0" class="preview-alert">
      <el-alert type="error" :closable="false" title="存在错误，无法写入：">
        <ul class="validation-list">
          <li v-for="error in state.curioErrors" :key="error">{{ error }}</li>
        </ul>
      </el-alert>
    </div>
    <div v-else-if="tab === 'item' && state.curioWarnings.length > 0" class="preview-alert">
      <el-alert type="warning" :closable="false" title="提示（不影响写入）：">
        <ul class="validation-list">
          <li v-for="warning in state.curioWarnings" :key="warning">{{ warning }}</li>
        </ul>
      </el-alert>
    </div>

    <div class="preview-meta">
      <span class="hint mono ellipsis">{{ targetPath || fallbackDir }}</span>
      <span class="hint mono">栏位配置：config/curios-common.toml</span>
      <el-button size="small" link @click="copyText">复制</el-button>
    </div>

    <div class="preview-body">
      <pre v-if="code" class="code-block">{{ code }}</pre>
      <div v-else class="empty-placeholder">饰品库为空</div>
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

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid #f2f6fc;
  min-width: 0;
}

.ellipsis {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.empty-placeholder {
  padding: 20px;
  text-align: center;
  color: #5b6472;
  font-size: 12px;
}
</style>
