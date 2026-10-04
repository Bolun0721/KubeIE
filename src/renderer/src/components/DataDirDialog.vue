<script setup lang="ts">
import { computed, ref } from 'vue'
import { FolderOpened, Refresh } from '@element-plus/icons-vue'
import { useEditor } from '../composables/useEditor'

/**
 * 数据目录对话框：展示配置与写入记录的实际位置，并提供便携模式开关。
 * 便携模式只通过创建/删除 exe 同目录的 portable.txt 来切换，**重启后生效**。
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { state, setPortable, relaunchApp, openPath } = useEditor()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const info = computed(() => state.dataInfo)
const switching = ref(false)

/** 标记状态与已生效状态不一致 → 需要重启才生效 */
const restartRequired = computed(
  () => !!info.value && info.value.markerExists !== info.value.portable
)

/** 重启后的效果说明（开启 / 关闭方向不同，关闭时提醒记录需手动搬回） */
const restartHint = computed(() => {
  if (!info.value) return ''
  return info.value.markerExists
    ? `重启后数据目录变为 ${info.value.portableDir}，现有配置与记录会自动复制过去（原文件保留）。`
    : `重启后软件回到用户数据目录 ${info.value.dataDir}；${info.value.portableDir} 里的记录不会自动搬回，如需保留请先手动拷贝。`
})

/** 开关以标记文件是否存在为准（而非已生效状态） */
const portableSwitch = computed({
  get: () => info.value?.markerExists ?? false,
  set: (value: boolean) => {
    void toggle(value)
  }
})

async function toggle(enabled: boolean): Promise<void> {
  if (switching.value) return
  switching.value = true
  try {
    await setPortable(enabled)
  } finally {
    switching.value = false
  }
}

async function openDataDir(): Promise<void> {
  if (info.value) await openPath(info.value.dataDir)
}
</script>

<template>
  <el-dialog v-model="visible" title="数据目录" width="580px" append-to-body>
    <div v-if="info" class="data-dir">
      <div class="row">
        <span class="label">当前数据目录</span>
        <el-button size="small" :icon="FolderOpened" @click="openDataDir">打开目录</el-button>
      </div>
      <div class="mono path" :title="info.dataDir">{{ info.dataDir }}</div>
      <p class="hint">
        软件设置（config.json）与写入记录（KieJS\）都保存在这里；游戏脚本与配置仍写在游戏目录。
      </p>

      <el-divider />

      <div class="row">
        <span class="label">便携模式（数据保存在程序目录）</span>
        <el-switch
          v-model="portableSwitch"
          :disabled="!info.toggleAvailable || switching"
          :loading="switching"
        />
      </div>
      <p class="hint">
        开启后数据目录变为 <span class="mono">{{ info.portableDir }}</span>，可把整个程序目录拷到 U 盘使用；
        首次启用会自动把现有配置与记录<b>复制</b>过去（原文件保留）。
      </p>
      <p class="hint">标记文件：<span class="mono">{{ info.markerPath }}</span></p>

      <el-alert
        v-if="!info.toggleAvailable"
        type="warning"
        :closable="false"
        show-icon
        :title="info.toggleReason"
      />
      <el-alert
        v-else-if="restartRequired"
        class="mt"
        type="info"
        :closable="false"
        show-icon
        title="已修改，需重启软件后生效"
        :description="restartHint"
      />
      <el-alert
        v-if="info.fallbackReason"
        class="mt"
        type="warning"
        :closable="false"
        show-icon
        :title="info.fallbackReason"
      />
    </div>

    <template #footer>
      <el-button size="small" :icon="Refresh" :disabled="!restartRequired" @click="relaunchApp">
        立即重启
      </el-button>
      <el-button size="small" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.data-dir {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.label {
  font-size: 13px;
  font-weight: 600;
}

.path {
  padding: 6px 8px;
  background: #eef1f6;
  border-radius: 4px;
  font-size: 12px;
  word-break: break-all;
}

.mt {
  margin-top: 8px;
}
</style>
