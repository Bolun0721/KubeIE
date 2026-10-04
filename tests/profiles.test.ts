import { describe, expect, it } from 'vitest'
import { KUBEJS_PROFILES, getProfile, isMcVersionSupported, suggestProfileId } from '../src/shared/profiles'

describe('KubeJS 模板', () => {
  it('默认模板即 1.20.1 Forge 的目标模板', () => {
    const profile = getProfile(undefined)
    expect(profile.id).toBe('kjs6-1.20')
    expect(profile.maxStackSizeLimit).toBe(64)
  })

  it('各模板的标注与实际配置一致', () => {
    const ids = KUBEJS_PROFILES.map((profile) => profile.id)
    expect(ids).toEqual(['kjs6-1.20', 'kjs6-1.20-direct', 'kjs7-1.21'])

    // tier 回调已失效：默认模板也使用直接属性（digSpeed / attackDamage）
    const direct = getProfile('kjs6-1.20-direct')
    expect(direct.tierStyle).toBe('direct')
    expect(getProfile('kjs6-1.20').tierStyle).toBe('callback')
    expect(getProfile('kjs7-1.21').maxStackSizeLimit).toBe(99)
  })

  it('按 MC 版本推荐模板', () => {
    expect(suggestProfileId('1.20.1')).toBe('kjs6-1.20')
    expect(suggestProfileId('1.19.2')).toBe('kjs6-1.20')
    expect(suggestProfileId('1.21.1')).toBe('kjs7-1.21')
    expect(suggestProfileId('1.20.6')).toBe('kjs7-1.21')
    expect(suggestProfileId(undefined)).toBe('kjs6-1.20')
  })
})

describe('isMcVersionSupported', () => {
  const kjs6 = getProfile('kjs6-1.20')
  const kjs7 = getProfile('kjs7-1.21')

  it('区间写法：1.19 ~ 1.20.4 不产生误报（回归：此前 1.20.1 会被判为不匹配）', () => {
    expect(isMcVersionSupported(kjs6, '1.20.1')).toBe(true)
    expect(isMcVersionSupported(kjs6, '1.19')).toBe(true)
    expect(isMcVersionSupported(kjs6, '1.20.4')).toBe(true)
    expect(isMcVersionSupported(kjs6, '1.20.5')).toBe(false)
    expect(isMcVersionSupported(kjs6, '1.18.2')).toBe(false)
  })

  it('下限写法：1.21+ 接受更高版本', () => {
    expect(isMcVersionSupported(kjs7, '1.21')).toBe(true)
    expect(isMcVersionSupported(kjs7, '1.21.1')).toBe(true)
    expect(isMcVersionSupported(kjs7, '1.22')).toBe(true)
    expect(isMcVersionSupported(kjs7, '1.20.1')).toBe(false)
  })

  it('版本号无法解析时不提示', () => {
    expect(isMcVersionSupported(kjs6, '未知')).toBe(true)
    expect(isMcVersionSupported(kjs6, '')).toBe(true)
  })
})
