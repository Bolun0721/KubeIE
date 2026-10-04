<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpened, Reading, Setting, Tickets, VideoPlay } from '@element-plus/icons-vue'
import { KUBEJS_PROFILES } from '@shared/profiles'
import type { EditorMode, KubeJsProfileId } from '@shared/types'
import { sanitizeScriptFileName } from '@shared/validation'
import DataDirDialog from './DataDirDialog.vue'
import CustomItemEditor from './CustomItemEditor.vue'
import CustomLibraryPanel from './CustomLibraryPanel.vue'
import CustomPreview from './CustomPreview.vue'
import CustomRecords from './CustomRecords.vue'
import CurioEditor from './CurioEditor.vue'
import CurioLibraryPanel from './CurioLibraryPanel.vue'
import CurioPreview from './CurioPreview.vue'
import CurioRecords from './CurioRecords.vue'
import EditRecords from './EditRecords.vue'
import ItemBrowser from './ItemBrowser.vue'
import LogPanel from './LogPanel.vue'
import PropertyEditor from './PropertyEditor.vue'
import QueuePanel from './QueuePanel.vue'
import RecipeEditor from './RecipeEditor.vue'
import RecipePreview from './RecipePreview.vue'
import RecipeQueuePanel from './RecipeQueuePanel.vue'
import RecipeRecords from './RecipeRecords.vue'
import ScriptPreview from './ScriptPreview.vue'
import { useEditor } from '../composables/useEditor'

const {
  state,
  activeProfile,
  applyConfigPatch,
  changeProfile,
  openPath,
  openManual,
  openFoodConfigDir,
  openRecords,
  openRecipeRecords,
  openCustomRecords,
  openCurioRecords,
  openServerScriptsDir,
  switchMode,
  refreshRecipePreview,
  refreshCustomPreview,
  refreshCuriosPreview,
  loadDataInfo,
  backToSetup
} = useEditor()

const DEFAULT_SCRIPT_NAME = 'item_modifications.js'
const DEFAULT_RECIPE_NAME = 'recipes.js'
const DEFAULT_CUSTOM_NAME = 'custom_items.js'
const DEFAULT_CURIO_NAME = 'curios_trinkets.js'

/** 开发者 B 站主页 */
const BILIBILI_URL = 'https://space.bilibili.com/525703803?spm_id_from=333.1007.0.0'

/** 打开开发者 B 站主页（主进程会交给系统浏览器打开） */
function openBilibili(): void {
  window.open(BILIBILI_URL, '_blank', 'noopener')
}

/* ------------------------------------------------------------------ */
/* 可拉伸布局（类似 VSCode）：左右栏宽度 / 中间上下比例 / 日志栏高度      */
/* ------------------------------------------------------------------ */

const LEFT_MIN = 220
const LEFT_MAX = 560
const RIGHT_MIN = 240
const RIGHT_MAX = 620
const LOG_MIN = 60
const LOG_MAX = 460

const leftWidth = ref(320)
const rightWidth = ref(320)
/** 中间列上半部分（编辑区）占比 */
const centerRatio = ref(0.56)
const logHeight = ref(150)

const centerStyle = computed(() => ({
  gridTemplateRows: `minmax(0, ${centerRatio.value}fr) 10px minmax(0, ${1 - centerRatio.value}fr)`
}))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type DragKind = 'left' | 'right' | 'center' | 'log'

