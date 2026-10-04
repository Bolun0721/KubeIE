<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpened, Refresh, Search } from '@element-plus/icons-vue'
import type { ScriptLocation } from '@shared/types'
import { useEditor } from '../composables/useEditor'

const { state, scanDirs, pickDir, inspectDir, useLocation, openPath } = useEditor()

const manualPath = ref('')
const manualResult = ref<ScriptLocation[]>([])
const scanningManual = ref(false)

async function handleScan(): Promise<void> {
  await scanDirs()
}

async function handlePick(): Promise<void> {
  const locations = await pickDir()
  if (locations.length > 0) {
    manualResult.value = locations
  }
}

async function handleInspect(): Promise<void> {
  const dir = manualPath.value.trim()
  if (!dir) {
    ElMessage.warning('请输入或选择游戏目录')
    return
  }
  scanningManual.value = true
  try {
    manualResult.value = await inspectDir(dir)
    if (manualResult.value.length === 0) {
      ElMessage.warning('该目录下未找到 kubejs 文件夹，请先运行一次安装了 KubeJS 的游戏')
    }
  } finally {
    scanningManual.value = false
  }
}

async function handleUse(location: ScriptLocation): Promise<void> {
  await useLocation(location)
}

function locationTitle(location: ScriptLocation): string {
  if (location.isolated) {
    return `版本隔离：${location.versionName ?? '未知版本'}`
  }
  return '非版本隔离（.minecraft/kubejs）'
}

void scanDirs()
</script>

<template>
  <div class="setup">
    <el-card class="setup-card" shadow="never">
      <template #header>
        <div class="setup-header">
          <div>
            <div class="setup-title">KubeIE</div>
            <div class="hint">目标环境：Minecraft 1.20.1 Forge + KubeJS 6（startup_scripts）</div>
          </div>
          <el-button :icon="Refresh" :loading="state.busy" @click="handleScan">重新扫描</el-button>
        </div>
      </template>

      <!-- 首次启动引导：开发测试阶段的数据安全提醒（深黄色警告） -->
      <div class="setup-warning">
        为保障您的数据安全，请确保游戏存档已有备份，确保各前置模组已安装，明确各脚本文件位置，项目仍处于开发测试阶段，功能和使用存在缺陷和bug，如有疑问请阅读使用手册或者在b站查看使用教程，感谢您的配合，祝您游戏愉快！
      </div>

      <el-alert type="info" :closable="false" show-icon class="setup-alert">
        <template #title>使用前请确认</template>
        <div class="hint">
          脚本会写入游戏目录下的 <span class="mono">kubejs/startup_scripts/</span> 文件夹，请先在启动器中
          至少运行一次安装了 KubeJS 的游戏，否则该目录不存在。若使用 HMCL / PCL2 / Prism 等启动器开启了
          版本隔离，请选择对应的版本目录。
        </div>
      </el-alert>

      <div class="section-title">自动检测结果</div>
      <el-empty v-if="!state.scan || state.scan.candidates.length === 0" description="未找到候选目录" />

      <div v-else class="candidate-list">
        <div v-for="candidate in state.scan.candidates" :key="candidate.dir" class="candidate">
          <div class="candidate-head">
            <el-tag :type="candidate.inspection.usable ? 'success' : 'info'" size="small">
              {{ candidate.inspection.usable ? '可用' : '不可用' }}
            </el-tag>
            <span class="candidate-source">{{ candidate.source }}</span>
            <span class="candidate-path mono">{{ candidate.dir }}</span>
          </div>
          <div class="hint">{{ candidate.inspection.message }}</div>

          <div v-if="candidate.inspection.locations.length > 0" class="location-list">
            <div
              v-for="location in candidate.inspection.locations"
              :key="location.startupScriptsDir"
              class="location-item"
            >
              <div class="location-info">
                <div class="location-title">{{ locationTitle(location) }}</div>
                <div class="hint mono">{{ location.startupScriptsDir }}</div>
                <div class="hint">
                  MC 版本：{{ location.mcVersion ?? '未检测到' }} ·
                  {{ location.kubejsJar ?? '未检测到 KubeJS 模组文件' }}
                </div>
              </div>
              <el-button type="primary" size="small" @click="handleUse(location)">使用此目录</el-button>
            </div>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="section-title">手动指定游戏目录</div>
      <div class="manual-row">
        <el-input
          v-model="manualPath"
          placeholder="例如 D:\Games\.minecraft 或 D:\Games\.minecraft\versions\1.20.1-forge"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button :loading="scanningManual" @click="handleInspect">检测目录</el-button>
        <el-button :icon="FolderOpened" @click="handlePick">浏览…</el-button>
      </div>

      <div v-if="manualResult.length > 0" class="location-list">
        <div v-for="location in manualResult" :key="location.startupScriptsDir" class="location-item">
          <div class="location-info">
            <div class="location-title">{{ locationTitle(location) }}</div>
            <div class="hint mono">{{ location.startupScriptsDir }}</div>
            <div class="hint">MC 版本：{{ location.mcVersion ?? '未检测到' }}</div>
          </div>
          <div class="location-actions">
            <el-button size="small" @click="openPath(location.startupScriptsDir)">打开</el-button>
            <el-button type="primary" size="small" @click="handleUse(location)">使用此目录</el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.setup {
  display: flex;
  justify-content: center;
  padding: 28px;
  height: 100%;
  overflow: auto;
}

.setup-card {
  width: 100%;
  max-width: 900px;
}

.setup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setup-title {
  font-size: 16px;
  font-weight: 600;
}

.setup-alert {
  margin-bottom: 16px;
}

/* 首次启动的开发测试阶段提醒：深黄色警告字段 */
.setup-warning {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #e6c200;
  border-left: 4px solid #d4a017;
  border-radius: 6px;
  background: #fffbe6;
  color: #8a6d00;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.candidate {
  padding: 10px 12px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  background: #fafafa;
}

.candidate-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.candidate-source {
  font-weight: 600;
}

.candidate-path {
  color: #4a5261;
  font-size: 12px;
}

.location-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.location-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #d9dee7;
  border-radius: 6px;
}

.location-title {
  font-weight: 600;
  font-size: 13px;
}

.location-info {
  min-width: 0;
}

.manual-row {
  display: flex;
  gap: 8px;
}

.location-actions {
  display: flex;
  gap: 8px;
  flex: none;
}
</style>
