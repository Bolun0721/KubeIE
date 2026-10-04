import type { KubeJsProfile, KubeJsProfileId } from './types'

/**
 * 内置多版本模板（开发方案九、风险应对：KubeJS 版本差异）。
 * 默认使用 kjs6-1.20：Minecraft 1.19 ~ 1.20.4 + KubeJS 6，即本项目目标环境 1.20.1 Forge。
 */
export const KUBEJS_PROFILES: KubeJsProfile[] = [
  {
    id: 'kjs6-1.20',
    label: 'KubeJS 6 · MC 1.19 ~ 1.20.4（推荐）',
    mcVersions: '1.19 ~ 1.20.4',
    kubejs: 'KubeJS 6',
    maxStackSizeLimit: 64,
    tierStyle: 'callback',
    notes:
      '目标版本 1.20.1 Forge 使用本模板。挖掘速度 / 攻击伤害 / 攻击速度使用 item.digSpeed / item.attackDamage / item.attackSpeed；挖掘等级 / 修复材料只能通过 tier 回调设置，而该 API 已被官方标记为失效（issue #662），生成时会附带说明注释。'
  },
  {
    id: 'kjs6-1.20-direct',
    label: 'KubeJS 6 · MC 1.19 ~ 1.20.4（不生成 tier 代码）',
    mcVersions: '1.19 ~ 1.20.4',
    kubejs: 'KubeJS 6',
    maxStackSizeLimit: 64,
    tierStyle: 'direct',
    notes:
      '与推荐模板相同地使用 item.digSpeed / item.attackDamage / item.attackSpeed，但对只能靠已失效的 tier 回调设置的属性（挖掘等级 / 修复材料）只写注释、不生成代码，适合希望脚本保持干净的用户。'
  },
  {
    id: 'kjs7-1.21',
    label: 'KubeJS 7 · MC 1.21+',
    mcVersions: '1.21+',
    kubejs: 'KubeJS 7',
    maxStackSizeLimit: 99,
    tierStyle: 'direct',
    notes:
      '1.21+ 使用数据组件体系，最大堆叠数上限放宽至 99；工具属性只生成 item.digSpeed，依赖已失效 tier 回调的挖掘等级 / 修复材料不生成。'
  }
]

export const DEFAULT_PROFILE_ID: KubeJsProfileId = 'kjs6-1.20'

export function getProfile(id?: string | null): KubeJsProfile {
  const found = KUBEJS_PROFILES.find((p) => p.id === id)
  if (found) return found
  const fallback = KUBEJS_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID)
  return fallback as KubeJsProfile
}

/** 根据探测到的 Minecraft 版本推荐模板 */
export function suggestProfileId(mcVersion?: string): KubeJsProfileId {
  if (!mcVersion) return DEFAULT_PROFILE_ID
  const [major, minor, patch] = mcVersion.split('.').map((n) => Number.parseInt(n, 10))
  if (Number.isNaN(major)) return DEFAULT_PROFILE_ID
  if (major > 1 || (major === 1 && minor >= 21)) return 'kjs7-1.21'
  if (major === 1 && minor >= 20 && patch >= 5) return 'kjs7-1.21'
  return DEFAULT_PROFILE_ID
}

function parseVersion(value?: string): number[] | null {
  const matched = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec((value ?? '').trim())
  if (!matched) return null
  return [Number(matched[1]), Number(matched[2]), Number(matched[3] ?? 0)]
}

function compareVersion(a: number[], b: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

/**
 * 判断检测到的 Minecraft 版本是否落在模板适配范围内。
 * 支持 '1.19 ~ 1.20.4'（区间）与 '1.21+'（下限）两种写法；
 * 版本无法解析时返回 true（不产生误报提示）。
 */
export function isMcVersionSupported(profile: KubeJsProfile, version: string): boolean {
  const target = parseVersion(version)
  if (!target) return true

  const [minRaw, maxRaw] = profile.mcVersions.split('~').map((item) => item.trim())
  const min = parseVersion(minRaw)
  if (!min) return true

  if (compareVersion(target, min) < 0) return false
  if (!maxRaw) return true

  const max = parseVersion(maxRaw)
  if (!max) return true
  return compareVersion(target, max) <= 0
}
