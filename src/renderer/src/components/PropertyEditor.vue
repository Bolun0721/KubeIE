<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { MOB_EFFECT_OPTION_GROUPS } from '@shared/data/mobEffects'
import { createEmptyEffect, createEmptyFood } from '@shared/properties'
import type {
  ArmorProperties,
  ItemProperties,
  ResolvedFoodProperties,
  TierProperties
} from '@shared/types'
import { RARITIES } from '@shared/validation'
import { useEditor } from '../composables/useEditor'
import { categoryLabel, rarityLabel, romanLevel } from '../utils/labels'

interface DraftView extends Omit<ItemProperties, 'tier' | 'foodProperties' | 'armor'> {
  tier: TierProperties
  armor: ArmorProperties
  foodProperties: ResolvedFoodProperties
}

const { state, currentTarget, activeProfile, draftValidation, saturationEstimate, upsertQueue, resetDraft } =
  useEditor()

const draft = computed<DraftView>(() => {
  const target = state.draft
  if (!target.tier) {
    target.tier = {
      speed: null,
      attackDamageBonus: null,
      attackSpeed: null,
      level: null,
      repairIngredient: null
    }
  }
  if (!target.armor) {
    target.armor = { protection: null, toughness: null }
  }
  if (!target.foodProperties) {
    target.foodProperties = createEmptyFood()
  }
  if (!target.foodProperties.effects) target.foodProperties.effects = []
  if (typeof target.foodProperties.remove !== 'boolean') target.foodProperties.remove = false
  return target as DraftView
})

/** 仅工具类物品（KubeJS 的 TieredItem：剑 / 镐 / 斧 / 锹 / 锄）展示工具属性 */
const showTier = computed(() => !!currentTarget.value?.entry.toolLike)
/** 仅盔甲类物品（ArmorItem）展示护甲属性；盾牌 / 鞘翅不是 ArmorItem，KubeJS 会拒绝 */
const showArmor = computed(() => entry.value?.armorLike === true)
const isEditingQueue = computed(() => state.editingIndex >= 0)
const maxStackLimit = computed(() => activeProfile.value.maxStackSizeLimit)

/**
 * 挖掘等级 / 修复材料只能通过 tier 回调设置，
 * 而 KubeJS 官方已将该 API 标记为失效（issue #662）。
 */
const tierOnlyHint = computed(() =>
  activeProfile.value.tierStyle === 'direct'
    ? '当前模板不生成该属性（tier 回调已失效，issue #662）'
    : '⚠ KubeJS 已将 tier 回调标记为失效（issue #662），该属性可能不生效'
)

/** 当前物品（来自内置库） */
const entry = computed(() => currentTarget.value?.entry ?? null)

/**
 * KubeJS 的 item.digSpeed 只对挖掘类工具（DiggerItem：镐/斧/锹/锄）有效，
 * 对剑等物品会抛异常并中断整个事件，因此这里按物品类型限制。
 */
const canSetDigSpeed = computed(() => entry.value?.diggerLike === true)

const digSpeedHint = computed(() =>
  entry.value && !entry.value.diggerLike
    ? '该物品不是挖掘类工具（镐/斧/锹/锄），KubeJS 无法设置其挖掘速度，生成脚本时会忽略'
    : '生成写法：item.digSpeed = 值（直接生效）'
)

/**
 * KubeJS 6 实测：attackDamage 只对剑类（SwordItem）等非 DiggerItem 的 TieredItem 有效，
 * 挖掘类工具（DiggerItem）会报 “has no public instance field or method named attackDamage”
 * 并中断整个事件，盔甲类则被 KubeJS 显式拒绝，因此这里按物品类型限制。
 */
const canSetAttackDamage = computed(
  () => !!entry.value && !entry.value.diggerLike && entry.value.category !== 'armor'
)