/** 拖动分隔条调整尺寸（pointer 事件，松手即解绑） */
function startDrag(kind: DragKind, event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startY = event.clientY
  const startLeft = leftWidth.value
  const startRight = rightWidth.value
  const startRatio = centerRatio.value
  const startLog = logHeight.value
  const centerHeight = (event.currentTarget as HTMLElement | null)?.parentElement?.clientHeight ?? 1

  const onMove = (moveEvent: PointerEvent): void => {
    const dx = moveEvent.clientX - startX
    const dy = moveEvent.clientY - startY
    if (kind === 'left') leftWidth.value = clamp(startLeft + dx, LEFT_MIN, LEFT_MAX)
    else if (kind === 'right') rightWidth.value = clamp(startRight - dx, RIGHT_MIN, RIGHT_MAX)
    else if (kind === 'center') centerRatio.value = clamp(startRatio + dy / centerHeight, 0.2, 0.85)
    else logHeight.value = clamp(startLog - dy, LOG_MIN, LOG_MAX)
  }

  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = kind === 'left' || kind === 'right' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/**
 * 子界面切换：物品属性 / 物品配方 / 物品自定义 / 自定义饰品。
 * 饰品界面通过「物品自定义」里的图标进入，因此高亮仍停在「物品自定义」页签上。
 */
const mode = computed<EditorMode>({
  get: () => (state.mode === 'curios' ? 'custom' : state.mode),
  set: (value) => switchMode(value)
})

const profileId = computed<KubeJsProfileId>({
  get: () => state.config?.profileId ?? activeProfile.value.id,
  set: (value) => {
    void changeProfile(value)
  }
})

const backupEnabled = computed<boolean>({
  get: () => state.config?.backupEnabled ?? true,
  set: (value) => {
    void applyConfigPatch({ backupEnabled: value })
  }
})

/** 生成的 KubeJS 脚本文件名（可自定义，需以 .js 结尾） */
const fileNameDraft = ref(state.config?.outputFileName || DEFAULT_SCRIPT_NAME)

watch(
  () => state.config?.outputFileName,
  (value) => {
    if (typeof value === 'string' && value) fileNameDraft.value = value
  }
)

/** 配方脚本文件名（写入 kubejs/server_scripts/） */
const recipeFileNameDraft = ref(state.config?.recipeFileName || DEFAULT_RECIPE_NAME)

watch(
  () => state.config?.recipeFileName,
  (value) => {
    if (typeof value === 'string' && value) recipeFileNameDraft.value = value
  }
)

/** 提交前校验并规范化文件名，非法时回退到上一次的有效值 */
function commitFileName(): void {
  const raw = fileNameDraft.value.trim()
  const safe = sanitizeScriptFileName(raw)

  if (!safe) {
    ElMessage.warning('脚本文件名非法：仅允许字母、数字、下划线、中划线与点，且必须以 .js 结尾')
    fileNameDraft.value = state.config?.outputFileName || DEFAULT_SCRIPT_NAME
    return
  }
  if (safe !== raw) {
    ElMessage.info(`文件名已规范化：${safe}`)
    fileNameDraft.value = safe
  }
  if (safe !== state.config?.outputFileName) {
    void applyConfigPatch({ outputFileName: safe })
  }
}

/** 配方脚本文件名（写入 kubejs/server_scripts/） */
async function commitRecipeFileName(): Promise<void> {
  const raw = recipeFileNameDraft.value.trim()
  const safe = sanitizeScriptFileName(raw)

  if (!safe) {
    ElMessage.warning('配方脚本名非法：仅允许字母、数字、下划线、中划线与点，且必须以 .js 结尾')
    recipeFileNameDraft.value = state.config?.recipeFileName || DEFAULT_RECIPE_NAME
    return
  }
  if (safe !== raw) {
    ElMessage.info(`文件名已规范化：${safe}`)
    recipeFileNameDraft.value = safe
  }
  if (safe !== state.config?.recipeFileName) {
    await applyConfigPatch({ recipeFileName: safe })
  }
  await refreshRecipePreview()
}

/** 自定义物品脚本文件名（写入 kubejs/startup_scripts/） */
const customFileNameDraft = ref(state.config?.customFileName || DEFAULT_CUSTOM_NAME)

watch(
  () => state.config?.customFileName,
  (value) => {
    if (typeof value === 'string' && value) customFileNameDraft.value = value
  }
)

/** 自定义物品脚本文件名（写入 kubejs/startup_scripts/） */
async function commitCustomFileName(): Promise<void> {
  const raw = customFileNameDraft.value.trim()
  const safe = sanitizeScriptFileName(raw)

  if (!safe) {
    ElMessage.warning('自定义物品脚本名非法：仅允许字母、数字、下划线、中划线与点，且必须以 .js 结尾')
    customFileNameDraft.value = state.config?.customFileName || DEFAULT_CUSTOM_NAME
    return
  }
  if (safe !== raw) {
    ElMessage.info(`文件名已规范化：${safe}`)
    customFileNameDraft.value = safe
  }
  if (safe !== state.config?.customFileName) {
    await applyConfigPatch({ customFileName: safe })
  }
  await refreshCustomPreview()
}

/** 自定义饰品脚本文件名（写入 kubejs/startup_scripts/） */
const curioFileNameDraft = ref(state.config?.curioFileName || DEFAULT_CURIO_NAME)

watch(
  () => state.config?.curioFileName,
  (value) => {
    if (typeof value === 'string' && value) curioFileNameDraft.value = value
  }
)

/** 自定义饰品脚本文件名（写入 kubejs/startup_scripts/） */
async function commitCurioFileName(): Promise<void> {
  const raw = curioFileNameDraft.value.trim()
  const safe = sanitizeScriptFileName(raw)

  if (!safe) {
    ElMessage.warning('饰品脚本名非法：仅允许字母、数字、下划线、中划线与点，且必须以 .js 结尾')
    curioFileNameDraft.value = state.config?.curioFileName || DEFAULT_CURIO_NAME
    return
  }
  if (safe !== raw) {
    ElMessage.info(`文件名已规范化：${safe}`)
    curioFileNameDraft.value = safe
  }
  if (safe !== state.config?.curioFileName) {
    await applyConfigPatch({ curioFileName: safe })
  }
  await refreshCuriosPreview()
}

/** 脚本目录按钮：物品属性 / 自定义物品 / 自定义饰品子界面打开 startup_scripts，配方子界面打开 server_scripts */
function openScriptsDir(): void {
  if (state.mode === 'recipes') {
    void openServerScriptsDir()
    return
  }
  const target = state.location?.startupScriptsDir
  if (target) void openPath(target)
}

/** 数据目录对话框（含便携模式开关）：打开前刷新一次实际状态 */
const dataDirVisible = ref(false)

async function openDataDirDialog(): Promise<void> {
  await loadDataInfo()
  dataDirVisible.value = true
}
</script>

<template>
  <div class="workspace">
    <header class="app-header">
      <div class="header-left">
        <div class="app-title">KubeIE</div>
        <div class="header-meta">
          <el-tag v-if="state.config?.mcVersion" size="small" type="success">
            MC {{ state.config.mcVersion }}
          </el-tag>
          <el-tag v-if="state.location?.kubejsJar" size="small" type="info">
            {{ state.location.kubejsJar }}
          </el-tag>
          <el-tag v-if="state.foodStatus?.modInstalled" size="small" type="success">
            {{ state.foodStatus.modJar }}
          </el-tag>
          <el-tag v-else-if="state.foodStatus" size="small" type="warning">未检测到 FoodTweaker</el-tag>
          <span class="hint mono ellipsis">{{ state.location?.startupScriptsDir }}</span>
        </div>
      </div>

      <div class="header-right">
        <el-radio-group v-model="mode" size="small">
          <el-radio-button value="items">物品属性</el-radio-button>
          <el-radio-button value="recipes">物品配方</el-radio-button>
          <el-radio-button value="custom">物品自定义</el-radio-button>
        </el-radio-group>

        <template v-if="state.mode === 'items'">
          <el-tooltip :content="activeProfile.notes" placement="bottom-end" :show-after="300">
            <el-select v-model="profileId" size="small" class="profile-select">
              <el-option
                v-for="profile in KUBEJS_PROFILES"
                :key="profile.id"
                :label="profile.label"
                :value="profile.id"
              />
            </el-select>
          </el-tooltip>

          <el-tooltip
            content="自定义生成的 KubeJS 脚本文件名（写入 kubejs/startup_scripts/KubeIE/attributes/ 下），需以 .js 结尾；食物配置文件名固定为 config/foodtweaker.json"
            placement="bottom-end"
            :show-after="300"
          >
            <span class="file-name-group">
              <span class="hint">脚本名</span>
              <el-input
                v-model="fileNameDraft"
                size="small"
                class="file-name-input"
                placeholder="item_modifications.js"
                @change="commitFileName"
                @keyup.enter="commitFileName"
              />
            </span>
          </el-tooltip>
        </template>

        <el-tooltip
          v-else-if="state.mode === 'recipes'"
          content="配方脚本文件名（写入 kubejs/server_scripts/KubeIE/recipes/ 下），需以 .js 结尾；生效方式 /kubejs reload server_scripts 或 /reload"
          placement="bottom-end"
          :show-after="300"
        >
          <span class="file-name-group">
            <span class="hint">配方脚本</span>
            <el-input
              v-model="recipeFileNameDraft"
              size="small"
              class="file-name-input"
              placeholder="recipes.js"
              @change="commitRecipeFileName"
              @keyup.enter="commitRecipeFileName"
            />
          </span>
        </el-tooltip>

        <el-tooltip
          v-else-if="state.mode === 'custom'"
          content="自定义物品脚本文件名（写入 kubejs/startup_scripts/KubeIE/items/ 下），需以 .js 结尾；物品注册需要重启游戏生效"
          placement="bottom-end"
          :show-after="300"
        >
          <span class="file-name-group">
            <span class="hint">自定义脚本</span>
            <el-input
              v-model="customFileNameDraft"
              size="small"
              class="file-name-input"
              placeholder="custom_items.js"
              @change="commitCustomFileName"
              @keyup.enter="commitCustomFileName"
            />
          </span>
        </el-tooltip>

        <el-tooltip
          v-else
          content="自定义饰品脚本文件名（写入 kubejs/startup_scripts/KubeIE/curios/ 下），需以 .js 结尾；饰品注册需要重启游戏生效"
          placement="bottom-end"
          :show-after="300"
        >
          <span class="file-name-group">
            <span class="hint">饰品脚本</span>
            <el-input
              v-model="curioFileNameDraft"
              size="small"
              class="file-name-input"
              placeholder="curios_trinkets.js"
              @change="commitCurioFileName"
              @keyup.enter="commitCurioFileName"
            />
          </span>
        </el-tooltip>

        <span class="switch-label">
          <el-switch v-model="backupEnabled" size="small" />
          <span class="hint">自动备份</span>
        </span>

        <el-button v-if="state.mode === 'items'" size="small" :icon="Tickets" @click="openRecords">
          编辑记录{{ state.records.length > 0 ? `（${state.records.length}）` : '' }}
        </el-button>
        <el-button
          v-else-if="state.mode === 'recipes'"
          size="small"
          :icon="Tickets"
          @click="openRecipeRecords"
        >
          配方记录{{ state.recipeRecords.length > 0 ? `（${state.recipeRecords.length}）` : '' }}
        </el-button>
        <el-button
          v-else-if="state.mode === 'custom'"
          size="small"
          :icon="Tickets"
          @click="openCustomRecords"
        >
          编辑记录{{ state.customRecords.length > 0 ? `（${state.customRecords.length}）` : '' }}
        </el-button>
        <el-button v-else size="small" :icon="Tickets" @click="openCurioRecords">
          编辑记录{{ state.curioRecords.length > 0 ? `（${state.curioRecords.length}）` : '' }}
        </el-button>
        <el-button size="small" :icon="FolderOpened" @click="openScriptsDir">
          {{ state.mode === 'recipes' ? '配方目录' : '脚本目录' }}
        </el-button>
        <el-button
          v-if="state.mode === 'items'"
          size="small"
          :icon="FolderOpened"
          @click="openFoodConfigDir"
        >
          配置目录
        </el-button>
        <el-button size="small" :icon="FolderOpened" @click="openDataDirDialog">数据目录</el-button>
        <el-button size="small" :icon="Setting" @click="backToSetup">重新选择目录</el-button>
        <el-tooltip content="打开使用手册（使用手册.md）" placement="bottom-end" :show-after="300">
          <el-button size="small" circle :icon="Reading" @click="openManual" />
        </el-tooltip>
        <el-tooltip content="开发者 B 站主页" placement="bottom-end" :show-after="300">
          <el-button size="small" circle :icon="VideoPlay" @click="openBilibili" />
        </el-tooltip>
      </div>
    </header>

    <div class="workspace-body">
      <div class="col-fixed" :style="{ width: leftWidth + 'px' }">
        <ItemBrowser />
      </div>
      <div class="splitter col-splitter" @pointerdown="startDrag('left', $event)" />

      <div class="center-column" :style="centerStyle">
        <div class="center-pane">
          <PropertyEditor v-if="state.mode === 'items'" />
          <RecipeEditor v-else-if="state.mode === 'recipes'" />
          <CustomItemEditor v-else-if="state.mode === 'custom'" />
          <CurioEditor v-else />
        </div>
        <div class="splitter row-splitter center-splitter" @pointerdown="startDrag('center', $event)" />
        <div class="center-pane">
          <ScriptPreview v-if="state.mode === 'items'" />
          <RecipePreview v-else-if="state.mode === 'recipes'" />
          <CustomPreview v-else-if="state.mode === 'custom'" />
          <CurioPreview v-else />
        </div>
      </div>
      <div class="splitter col-splitter" @pointerdown="startDrag('right', $event)" />

      <div class="col-fixed" :style="{ width: rightWidth + 'px' }">
        <QueuePanel v-if="state.mode === 'items'" />
        <RecipeQueuePanel v-else-if="state.mode === 'recipes'" />
        <CustomLibraryPanel v-else-if="state.mode === 'custom'" />
        <CurioLibraryPanel v-else />
      </div>
    </div>

    <div class="log-row" :style="{ height: logHeight + 'px' }">
      <div class="splitter row-splitter log-splitter" @pointerdown="startDrag('log', $event)" />
      <LogPanel />
    </div>

    <EditRecords />
    <RecipeRecords />
    <CustomRecords />
    <CurioRecords />
    <DataDirDialog v-model="dataDirVisible" />
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap; /* 窗口较窄时右侧控件换行，避免最右侧按钮被裁掉 */
  row-gap: 6px;
  gap: 16px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #ccd2dc;
}

