<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus, Refresh } from '@element-plus/icons-vue'
import { CURIOS_SLOTS } from '@shared/curios'
import { useEditor } from '../composables/useEditor'

/**
 * Curios 栏位配置对话框：编辑 config/curios-common.toml 的 slots 数组。
 * 依据《Curios API 1.20.1 Forge 配置教程》：条目内部用英文分号分隔字段，
 * 写入时只替换文件中未被注释的 slots 赋值，其余内容（含官方注释）原样保留。
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const {
  state,
  curiosConfigValidation,
  refreshCuriosConfigPreview,
  addCuriosSlot,
  removeCuriosSlot,
  writeCuriosConfig
} = useEditor()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    emit('update:modelValue', value)
  }
})

const slots = computed(() => state.curiosConfigSlots)

const dropRuleOptions = [
  { label: 'DEFAULT（跟随全局）', value: 'DEFAULT' },
  { label: 'ALWAYS_DROP（始终掉落）', value: 'ALWAYS_DROP' },
  { label: 'ALWAYS_KEEP（始终保留）', value: 'ALWAYS_KEEP' },
  { label: 'DESTROY（销毁）', value: 'DESTROY' }
]

const operationOptions = [
  { label: 'SET（设为）', value: 'SET' },
  { label: 'ADD（增加）', value: 'ADD' },
  { label: 'REMOVE（减少）', value: 'REMOVE' }
]

async function handleApply(): Promise<void> {
  const result = await writeCuriosConfig()
  if (result.ok) await refreshCuriosConfigPreview()
}
</script>

<template>
  <el-dialog v-model="visible" title="Curios 栏位配置（config/curios-common.toml）" width="900px" append-to-body>
    <div class="config-form">
      <p class="hint note">
        栏位数量决定玩家能佩戴几个同类饰品；<b>id 必须是游戏内真实存在的栏位 ID</b>（乱写会创建出无法使用的栏位）。
        多人服务器请改服务端存档内的 <span class="mono">serverconfig/curios-server.toml</span>。
      </p>

      <div class="slot-head">
        <span class="section-title">栏位列表（{{ slots.length }}）</span>
        <span class="head-actions">
          <el-button size="small" :icon="Refresh" @click="refreshCuriosConfigPreview">刷新预览</el-button>
          <el-button size="small" :icon="Plus" @click="addCuriosSlot">添加栏位</el-button>
        </span>
      </div>

      <el-empty v-if="slots.length === 0" description="还没有栏位配置" :image-size="60" />

      <div v-for="(slot, index) in slots" :key="index" class="slot-row">
        <el-select
          v-model="slot.id"
          size="small"
          class="id-select"
          filterable
          allow-create
          default-first-option
          placeholder="栏位 ID"
        >
          <el-option v-for="slot in CURIOS_SLOTS" :key="slot.id" :label="slot.label" :value="slot.id" />
        </el-select>
        <el-input-number
          v-model="slot.size"
          size="small"
          :min="0"
          :max="48"
          controls-position="right"
          class="num-input"
        />
        <span class="hint unit">个</span>
        <el-select v-model="slot.operation" size="small" clearable placeholder="数量方式" class="op-select">
          <el-option
            v-for="option in operationOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-input-number
          v-model="slot.order"
          size="small"
          :min="0"
          :max="10000"
          controls-position="right"
          class="num-input"
        />
        <span class="hint unit">排序</span>
        <el-input v-model="slot.icon" size="small" placeholder="图标 minecraft:item/diamond" class="icon-input" />
        <el-select v-model="slot.dropRule" size="small" clearable placeholder="掉落规则" class="op-select">
          <el-option
            v-for="option in dropRuleOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-tooltip content="增加纯外观栏位" placement="top" :show-after="300">
          <el-checkbox v-model="slot.addCosmetic" size="small" :true-value="true" :false-value="false">
            外观位
          </el-checkbox>
        </el-tooltip>
        <el-button size="small" link type="danger" :icon="Delete" @click="removeCuriosSlot(index)" />
      </div>

      <div v-if="curiosConfigValidation.errors.length > 0" class="feedback error-text">
        {{ curiosConfigValidation.errors[0] }}
      </div>
      <div v-else-if="curiosConfigValidation.warnings.length > 0" class="feedback warn-text">
        {{ curiosConfigValidation.warnings[0] }}
      </div>

      <div class="section-title">配置预览</div>
      <div class="preview-meta">
        <span class="hint mono ellipsis">{{ state.curiosConfigTargetPath || '尚未确定 config 目录' }}</span>
        <el-tag v-if="state.curiosStatus && !state.curiosStatus.configExists" size="small" effect="plain">
          将新建文件
        </el-tag>
      </div>
      <pre class="code-block config-preview">{{ state.curiosConfigPreview }}</pre>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="state.busy" :disabled="slots.length === 0" @click="handleApply">
        应用栏位配置
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.config-form {
  max-height: 62vh;
  overflow: auto;
  padding-right: 4px;
}

.note {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.6;
}

.slot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0 6px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2733;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.id-select {
  width: 190px;
}

.num-input {
  width: 92px;
}

.op-select {
  width: 140px;
}

.icon-input {
  width: 190px;
}

.unit {
  font-size: 11px;
}

.feedback {
  margin-top: 6px;
  font-size: 12px;
}

.error-text {
  color: #f56c6c;
}

.warn-text {
  color: #e6a23c;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  min-width: 0;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.config-preview {
  max-height: 220px;
  overflow: auto;
}
</style>