const attackDamageHint = computed(() => {
  if (entry.value?.diggerLike) {
    return '挖掘类工具（镐/斧/锹/锄）在 KubeJS 6 下没有 attackDamage 映射，设置会报错并中断整个事件，生成脚本时会忽略'
  }
  if (entry.value?.category === 'armor') {
    return 'KubeJS 不支持对盔甲类物品设置攻击伤害，生成脚本时会忽略'
  }
  return '为加成值，非最终伤害；生成写法：item.attackDamage = 值（直接生效）'
})

/** 攻击速度：KubeJS 的 attackSpeed 是「修饰值」，实际攻速 = 4.0 + 该值 */
const attackSpeedHint = computed(() => {
  const value = draft.value.tier.attackSpeed
  const reference = '攻速修饰值：实际攻速 = 4.0 + 该值（原版剑 -2.4 → 1.6；斧 -3.2 ~ -3.0）'
  if (value == null) return reference
  return `${reference}；当前实际攻速 ≈ ${(4 + value).toFixed(1)}`
})

const defaultSummary = computed(() => {
  const currentEntry = currentTarget.value?.entry
  const defaults = currentEntry?.defaults
  if (!defaults) return '内置数据库未收录该物品的默认数值'
  const parts: string[] = []
  if (defaults.defaultStackSize != null) parts.push(`最大堆叠 ${defaults.defaultStackSize}`)
  if (defaults.maxDamage != null) parts.push(`耐久 ${defaults.maxDamage}`)
  if (defaults.foodProperties?.hunger != null) parts.push(`饱食度 ${defaults.foodProperties.hunger}`)
  return parts.length > 0 ? `原版默认：${parts.join(' · ')}` : '内置数据库未收录该物品的默认数值'
})

/** 该物品原版是否为食物（决定预填数值与提示文案） */
const isEdible = computed(() => entry.value?.edible === true)

/** FoodTweaker 是否已安装（未在 mods 目录检测到 jar 时给出提示） */
const foodModInstalled = computed(() => state.foodStatus?.modInstalled !== false)

/**
 * 食物属性开关：FoodTweaker 可以给任何物品加上食物属性（不限于原版食物），
 * 因此用开关显式启用，避免给工具 / 材料误加食物覆盖项。
 */
const foodEnabled = computed<boolean>({
  get: () => {
    const food = draft.value.foodProperties
    if (food.remove) return true
    return (
      food.nutrition != null ||
      food.saturation != null ||
      food.canAlwaysEat != null ||
      food.eatSeconds != null ||
      food.effects.length > 0
    )
  },
  set: (value) => {
    if (!value) {
      draft.value.foodProperties = createEmptyFood()
      return
    }
    // 原版食物用内置库中的默认数值预填，便于在此基础上微调
    const defaults = entry.value?.defaults?.foodProperties
    const edible = entry.value?.edible === true
    draft.value.foodProperties = {
      nutrition: edible ? defaults?.hunger ?? null : null,
      saturation: edible ? defaults?.saturation ?? null : null,
      canAlwaysEat: defaults?.canAlwaysEat ?? null,
      eatSeconds: defaults?.eatSeconds ?? null,
      effects: [],
      remove: false
    }
  }
})

function addEffect(): void {
  draft.value.foodProperties.effects.push(createEmptyEffect())
}

