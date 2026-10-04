<script setup lang="ts">
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

/**
 * 自定义饰品记录界面：展示每次「应用修改」写入饰品脚本的卡片，按所属脚本名称分组。
 * 记录文件为数据目录下 KieJS/curio-records.json，结构与「编辑记录」一致。
 */
const { state, curioRecordGroups, clearCurioRecords } = useEditor()

const visible = computed({
  get: () => state.curioRecordsVisible,
  set: (value: boolean) => {
    state.curioRecordsVisible = value
  }
})

/** ISO 时间 → 本地可读时间 */
function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`
}
</script>

<template>
  <el-drawer v-model="visible" class="records-drawer" size="560px" :with-header="false">
    <div class="panel records-panel">
      <div class="panel-header">
        <span>编辑记录</span>
        <span class="hint">{{ state.curioRecords.length }} 条 · 按所属脚本名称分组</span>
      </div>

      <div v-if="state.dataInfo" class="record-dir-strip">
        <span class="hint">记录文件：</span>
        <span class="hint mono ellipsis" :title="state.dataInfo.recordDir">
          {{ state.dataInfo.recordDir }}
        </span>
        <el-tag v-if="state.dataInfo.portable" size="small" type="success" effect="plain">便携模式</el-tag>
      </div>

      <div class="panel-body records-body">
        <el-empty
          v-if="curioRecordGroups.length === 0"
          description="暂无编辑记录，写入一次饰品脚本后会自动记录"
          :image-size="70"
        />

        <section v-for="group in curioRecordGroups" :key="group.scriptName" class="record-group">
          <div class="group-head">
            <span class="mono group-name">{{ group.scriptName }}</span>
            <span class="group-meta">
              <el-tag size="small" type="success" effect="plain">自定义饰品脚本</el-tag>
              <span class="hint">{{ group.records.length }} 项</span>
            </span>
          </div>
          <div class="hint mono group-path" :title="group.filePath">{{ group.filePath }}</div>

          <div v-for="record in group.records" :key="record.id" class="record-card">
            <div class="record-head">
              <span class="record-name">{{ record.displayName }}</span>
              <span class="hint">{{ formatTime(record.at) }}</span>
            </div>
            <div class="record-meta">
              <span class="mono record-id">{{ record.itemId }}</span>
              <el-tag v-if="record.slotLabel" size="small" effect="plain">{{ record.slotLabel }}</el-tag>
            </div>
            <div class="tags">
              <el-tag
                v-for="tag in record.summary"
                :key="tag"
                size="small"
                type="info"
                effect="plain"
              >
                {{ tag }}
              </el-tag>
            </div>
          </div>
        </section>
      </div>

      <div class="panel-footer">
        <el-button :icon="Delete" :disabled="state.curioRecords.length === 0" @click="clearCurioRecords">
          清空记录
        </el-button>
        <el-button class="grow" @click="visible = false">关闭</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.records-panel {
  height: 100%;
  border: none;
  border-radius: 0;
}

.records-body {
  padding: 12px;
}

/* 记录文件所在目录：便于用户直接找到文件 */
.record-dir-strip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #fafafa;
  border-bottom: 1px solid #f2f6fc;
  min-width: 0;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.record-group {
  margin-bottom: 16px;
}

.record-group:last-child {
  margin-bottom: 0;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.group-name {
  font-size: 13px;
  font-weight: 600;
}

.group-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.group-path {
  margin: 2px 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-card {
  padding: 8px 10px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  margin-bottom: 8px;
  background: #fff;
}

.record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.record-name {
  font-size: 13px;
  font-weight: 600;
}

.record-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.record-id {
  font-size: 11.5px;
  color: #5b6472;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.grow {
  flex: 1;
}
</style>