.header-left {
  min-width: 0;
}

.app-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.header-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.header-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex: none;
}

.profile-select {
  width: 240px;
}

.file-name-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-name-input {
  width: 150px;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workspace-body {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 12px 12px 0;
  min-height: 0;
  overflow: hidden;
}

.col-fixed {
  flex: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 让面板填满两侧固定宽度的列 */
.col-fixed > * {
  flex: 1;
  min-height: 0;
}

.center-column {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
  min-height: 0;
}

.center-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

/* 让面板在可拉伸容器里填满 */
.center-pane > * {
  flex: 1;
  min-height: 0;
}

/* ---- 分隔条（拖动调整尺寸） ---- */
.splitter {
  flex: none;
  position: relative;
  background: transparent;
  touch-action: none;
}

.col-splitter {
  width: 10px;
  cursor: col-resize;
}

.row-splitter {
  height: 10px;
  cursor: row-resize;
}

.splitter::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  background: #c8ced8;
  border-radius: 2px;
  transition: background 0.15s;
}

.col-splitter::after {
  width: 2px;
  height: 30px;
}

.row-splitter::after {
  width: 30px;
  height: 2px;
}

.splitter:hover::after {
  background: #409eff;
}

.center-splitter {
  margin: -2px 0;
}

.log-row {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 日志面板填满剩余高度（分隔条自身不参与拉伸） */
.log-row > *:not(.splitter) {
  flex: 1;
  min-height: 0;
}

.log-splitter {
  margin-bottom: 4px;
}
</style>
