<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, Plus, Star } from '@element-plus/icons-vue'
import {
  ARMOR_TIER_PRESETS,
  CUSTOM_KIND_GROUPS,
  DEFAULT_CUSTOM_NAMESPACE,
  MAX_FOOD_EFFECTS,
  VANILLA_ARMOR_TIERS,
  VANILLA_TOOL_TIER_LABELS,
  VANILLA_TOOL_TIERS,
  createEmptyFoodEffect,
  customItemId,
  customItemKindInfo,
  summarizeCustomItem,
  type CustomFoodEffect
} from '@shared/customItems'
import { MOB_EFFECT_OPTION_GROUPS } from '@shared/data/mobEffects'
import { useEditor } from '../composables/useEditor'
import CustomTierDialog from './CustomTierDialog.vue'

/**
 * 自定义物品编辑表单（物品自定义子界面中栏）。
 * 类型选择 → 按类型展示对应字段 → 保存进物品库（立即写入 custom-items.json 并更新左侧列表）。
 */
const {
  state,
  customDraftValidation,
  customDraftIsNew,
  setCustomKind,
  resetCustomDraft,
  upsertCustomItem,
  editCustomTier,
  removeCustomTier,
  switchMode
} = useEditor()

const tierDialogVisible = ref(false)

const draft = computed(() => state.customDraft)
const kindInfo = computed(() => customItemKindInfo(state.customDraft.kind))
const fullId = computed(() => customItemId(state.customDraft))
const tags = computed(() => summarizeCustomItem(state.customDraft))

const kindValue = computed({
  get: () => state.customDraft.kind,
  set: (value) => setCustomKind(value)
})

/** 工具等级候选：原版（显示中文名）+ 自定义 */
const toolTierOptions = computed(() => [
  ...VANILLA_TOOL_TIERS.map((name) => ({
    value: name,
    label: `${VANILLA_TOOL_TIER_LABELS[name] ?? name}（原版）`
  })),
  ...state.customLibrary.toolTiers.map((tier) => ({ value: tier.name, label: `${tier.name}（自定义）` }))
])

/** 物品贴图的固定存放位置（相对游戏目录，随命名空间 / 物品 ID 实时变化） */
const texturePath = computed(() => {
  const namespace = (state.customDraft.namespace || DEFAULT_CUSTOM_NAMESPACE).trim()
  const name = (state.customDraft.name || '').trim() || '<物品ID>'
  return `kubejs/assets/${namespace}/textures/item/${name}.png`
})

/** 贴图输入框的填写示例（未填物品 ID 时给通用示例） */
const textureExample = computed(() => {
  const namespace = (state.customDraft.namespace || DEFAULT_CUSTOM_NAMESPACE).trim()
  const name = (state.customDraft.name || '').trim() || 'my_sword'
  return `${namespace}:item/${name}`
})

/** 盔甲等级候选：原版 + 自定义 */
const armorTierOptions = computed(() => [
  ...VANILLA_ARMOR_TIERS.map((name) => ({ value: name, label: `${name}（原版）` })),
  ...state.customLibrary.armorTiers.map((tier) => ({ value: tier.name, label: `${tier.name}（自定义）` }))
])

/** 用法杖 / 武器默认不可堆叠，隐藏堆叠数以免误设 */
const showStackSize = computed(() => !kindInfo.value.useToolTier)

const effects = computed<CustomFoodEffect[]>(() => state.customDraft.food?.effects ?? [])

function addEffect(): void {
  if (!state.customDraft.food) return
  if (state.customDraft.food.effects.length >= MAX_FOOD_EFFECTS) return
  state.customDraft.food.effects.push(createEmptyFoodEffect())
}

function removeEffect(index: number): void {
  state.customDraft.food?.effects.splice(index, 1)
}

/** 用原版盔甲等级数值预填当前自定义等级（仅在编辑框中生效） */
function presetLabel(name: string): string {
  const preset = ARMOR_TIER_PRESETS[name]
  if (!preset) return name
  return `${name}（护甲 ${preset.slotProtections.join('/')}，韧性 ${preset.toughness}）`
}

