<script setup lang="ts">
import { computed, ref } from 'vue'
import { Back, Delete, Plus, Refresh, Setting } from '@element-plus/icons-vue'
import { MOB_EFFECT_OPTION_GROUPS } from '@shared/data/mobEffects'
import {
  ATTRIBUTE_OPERATIONS,
  ATTRIBUTE_OPTION_GROUPS,
  CURIOS_SLOTS,
  DEFAULT_CURIO_NAMESPACE,
  MAX_CURIO_ATTRIBUTES,
  MAX_CURIO_EFFECTS,
  createUuid,
  curioId,
  summarizeCurio
} from '@shared/curios'
import {
  CURIO_EVENT_CATEGORIES,
  MAX_CURIO_EVENTS,
  cardsOfCategory,
  findEventCard,
  type CurioEventSelection
} from '@shared/curioEvents'
import { useEditor } from '../composables/useEditor'
import CuriosConfigDialog from './CuriosConfigDialog.vue'

/**
 * 自定义饰品编辑表单（物品自定义 → 饰品自定义子界面中栏）。
 * 槽位 → 决定 curios:xxx 标签；属性加成 → addAttribute；每 tick 效果 → curioTick；
 * 事件卡 → capability 卡写进饰品脚本、server 卡写进 server_scripts 伴随脚本；
 * **不生成渲染（renderer）代码**（教程要求：可自定义的部分不含特效渲染）。
 */
const {
  state,
  curioDraftValidation,
  curioDraftIsNew,
  resetCurioDraft,
  upsertCurioItem,
  addCurioAttribute,
  removeCurioAttribute,
  addCurioEffect,
  removeCurioEffect,
  addCurioEvent,
  removeCurioEvent,
  openCuriosConfig,
  switchMode
} = useEditor()

const draft = computed(() => state.curioDraft)
const fullId = computed(() => curioId(state.curioDraft))
const tags = computed(() => summarizeCurio(state.curioDraft))

/** 事件卡选择框的当前值（选完即清空） */
const pendingCardId = ref('')

function cardOf(cardId: string): ReturnType<typeof findEventCard> {
  return findEventCard(cardId)
}

function hasEventCard(cardId: string): boolean {
  return draft.value.events.some((selection) => selection.cardId === cardId)
}

function onPickCard(cardId: string): void {
  if (cardId) addCurioEvent(cardId)
  pendingCardId.value = ''
}

function removeEvent(index: number): void {
  removeCurioEvent(index)
}

/** 取（必要时初始化）某张卡片的参数表，供模板双向绑定 */
function paramsOf(selection: CurioEventSelection): Record<string, number | string> {
  if (!selection.params) selection.params = {}
  return selection.params
}

function setParam(selection: CurioEventSelection, key: string, value: number | string): void {
  paramsOf(selection)[key] = value
}

const rarityOptions = [
  { label: 'common（白）', value: 'COMMON' },
  { label: 'uncommon（黄）', value: 'UNCOMMON' },
  { label: 'rare（青）', value: 'RARE' },
  { label: 'epic（紫）', value: 'EPIC' }
]

/** 贴图文件固定位置（相对游戏目录） */
const texturePath = computed(() => {
  const namespace = (draft.value.namespace || DEFAULT_CURIO_NAMESPACE).trim()
  const name = (draft.value.name || '').trim() || '<物品ID>'
  return `kubejs/assets/${namespace}/textures/item/${name}.png`
})

/** 贴图输入示例 */
const textureExample = computed(() => {
  const namespace = (draft.value.namespace || DEFAULT_CURIO_NAMESPACE).trim()
  const name = (draft.value.name || '').trim() || 'my_charm'
  return `${namespace}:item/${name}`
})

/** Curios / kubejs_curios 检测结果提示 */
const modHint = computed(() => {
  const status = state.curiosStatus
  if (!status) return ''
  if (!status.curiosInstalled) return '未检测到 Curios 本体，饰品无法放入槽位'
  if (!status.bridgeInstalled) return '未检测到 kubejs_curios 桥接模组（必需，缺了脚本会报错）'
  return `已检测到 ${status.curiosJar} · ${status.bridgeJar}`
})

function regenerateUuid(index: number): void {
  const attribute = draft.value.attributes[index]
  if (attribute) attribute.uuid = createUuid()
}
</script>