function removeEffect(index: number): void {
  draft.value.foodProperties.effects.splice(index, 1)
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <span>属性编辑</span>
    </div>

    <div class="panel-body">
      <div v-if="!currentTarget" class="empty-placeholder">
        <div>从左侧选择物品，或手动输入物品 ID</div>
        <div class="hint">选择后可修改堆叠数、耐久、燃烧时间、稀有度，以及工具物品的挖掘与攻击属性</div>
      </div>

      <template v-else>
        <el-descriptions :column="1" border size="small" class="info-card">
          <el-descriptions-item label="物品名称">
            {{ currentTarget.displayName }}
            <el-tag size="small" type="info" class="tag-gap">
              {{ categoryLabel(currentTarget.entry.category) }}
            </el-tag>
            <el-tag v-if="isEditingQueue" size="small" type="warning" class="tag-gap">编辑队列项</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="注册名">
            <span class="mono">{{ currentTarget.itemId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="默认数值">{{ defaultSummary }}</el-descriptions-item>
          <el-descriptions-item label="当前模板">
            {{ activeProfile.label }}
          </el-descriptions-item>
        </el-descriptions>

        <el-form label-width="128px" label-position="left" size="default" class="property-form">
          <div class="section-title">通用属性</div>

          <el-form-item label="最大堆叠数">
            <el-input-number
              v-model="draft.maxStackSize"
              :min="1"
              :max="maxStackLimit"
              :step="1"
              controls-position="right"
            />
            <div class="hint">上限 {{ maxStackLimit }}（MC 1.20.5+ 数据组件才允许至 99）</div>
          </el-form-item>

          <el-form-item label="最大耐久度">
            <el-input-number v-model="draft.maxDamage" :min="0" :step="10" controls-position="right" />
            <div class="hint">仅对有耐久度的物品生效</div>
          </el-form-item>

          <el-form-item label="燃烧时间">
            <el-input-number v-model="draft.burnTime" :min="0" :step="100" controls-position="right" />
            <div class="hint">单位 tick，煤炭为 1600</div>
          </el-form-item>

          <el-form-item label="抗火">
            <el-select v-model="draft.fireResistant" placeholder="不修改" clearable class="wide-select">
              <el-option label="是（火/岩浆中不烧毁）" :value="true" />
              <el-option label="否" :value="false" />
            </el-select>
          </el-form-item>

          <el-form-item label="稀有度">
            <el-select v-model="draft.rarity" placeholder="不修改" clearable class="wide-select">
              <el-option v-for="rarity in RARITIES" :key="rarity" :label="rarityLabel(rarity)" :value="rarity" />
            </el-select>
          </el-form-item>

          <el-form-item label="合成剩余物">
            <el-input v-model="draft.craftingRemainder" placeholder="例如 minecraft:scute" clearable />
            <div class="hint">生成写法：Item.of('...').item</div>
          </el-form-item>

          <template v-if="showTier">
            <el-divider />
            <div class="section-title">工具 / 武器属性</div>

            <el-form-item label="挖掘速度">
              <el-input-number
                v-model="draft.tier.speed"
                :min="0"
                :max="100"
                :step="0.5"
                controls-position="right"
                :disabled="!canSetDigSpeed"
              />
              <div class="hint">{{ digSpeedHint }}</div>
            </el-form-item>

            <el-form-item label="攻击伤害加成">
              <el-input-number
                v-model="draft.tier.attackDamageBonus"
                :min="-100"
                :max="100"
                :step="1"
                controls-position="right"
                :disabled="!canSetAttackDamage"
              />
              <div class="hint">{{ attackDamageHint }}</div>
            </el-form-item>

            <el-form-item label="攻击速度">
              <el-input-number
                v-model="draft.tier.attackSpeed"
                :min="-4"
                :max="4"
                :step="0.1"
                :precision="2"
                controls-position="right"
              />
              <div class="hint">{{ attackSpeedHint }}</div>
            </el-form-item>

            <el-form-item label="工具等级">
              <el-input-number
                v-model="draft.tier.level"
                :min="0"
                :max="255"
                :step="1"
                controls-position="right"
                :disabled="activeProfile.tierStyle === 'direct'"
              />
              <div class="hint">木/金 0、石 1、铁 2、钻石 3、下界合金 4；{{ tierOnlyHint }}</div>
              <div v-if="activeProfile.tierStyle !== 'direct'" class="hint">
                实测：挖掘等级会被限制在铁镐（2）——低于铁镐的工具最高只能提升到铁镐，高于铁镐的工具最低只能降到铁镐（游戏 / 模组侧限制）
              </div>
            </el-form-item>

            <el-form-item label="铁砧修复材料">
              <el-input
                v-model="draft.tier.repairIngredient"
                placeholder="例如 minecraft:diamond"
                clearable
                :disabled="activeProfile.tierStyle === 'direct'"
              />
              <div class="hint">{{ tierOnlyHint }}</div>
            </el-form-item>
          </template>

          <template v-if="showArmor">
            <el-divider />
            <div class="section-title">护甲属性</div>

            <el-form-item label="护甲值">
              <el-input-number
                v-model="draft.armor.protection"
                :min="0"
                :max="20"
                :step="1"
                :precision="1"
                controls-position="right"
              />
              <div class="hint">原版单件 1 ~ 8（各部位数值不同，详见使用手册），护甲条满格为 20</div>
            </el-form-item>

            <el-form-item label="盔甲韧性">
              <el-input-number
                v-model="draft.armor.toughness"
                :min="0"
                :max="20"
                :step="0.5"
                :precision="2"
                controls-position="right"
              />
              <div class="hint">护甲值旁的灰条：原版仅钻石 / 下界合金提供，每件 +2；留空表示不修改</div>
            </el-form-item>
          </template>

          <el-divider />
          <div class="section-title">
            <span>食物属性（FoodTweaker）</span>
            <el-switch v-model="foodEnabled" size="small" active-text="启用" inline-prompt />
          </div>
          <div class="hint section-hint">
            由 FoodTweaker 模组读取 <span class="mono">config/foodtweaker.json</span> 生效（与 KubeJS 脚本无关）；
            未填写的字段保持物品当前数值。
          </div>

          <el-alert
            v-if="foodEnabled && !foodModInstalled"
            type="warning"
            :closable="false"
            show-icon
            class="section-alert"
            title="未在 mods 目录中检测到 FoodTweaker，写入后需要安装该模组才会生效"
          />
          <el-alert
            v-else-if="foodEnabled && !isEdible"
            type="info"
            :closable="false"
            show-icon
            class="section-alert"
            title="该物品当前不是食物：营养值与饱和度必须同时填写，FoodTweaker 才会把它变为可食用"
          />

          <template v-if="foodEnabled">
            <el-form-item label="清除食物覆盖">
              <el-switch v-model="draft.foodProperties.remove" />
              <div class="hint">开启后从配置中移除该物品的条目，恢复原版数值（其余字段不再生效）</div>
            </el-form-item>

            <template v-if="!draft.foodProperties.remove">
              <el-form-item label="营养值">
                <el-input-number
                  v-model="draft.foodProperties.nutrition"
                  :min="0"
                  :max="20"
                  :step="1"
                  controls-position="right"
                />
                <div class="hint">饥饿值恢复量，2 = 半个鸡腿（原版苹果 4、牛排 8）；留空表示不修改</div>
              </el-form-item>

              <el-form-item label="饱和度倍率">
                <el-input-number
                  v-model="draft.foodProperties.saturation"
                  :min="0"
                  :max="5"
                  :step="0.1"
                  :precision="2"
                  controls-position="right"
                />
                <div class="hint">
                  为倍率而非最终值：实际饱和度 = 营养值 × 倍率 × 2<span v-if="saturationEstimate != null">
                    ，当前估算 {{ saturationEstimate }}</span
                  >
                </div>
              </el-form-item>

              <el-form-item label="随时可食用">
                <el-select v-model="draft.foodProperties.canAlwaysEat" placeholder="不修改" clearable class="wide-select">
                  <el-option label="是（饥饿值满时仍可食用）" :value="true" />
                  <el-option label="否" :value="false" />
                </el-select>
              </el-form-item>

              <el-form-item label="食用耗时">
                <el-input-number
                  v-model="draft.foodProperties.eatSeconds"
                  :min="0.05"
                  :max="60"
                  :step="0.05"
                  :precision="2"
                  controls-position="right"
                />
                <div class="hint">
                  单位秒；≤ 0.8 为快速食用（如干海带），其余按标准速度（约 1.6 秒）——MC 1.20.1 只区分这两档
                </div>
              </el-form-item>

              <el-form-item label="食用效果">
                <div class="effects">
                  <div v-if="draft.foodProperties.effects.length > 0" class="effect-head">
                    <span>效果 ID</span>
                    <span>持续（秒）</span>
                    <span>等级</span>
                    <span>概率</span>
                    <span>显示</span>
                    <span></span>
                  </div>
                  <div v-for="(effect, index) in draft.foodProperties.effects" :key="index" class="effect-row">
                    <el-select
                      v-model="effect.id"
                      size="small"
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
                      :min="0.1"
                      :max="3600"
                      :step="5"
                      :precision="1"
                      controls-position="right"
                    />
                    <el-tooltip :content="`等级 ${romanLevel(effect.amplifier)}（0 = I 级）`" placement="top">
                      <el-input-number
                        v-model="effect.amplifier"
                        size="small"
                        :min="0"
                        :max="255"
                        controls-position="right"
                      />
                    </el-tooltip>
                    <el-input-number
                      v-model="effect.probability"
                      size="small"
                      :min="0"
                      :max="1"
                      :step="0.05"
                      :precision="2"
                      controls-position="right"
                    />
                    <span class="effect-flags">
                      <el-tooltip content="环境粒子（更柔和的效果粒子）" placement="top">
                        <el-checkbox v-model="effect.ambient" size="small" />
                      </el-tooltip>
                      <el-tooltip content="显示效果粒子" placement="top">
                        <el-checkbox v-model="effect.showParticles" size="small" />
                      </el-tooltip>
                      <el-tooltip content="显示 HUD 效果图标" placement="top">
                        <el-checkbox v-model="effect.showIcon" size="small" />
                      </el-tooltip>
                    </span>
                    <el-button size="small" type="danger" link :icon="Delete" @click="removeEffect(index)" />
                  </div>
                  <div class="hint">
                    效果 ID 可从下拉列表选择原版效果，也可直接输入模组效果 ID；
                    等级 0 = I 级；填写效果列表会替换该物品原有的全部食用效果，留空则保留原效果
                  </div>
                  <el-button size="small" :icon="Plus" @click="addEffect">添加食用效果</el-button>
                </div>
              </el-form-item>
            </template>
          </template>
        </el-form>

        <div v-if="draftValidation.errors.length > 0" class="validation">
          <el-alert type="error" :closable="false" show-icon title="校验错误（需修正后才能加入队列）">
            <ul class="validation-list">
              <li v-for="error in draftValidation.errors" :key="error">{{ error }}</li>
            </ul>
          </el-alert>
        </div>

        <div v-if="draftValidation.warnings.length > 0" class="validation">
          <el-alert type="warning" :closable="false" show-icon title="提示">
            <ul class="validation-list">
              <li v-for="warning in draftValidation.warnings" :key="warning">{{ warning }}</li>
            </ul>
          </el-alert>
        </div>
      </template>
    </div>

    <div v-if="currentTarget" class="panel-footer">
      <el-button type="primary" @click="upsertQueue">
        {{ isEditingQueue ? '更新队列项' : '添加到队列' }}
      </el-button>
      <el-button @click="resetDraft">清空表单</el-button>
    </div>
  </div>
</template>

<style scoped>
.info-card {
  margin-bottom: 14px;
}

.tag-gap {
  margin-left: 6px;
}

.property-form {
  padding-bottom: 8px;
}

.wide-select {
  width: 100%;
}

.section-hint {
  margin: -4px 0 10px;
}

.section-alert {
  margin-bottom: 12px;
}

.effects {
  width: 100%;
}

.effect-head,
.effect-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 0.9fr) 92px 32px;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.effect-head {
  font-size: 12px;
  color: #5b6472;
}

.effect-flags {
  display: flex;
  align-items: center;
  gap: 4px;
}

.effect-flags :deep(.el-checkbox) {
  margin-right: 0;
}

/* 效果 ID 下拉框占满所在网格列 */
.effect-row :deep(.el-select) {
  width: 100%;
}

.validation {
  margin-top: 10px;
}

.validation-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
</style>
