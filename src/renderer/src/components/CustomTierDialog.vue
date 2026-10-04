<script setup lang="ts">
import { computed } from 'vue'
import {
  ARMOR_TIER_PRESETS,
  type CustomArmorTierDef,
  type CustomToolTierDef
} from '@shared/customItems'
import { useEditor } from '../composables/useEditor'

/**
 * 自定义工具 / 盔甲等级编辑对话框。
 * 保存后等级进入物品库并写入脚本（ItemEvents.toolTierRegistry / armorTierRegistry），物品即可引用。
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { state, customTierValidation, saveCustomTier, cancelCustomTier } = useEditor()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    emit('update:modelValue', value)
    if (!value) cancelCustomTier()
  }
})

const kind = computed(() => state.customTierDraft?.kind ?? 'tool')
const isEditing = computed(() => (state.customTierDraft?.index ?? -1) >= 0)
const toolDef = computed(() => state.customTierDraft?.def as CustomToolTierDef | undefined)
const armorDef = computed(() => state.customTierDraft?.def as CustomArmorTierDef | undefined)

/** 护甲值部位（与 KubeJS 的 slotProtections 顺序一致） */
const SLOT_LABELS = ['靴子', '护腿', '胸甲', '头盔']

/** 载入原版等级参考数值 */
function applyPreset(name: string): void {
  const preset = ARMOR_TIER_PRESETS[name]
  const def = armorDef.value
  if (!preset || !def) return
  def.durabilityMultiplier = preset.durabilityMultiplier
  def.slotProtections = [...preset.slotProtections]
  def.enchantmentValue = preset.enchantmentValue
  def.toughness = preset.toughness
  def.knockbackResistance = preset.knockbackResistance
}