<template>
  <div class="panel curio-editor">
    <div class="panel-header">
      <span>自定义饰品（Curios）</span>
      <span class="header-actions">
        <el-button size="small" :icon="Back" @click="switchMode('custom')">返回物品自定义</el-button>
        <el-button size="small" :icon="Setting" @click="openCuriosConfig">Curios 栏位配置</el-button>
      </span>
    </div>

    <div class="panel-body curio-body">
      <p class="hint note">
        {{ curioDraftIsNew ? '新建：填好后点「保存到饰品库」，再点右侧「应用修改」写入脚本并加入物品列表' : `正在编辑：${fullId}` }}
        <span v-if="modHint" class="mono"> · {{ modHint }}</span>
      </p>

      <!-- 槽位与 ID -->
      <div class="selector-row">
        <el-select v-model="draft.slot" size="small" class="slot-select" placeholder="槽位">
          <el-option
            v-for="slot in CURIOS_SLOTS"
            :key="slot.id"
            :label="slot.label"
            :value="slot.id"
          />
        </el-select>
        <el-input v-model="draft.namespace" size="small" class="namespace-input" placeholder="kubejs" />
        <span class="id-sep">:</span>
        <el-input v-model="draft.name" size="small" class="grow" placeholder="饰品 ID，如 fire_charm" />
      </div>
      <p class="hint note">
        注册名：<b class="mono">{{ fullId }}</b>　·　生成槽位标签
        <b class="mono">curios:{{ draft.slot || '?' }}</b>（标签写错会放不进槽位）
      </p>

      <!-- 基础属性 -->
      <div class="section-title">基础属性</div>
      <div class="field-grid">
        <div class="field">
          <span class="label">显示名称</span>
          <el-input v-model="draft.displayName" size="small" placeholder="游戏内显示的中文名" />
        </div>
        <div class="field wide">
          <span class="label">贴图</span>
          <span class="field-stack">
            <el-input v-model="draft.texture" size="small" placeholder="kubejs:item/my_charm（留空用默认路径）" />
            <span class="texture-hints">
              <span class="hint mono texture-path">固定路径：{{ texturePath }}</span>
              <span class="hint mono texture-path">输入示例：{{ textureExample }}</span>
            </span>
          </span>
        </div>
        <div class="field">
          <span class="label">最大堆叠数</span>
          <el-input-number
            v-model="draft.maxStackSize"
            size="small"
            :min="1"
            :max="64"
            controls-position="right"
            placeholder="饰品建议 1"
          />
        </div>
        <div class="field">
          <span class="label">稀有度</span>
          <el-select v-model="draft.rarity" size="small" clearable placeholder="默认 common">
            <el-option
              v-for="option in rarityOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>
        <div class="field switches">
          <span class="label">附加</span>
          <span class="switch-group">
            <el-checkbox v-model="draft.glow" size="small" :true-value="true" :false-value="false">发光</el-checkbox>
            <el-checkbox v-model="draft.fireResistant" size="small" :true-value="true" :false-value="false">
              抗火
            </el-checkbox>
          </span>
        </div>
        <div class="field wide">
          <span class="label">提示文本</span>
          <el-input
            v-model="draft.tooltip"
            size="small"
            type="textarea"
            :rows="2"
            placeholder="物品描述，每行一条（可留空）"
          />
        </div>
      </div>

      <!-- 佩戴 / 脱下 -->
      <div class="section-title">佩戴规则与提示</div>
      <div class="field-grid">
        <div class="field switches">
          <span class="label">允许</span>
          <span class="switch-group">
            <el-checkbox v-model="draft.canEquip" size="small" :true-value="true" :false-value="false">
              可佩戴
            </el-checkbox>
            <el-checkbox v-model="draft.canUnequip" size="small" :true-value="true" :false-value="false">
              可脱下
            </el-checkbox>
          </span>
        </div>
        <div class="field">
          <span class="label">佩戴提示</span>
          <el-input v-model="draft.equipMessage" size="small" placeholder="留空则不生成 onEquip 事件" />
        </div>
        <div class="field">
          <span class="label">取下提示</span>
          <el-input v-model="draft.unequipMessage" size="small" placeholder="留空则不生成 onUnequip 事件" />
        </div>
      </div>

      <!-- 属性加成 -->
      <div class="effect-head">
        <span class="section-title">属性加成（{{ draft.attributes.length }} / {{ MAX_CURIO_ATTRIBUTES }}）</span>
        <el-button
          size="small"
          :icon="Plus"
          :disabled="draft.attributes.length >= MAX_CURIO_ATTRIBUTES"
          @click="addCurioAttribute"
        >
          添加属性
        </el-button>
      </div>
      <div v-if="draft.attributes.length === 0" class="hint note">未配置属性加成</div>
      <div v-for="(attribute, index) in draft.attributes" :key="index" class="attr-row">
        <el-select
          v-model="attribute.id"
          size="small"
          class="grow"
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入属性 ID"
        >
          <el-option-group v-for="group in ATTRIBUTE_OPTION_GROUPS" :key="group.label" :label="group.label">
            <el-option
              v-for="option in group.options"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-option-group>
        </el-select>
        <el-input-number
          v-model="attribute.value"
          size="small"
          :step="0.5"
          controls-position="right"
          class="num-input"
        />
        <el-select v-model="attribute.operation" size="small" class="op-select">
          <el-option
            v-for="option in ATTRIBUTE_OPERATIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-tooltip content="点击重新生成 UUID（每个属性必须唯一）" placement="top" :show-after="300">
          <el-button size="small" :icon="Refresh" @click="regenerateUuid(index)" />
        </el-tooltip>
        <el-button size="small" link type="danger" :icon="Delete" @click="removeCurioAttribute(index)" />
      </div>
      <p class="hint note mono uuid-hint">
        UUID：{{ draft.attributes[0]?.uuid ?? '（添加属性后自动生成，每个属性唯一即可）' }}
      </p>

      <!-- 每 tick 效果 -->
      <div class="effect-head">
        <span class="section-title">佩戴效果（{{ draft.effects.length }} / {{ MAX_CURIO_EFFECTS }}）</span>
        <span class="head-right">
          <span class="hint unit">每</span>
          <el-input-number
            v-model="draft.effectIntervalSeconds"
            size="small"
            :min="0.5"
            :max="60"
            :step="0.5"
            controls-position="right"
            class="num-input"
          />
          <span class="hint unit">秒</span>
          <el-button
            size="small"
            :icon="Plus"
            :disabled="draft.effects.length >= MAX_CURIO_EFFECTS"
            @click="addCurioEffect"
          >
            添加效果
          </el-button>
        </span>
      </div>
      <div v-if="draft.effects.length === 0" class="hint note">未配置佩戴效果（不生成 curioTick）</div>
      <div v-for="(effect, index) in draft.effects" :key="index" class="effect-row">
        <el-select
          v-model="effect.id"
          size="small"
          class="grow"
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入效果 ID"
        >
          <el-option-group v-for="group in MOB_EFFECT_OPTION_GROUPS" :key="group.label" :label="group.label">
            <el-option
              v-for="option in group.options"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-option-group>
        </el-select>
        <el-input-number
          v-model="effect.durationSeconds"
          size="small"
          :min="1"
          :max="3600"
          controls-position="right"
          class="num-input"
        />
        <span class="hint unit">秒</span>
        <el-input-number
          v-model="effect.amplifier"
          size="small"
          :min="0"
          :max="9"
          controls-position="right"
          class="num-input"
        />
        <span class="hint unit">级</span>
        <el-button size="small" link type="danger" :icon="Delete" @click="removeCurioEffect(index)" />
      </div>
      <p class="hint note">
        生成的 curioTick 只跑服务端（已自动加 isClientSide 判断）；本界面<b>不生成渲染代码</b>，饰品身上不显示模型属正常现象。
      </p>

      <!-- 事件卡 -->
      <div class="section-head">
        <span class="section-title">事件卡（{{ draft.events.length }} / {{ MAX_CURIO_EVENTS }}）</span>
        <span class="head-right">
          <el-select
            v-model="pendingCardId"
            size="small"
            filterable
            placeholder="选择事件卡后自动加入"
            class="card-select"
            :disabled="draft.events.length >= MAX_CURIO_EVENTS"
            @change="onPickCard"
          >
            <el-option-group
              v-for="category in CURIO_EVENT_CATEGORIES"
              :key="category.id"
              :label="`${category.label}　${category.summary}`"
            >
              <el-option
                v-for="card in cardsOfCategory(category.id)"
                :key="card.id"
                :label="card.name"
                :value="card.id"
                :disabled="hasEventCard(card.id)"
              />
            </el-option-group>
          </el-select>
        </span>
      </div>
      <div v-if="draft.events.length === 0" class="hint note">
        未选择事件卡。事件卡可自由组合：「饰品脚本」类写进本饰品的 .attachCuriosCapability()，
        「server_scripts」类（击杀 / 受伤 / 破坏方块）写进 server_scripts 的伴随脚本。
      </div>
      <div
        v-for="(selection, index) in draft.events"
        :key="selection.cardId"
        class="event-card"
      >
        <div class="event-head">
          <span class="event-name">{{ cardOf(selection.cardId)?.name ?? selection.cardId }}</span>
          <el-tag
            size="small"
            effect="plain"
            :type="cardOf(selection.cardId)?.scope === 'server' ? 'warning' : 'success'"
          >
            {{ cardOf(selection.cardId)?.scope === 'server' ? 'server_scripts' : '饰品脚本' }}
          </el-tag>
          <span class="hint note grow">{{ cardOf(selection.cardId)?.summary }}</span>
          <el-button size="small" link type="danger" :icon="Delete" @click="removeEvent(index)" />
        </div>
        <div v-if="(cardOf(selection.cardId)?.params ?? []).length > 0" class="event-params">
          <span
            v-for="param in cardOf(selection.cardId)?.params ?? []"
            :key="param.key"
            class="event-param"
          >
            <span class="hint">{{ param.label }}</span>
            <el-input-number
              v-if="param.kind === 'number'"
              :model-value="Number(paramsOf(selection)[param.key] ?? param.value)"
              size="small"
              :min="param.min ?? 0"
              :max="param.max ?? 9999"
              controls-position="right"
              class="num-input"
              @update:model-value="(value: number | undefined) => setParam(selection, param.key, value ?? 0)"
            />
            <el-input
              v-else
              :model-value="String(paramsOf(selection)[param.key] ?? param.value)"
              size="small"
              class="param-text"
              :placeholder="param.hint || String(param.value)"
              @update:model-value="(value: string) => setParam(selection, param.key, value)"
            />
            <span v-if="param.suffix" class="hint unit">{{ param.suffix }}</span>
          </span>
        </div>
      </div>

      <div class="tags">
        <el-tag v-for="tag in tags" :key="tag" size="small" type="info" effect="plain">{{ tag }}</el-tag>
      </div>

      <div v-if="curioDraftValidation.errors.length > 0" class="feedback error-text">
        {{ curioDraftValidation.errors[0] }}
      </div>
      <div v-else-if="curioDraftValidation.warnings.length > 0" class="feedback warn-text">
        {{ curioDraftValidation.warnings[0] }}
      </div>
    </div>

    <div class="panel-footer">
      <el-button size="small" @click="resetCurioDraft">重置</el-button>
      <el-button size="small" type="primary" @click="upsertCurioItem">
        {{ curioDraftIsNew ? '保存到饰品库' : '更新饰品定义' }}
      </el-button>
    </div>

    <CuriosConfigDialog v-model="state.curiosConfigVisible" />
  </div>
