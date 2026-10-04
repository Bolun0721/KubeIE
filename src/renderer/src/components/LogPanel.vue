<script setup lang="ts">
import { ArrowDown, ArrowUp, Delete } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

const { state } = useEditor()
</script>

<template>
  <div class="log-panel" :class="{ collapsed: !state.logVisible }">
    <div class="log-header" @click="state.logVisible = !state.logVisible">
      <span>操作日志（{{ state.logs.length }}）</span>
      <span class="log-header-actions">
        <el-button size="small" link :icon="Delete" @click.stop="state.logs = []">清空</el-button>
        <el-icon><ArrowDown v-if="state.logVisible" /><ArrowUp v-else /></el-icon>
      </span>
    </div>
    <div v-if="state.logVisible" class="log-body">
      <div v-if="state.logs.length === 0" class="hint">暂无日志</div>
      <div v-for="(entry, index) in state.logs" :key="index" class="log-item">
        <span class="log-time">{{ entry.time }}</span>
        <span :class="`log-${entry.level}`">{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-panel {
  border: 1px solid #ccd2dc;
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #fafafa;
}

.log-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-body {
  height: 140px;
  overflow: auto;
  padding: 8px 12px;
  border-top: 1px solid #d9dee7;
}
</style>