function openTierDialog(kind: 'tool' | 'armor', index = -1): void {
  editCustomTier(kind, index)
  tierDialogVisible.value = true
}
</script>

<template>
  <div class="panel custom-editor">
    <div class="panel-header">
      <span>自定义物品</span>
      <span class="header-actions">
        <span class="hint">
          {{ customDraftIsNew ? '新建：填好后点「保存到物品库」' : `正在编辑：${fullId}` }}
        </span>
        <el-tooltip
          content="饰品自定义：Curios 栏位配置（config/curios-common.toml）+ 饰品脚本（startup_scripts）"
          placement="top-end"
          :show-after="300"
        >
          <el-button size="small" type="success" plain :icon="Star" @click="switchMode('curios')">
            饰品自定义
          </el-button>
        </el-tooltip>
      </span>
    </div>

    <div class="panel-body custom-body">
      <!-- 类型与 ID -->
      <div class="selector-row">
        <el-select v-model="kindValue" size="small" class="kind-select">
          <el-option-group v-for="group in CUSTOM_KIND_GROUPS" :key="group.label" :label="group.label">
            <el-option
              v-for="option in group.options"
              :key="option.id"
              :label="option.label"
              :value="option.id"
            />
          </el-option-group>
        </el-select>
        <el-input v-model="draft.namespace" size="small" class="namespace-input" placeholder="kubejs" />
        <span class="id-sep">:</span>
        <el-input v-model="draft.name" size="small" class="grow" placeholder="物品 ID，如 my_sword" />
      </div>
      <p class="hint note">
        注册名：<b class="mono">{{ fullId }}</b>　（命名空间留空按 {{ DEFAULT_CUSTOM_NAMESPACE }} 处理）·
        {{ kindInfo.note }}
      </p>

      <!-- 通用属性 -->
      <div class="section-title">通用属性</div>
      <div class="field-grid">
        <div class="field">
          <span class="label">显示名称</span>
          <el-input v-model="draft.displayName" size="small" placeholder="游戏内显示的中文名" />
        </div>
        <div class="field wide">
          <span class="label">贴图</span>
          <span class="field-stack">
            <el-input v-model="draft.texture" size="small" placeholder="kubejs:item/my_sword（留空用默认路径）" />
            <span class="texture-hints">
              <span class="hint mono texture-path">固定路径：{{ texturePath }}</span>
              <span class="hint mono texture-path">输入示例：{{ textureExample }}</span>
            </span>
          </span>
        </div>
        <div v-if="showStackSize" class="field">
          <span class="label">最大堆叠数</span>
          <el-input-number
            v-model="draft.maxStackSize"
            size="small"
            :min="1"
            :max="64"
            controls-position="right"
            placeholder="留空 = 64"
          />
        </div>
        <div class="field">
          <span class="label">最大耐久</span>
          <el-input-number
            v-model="draft.maxDamage"
            size="small"
            :min="1"
            :max="1000000"
            controls-position="right"
            placeholder="留空 = 按等级"
          />
        </div>
        <div class="field">
          <span class="label">稀有度</span>
          <el-select v-model="draft.rarity" size="small" clearable placeholder="默认 common">
            <el-option label="common（白）" value="COMMON" />
            <el-option label="uncommon（黄）" value="UNCOMMON" />
            <el-option label="rare（青）" value="RARE" />
            <el-option label="epic（紫）" value="EPIC" />
          </el-select>
        </div>
        <div class="field switches">
          <span class="label">附加</span>
          <span class="switch-group">
            <el-checkbox v-model="draft.glow" size="small" :true-value="true" :false-value="false">发光</el-checkbox>
            <el-checkbox
              v-model="draft.fireResistant"
              size="small"
              :true-value="true"
              :false-value="false"
            >
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

      <!-- 武器 / 工具属性 -->
      <template v-if="kindInfo.useToolTier">
        <div class="section-title">工具 / 武器属性</div>
        <div class="field-grid">
          <div class="field">
            <span class="label">工具等级</span>
            <el-select v-model="draft.tier" size="small" filterable allow-create placeholder="选择等级">
              <el-option
                v-for="option in toolTierOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
          <div class="field">
            <span class="label">基础攻击伤害</span>
            <el-input-number
              v-model="draft.attackDamageBaseline"
              size="small"
              :step="0.5"
              :min="0"
              :max="100"
              controls-position="right"
              placeholder="留空 = 该类型默认"
            />
          </div>
          <div class="field">
            <span class="label">攻击速度修饰值</span>
            <el-input-number
              v-model="draft.speedBaseline"
              size="small"
              :step="0.1"
              :min="-4"
              :max="4"
              controls-position="right"
              placeholder="留空 = 剑 -2.4"
            />
          </div>
          <div class="field">
            <span class="label">攻击伤害加成</span>
            <el-input-number
              v-model="draft.attackDamageBonus"
              size="small"
              :step="0.5"
              :min="0"
              :max="100"
              controls-position="right"
              placeholder="写入工具等级"
            />
          </div>
          <div v-if="kindInfo.diggerLike" class="field">
            <span class="label">挖掘速度</span>
            <el-input-number
              v-model="draft.digSpeed"
              size="small"
              :step="0.5"
              :min="0"
              :max="100"
              controls-position="right"
              placeholder="留空 = 等级默认"
            />
          </div>
          <div class="field wide">
            <span class="label">自定义等级</span>
            <span class="tier-actions">
              <el-button size="small" :icon="Plus" @click="openTierDialog('tool')">新建工具等级</el-button>
              <el-select
                v-if="state.customLibrary.toolTiers.length > 0"
                size="small"
                class="tier-pick"
                placeholder="编辑已有等级"
                :model-value="''"
                @change="(value: string) => openTierDialog('tool', Number(value))"
              >
                <el-option
                  v-for="(tier, index) in state.customLibrary.toolTiers"
                  :key="tier.name"
                  :label="tier.name"
                  :value="String(index)"
                />
              </el-select>
            </span>
          </div>
        </div>
        <p class="hint note">
          实际攻击速度 = 4.0 + 攻击速度修饰值（原版剑为 -2.4 → 1.6）；「挖掘速度 / 伤害加成」会写进工具等级。
        </p>
      </template>

      <!-- 盔甲属性 -->
      <template v-if="kindInfo.armorLike">
        <div class="section-title">盔甲属性</div>
        <div class="field-grid">
          <div class="field">
            <span class="label">盔甲等级</span>
            <el-select v-model="draft.armorTier" size="small" filterable allow-create placeholder="选择等级">
              <el-option
                v-for="option in armorTierOptions"
                :key="option.value"
                :label="option.value"
                :value="option.value"
              >
                <span>{{ option.value }}</span>
                <span class="hint">　{{ option.label.replace(option.value, '').trim() }}</span>
              </el-option>
            </el-select>
          </div>
          <div class="field wide">
            <span class="label">自定义等级</span>
            <span class="tier-actions">
              <el-button size="small" :icon="Plus" @click="openTierDialog('armor')">新建盔甲等级</el-button>
              <el-select
                v-if="state.customLibrary.armorTiers.length > 0"
                size="small"
                class="tier-pick"
                placeholder="编辑已有等级"
                :model-value="''"
                @change="(value: string) => openTierDialog('armor', Number(value))"
              >
                <el-option
                  v-for="(tier, index) in state.customLibrary.armorTiers"
                  :key="tier.name"
                  :label="tier.name"
                  :value="String(index)"
                />
              </el-select>
              <el-button
                v-for="(tier, index) in state.customLibrary.armorTiers"
                :key="`del-${tier.name}`"
                size="small"
                type="danger"
                link
                @click="removeCustomTier('armor', index)"
              >
                删除 {{ tier.name }}
              </el-button>
            </span>
          </div>
        </div>
        <p class="hint note">
          护甲值 / 韧性 / 耐久都来自盔甲等级：可在上面新建自定义等级，也可以直接用原版等级。
          <span class="mono">{{ state.customLibrary.armorTiers.map((tier) => presetLabel(tier.name)).join('') }}</span>
        </p>
      </template>

      <!-- 食物属性 -->
      <template v-if="kindInfo.food && draft.food">
        <div class="section-title">食物属性</div>
        <div class="field-grid">
          <div class="field">
            <span class="label">饥饿值</span>
            <el-input-number
              v-model="draft.food.hunger"
              size="small"
              :min="0"
              :max="20"
              controls-position="right"
            />
          </div>
          <div class="field">
            <span class="label">饱和度</span>
            <el-input-number
              v-model="draft.food.saturation"
              size="small"
              :step="0.1"
              :min="0"
              :max="20"
              controls-position="right"
            />
          </div>
          <div class="field switches">
            <span class="label">食用方式</span>
            <span class="switch-group">
              <el-checkbox v-model="draft.food.meat" size="small" :true-value="true" :false-value="false">
                肉类
              </el-checkbox>
              <el-checkbox v-model="draft.food.fastToEat" size="small" :true-value="true" :false-value="false">
                快速食用
              </el-checkbox>
              <el-checkbox
                v-model="draft.food.alwaysEdible"
                size="small"
                :true-value="true"
                :false-value="false"
              >
                随时可食用
              </el-checkbox>
            </span>
          </div>
        </div>

        <div class="effect-head">
          <span class="section-title">食用效果（{{ effects.length }} / {{ MAX_FOOD_EFFECTS }}）</span>
          <el-button
            size="small"
            :icon="Plus"
            :disabled="effects.length >= MAX_FOOD_EFFECTS"
            @click="addEffect"
          >
            添加效果
          </el-button>
        </div>
        <div v-if="effects.length === 0" class="hint note">未配置食用效果</div>
        <div v-for="(effect, index) in effects" :key="index" class="effect-row">
          <el-select
            v-model="effect.id"
            size="small"
            class="grow"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入效果 ID"
          >
            <el-option-group
              v-for="group in MOB_EFFECT_OPTION_GROUPS"
              :key="group.label"
              :label="group.label"
            >
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
          <el-input-number
            v-model="effect.probability"
            size="small"
            :step="0.1"
            :min="0"
            :max="1"
            controls-position="right"
            class="num-input"
          />
          <span class="hint unit">概率</span>
          <el-button size="small" link type="danger" :icon="Delete" @click="removeEffect(index)" />
        </div>
      </template>

      <div class="tags">
        <el-tag v-for="tag in tags" :key="tag" size="small" type="info" effect="plain">{{ tag }}</el-tag>
      </div>

      <div v-if="customDraftValidation.errors.length > 0" class="feedback error-text">
        {{ customDraftValidation.errors[0] }}
      </div>
      <div v-else-if="customDraftValidation.warnings.length > 0" class="feedback warn-text">
        {{ customDraftValidation.warnings[0] }}
      </div>
    </div>

    <div class="panel-footer">
      <el-button size="small" @click="resetCustomDraft">重置</el-button>
      <el-button size="small" type="primary" @click="upsertCustomItem">
        {{ customDraftIsNew ? '保存到物品库' : '更新物品定义' }}
      </el-button>
    </div>

    <CustomTierDialog v-model="tierDialogVisible" />
  </div>
</template>

<style scoped>
.custom-body {
  padding: 10px 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.kind-select {
  width: 150px;
}

.namespace-input {
  width: 108px;
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

/* 输入框 + 其下方固定提示（如贴图存放路径 / 输入示例） */
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

.tier-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tier-pick {
  width: 150px;
}

.effect-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 0 6px;
}

.effect-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.num-input {
  width: 92px;
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
</style>