</template>

<style scoped>
.curio-body {
  padding: 10px 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.slot-select {
  width: 168px;
}

.namespace-input {
  width: 100px;
}

.id-sep {
  color: #5b6472;
}

.grow {
  flex: 1;
  min-width: 0;
}

.section-title {
  margin: 10px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2733;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
}

.field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.field.wide {
  grid-column: 1 / -1;
}

.field .label {
  flex: none;
  width: 78px;
  font-size: 12px;
  color: #4a5261;
}

.field.switches .switch-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.texture-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.texture-path {
  font-size: 11.5px;
  color: #5b6472;
  word-break: break-all;
}

.note {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.effect-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.attr-row,
.effect-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.num-input {
  width: 92px;
}

.op-select {
  width: 168px;
}

.uuid-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unit {
  font-size: 11px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
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

/* ---- 事件卡 ---- */
.card-select {
  width: 260px;
}

.event-card {
  margin-top: 6px;
  padding: 6px 8px;
  border: 1px solid #ccd2dc;
  border-radius: 4px;
  background: #fafafa;
}

.event-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.event-name {
  font-size: 12px;
  font-weight: 600;
  color: #1f2733;
  white-space: nowrap;
}

.event-params {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-top: 6px;
}

.event-param {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.param-text {
  width: 150px;
}
</style>