async function handleSave(): Promise<void> {
  await saveCustomTier()
  if (!state.customTierDraft) visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="kind === 'tool' ? '自定义工具等级' : '自定义盔甲等级'"
    width="620px"
    append-to-body
  >
    <div v-if="state.customTierDraft" class="tier-form">
      <p class="hint note">
        {{ isEditing ? '编辑已有等级（保存后立即写入脚本定义）' : '新建等级（保存后才能被物品引用）' }}
      </p>

      <div class="field">
        <span class="label">等级 ID</span>
        <el-input
          v-if="toolDef"
          v-model="toolDef.name"
          size="small"
          class="grow"
          placeholder="如 my_tier / copper（小写字母、数字、下划线）"
        />
        <el-input
          v-else-if="armorDef"
          v-model="armorDef.name"
          size="small"
          class="grow"
          placeholder="如 copper（同时决定身穿贴图前缀 copper_layer_1.png）"
        />
      </div>

      <!-- 工具等级 -->
      <template v-if="kind === 'tool' && toolDef">
        <div class="field">
          <span class="label">耐久</span>
          <el-input-number v-model="toolDef.uses" size="small" :min="1" :max="100000" controls-position="right" />
          <span class="hint unit">tier.uses（该等级下工具的耐久）</span>
        </div>
        <div class="field">
          <span class="label">挖掘速度</span>
          <el-input-number v-model="toolDef.speed" size="small" :step="0.5" :min="0" :max="100" controls-position="right" />
          <span class="hint unit">原版：木 2 / 石 4 / 铁 6 / 钻石 8 / 下界合金 9</span>
        </div>
        <div class="field">
          <span class="label">攻击伤害加成</span>
          <el-input-number
            v-model="toolDef.attackDamageBonus"
            size="small"
            :step="0.5"
            :min="0"
            :max="100"
            controls-position="right"
          />
          <span class="hint unit">原版：木 0 / 石 1 / 铁 2 / 钻石 3 / 下界合金 4</span>
        </div>
        <div class="field">
          <span class="label">挖掘等级</span>
          <el-input-number v-model="toolDef.level" size="small" :min="0" :max="10" controls-position="right" />
          <span class="hint unit">0 木 / 1 石 / 2 铁 / 3 钻石 / 4 下界合金</span>
        </div>
        <div class="field">
          <span class="label">附魔能力</span>
          <el-input-number
            v-model="toolDef.enchantmentValue"
            size="small"
            :min="0"
            :max="100"
            controls-position="right"
          />
          <span class="hint unit">原版：木 15 / 石 5 / 铁 14 / 钻石 10</span>
        </div>
        <div class="field">
          <span class="label">修复材料</span>
          <el-input v-model="toolDef.repairIngredient" size="small" class="grow" placeholder="minecraft:iron_ingot 或 #forge:ingots/iron" />
        </div>
      </template>

      <!-- 盔甲等级 -->
      <template v-else-if="armorDef">
        <div class="field">
          <span class="label">载入参考</span>
          <span class="preset-row">
            <el-button
              v-for="name in Object.keys(ARMOR_TIER_PRESETS)"
              :key="name"
              size="small"
              link
              type="primary"
              @click="applyPreset(name)"
            >
              {{ name }}
            </el-button>
          </span>
        </div>
        <div class="field">
          <span class="label">耐久倍率</span>
          <el-input-number
            v-model="armorDef.durabilityMultiplier"
            size="small"
            :min="1"
            :max="200"
            controls-position="right"
          />
          <span class="hint unit">各部分耐久 = 倍率 × {{ '13/15/16/11' }}（靴/腿/胸/头）</span>
        </div>
        <div class="field">
          <span class="label">护甲值</span>
          <span class="slot-row">
            <span v-for="(label, index) in SLOT_LABELS" :key="label" class="slot-item">
              <span class="hint">{{ label }}</span>
              <el-input-number
                v-if="armorDef.slotProtections"
                v-model="armorDef.slotProtections[index]"
                size="small"
                :min="0"
                :max="20"
                controls-position="right"
                class="slot-input"
              />
            </span>
          </span>
        </div>
        <div class="field">
          <span class="label">附魔能力</span>
          <el-input-number
            v-model="armorDef.enchantmentValue"
            size="small"
            :min="0"
            :max="100"
            controls-position="right"
          />
          <span class="hint unit">原版：皮革 15 / 铁 9 / 钻石 10 / 下界合金 15</span>
        </div>
        <div class="field">
          <span class="label">盔甲韧性</span>
          <el-input-number
            v-model="armorDef.toughness"
            size="small"
            :step="0.5"
            :min="0"
            :max="20"
            controls-position="right"
          />
          <span class="hint unit">原版：钻石 2 / 下界合金 3</span>
        </div>
        <div class="field">
          <span class="label">击退抗性</span>
          <el-input-number
            v-model="armorDef.knockbackResistance"
            size="small"
            :step="0.1"
            :min="0"
            :max="1"
            controls-position="right"
          />
          <span class="hint unit">0.1 = 减免 10%（下界合金为 0.1）</span>
        </div>
        <div class="field">
          <span class="label">修复材料</span>
          <el-input
            v-model="armorDef.repairIngredient"
            size="small"
            class="grow"
            placeholder="minecraft:copper_ingot 或 #forge:ingots/copper"
          />
        </div>
        <p class="hint note">
          身穿外观需要贴图：<span class="mono">kubejs/assets/kubejs/textures/models/armor/&lt;等级ID&gt;_layer_1.png</span>
          与 <span class="mono">_layer_2.png</span>（layer_1 为头盔/胸甲/靴子，layer_2 为护腿）。缺贴图不会报错，但身上看不到盔甲外观。
        </p>
      </template>

      <div v-if="customTierValidation.errors.length > 0" class="feedback error-text">
        {{ customTierValidation.errors[0] }}
      </div>
      <div v-else-if="customTierValidation.warnings.length > 0" class="feedback warn-text">
        {{ customTierValidation.warnings[0] }}
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button size="small" type="primary" @click="handleSave">保存等级</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tier-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.field .label {
  flex: none;
  width: 84px;
  font-size: 12px;
  color: #4a5261;
}

.grow {
  flex: 1;
  min-width: 0;
}

.unit {
  font-size: 11px;
}

.preset-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.slot-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.slot-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
}

.slot-input {
  width: 84px;
}

.note {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.feedback {
  font-size: 12px;
}

.error-text {
  color: #f56c6c;
}

.warn-text {
  color: #e6a23c;
}
</style>
