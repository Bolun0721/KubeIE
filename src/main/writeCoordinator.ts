import type { FoodWriteInfo, ItemModification, KubeJsProfileId, WriteResult } from '@shared/types'
import { outputSubDir } from '@shared/outputLayout'
import { hasFoodProperty, hasScriptProperty, validateModifications } from '@shared/validation'
import { getTargetInfo, writeScriptFile } from './fileWriter'
import { resolveFoodTarget, writeFoodConfig } from './foodTweakerConfig'

/**
 * 写入协调器：一次「应用修改」可能同时产出两类文件
 * 1) KubeJS 脚本（通用属性 / 工具属性）→ kubejs/startup_scripts/KubeIE/attributes/<文件名>.js
 * 2) FoodTweaker 配置（食物属性）→ config/foodtweaker.json
 *
 * 规则：
 * - 仅当队列中存在脚本属性时才写脚本，避免纯食物队列把已有脚本覆盖成空事件；
 * - 仅当队列中存在食物修改时才写配置文件；
 * - 写入前对整条队列统一校验，任一错误则两者都不写（避免只写入一半）。
 */

export interface CoordinatedWriteRequest {
  gameDir: string
  startupScriptsDir: string
  backupDir: string
  outputFileName: string
  backupEnabled: boolean
  profileId: KubeJsProfileId
  modifications: ItemModification[]
  fileName?: string
  backup?: boolean
}

export interface CoordinatedWriteResult extends WriteResult {
  /** 本次写入 KubeJS 脚本的物品数量（0 表示未写脚本） */
  scriptItemCount: number
}

export function writeCoordinated(request: CoordinatedWriteRequest): CoordinatedWriteResult {
  const modifications = request.modifications ?? []

  if (modifications.length === 0) {
    return {
      ok: false,
      errors: ['修改队列为空，请先添加要修改的物品'],
      warnings: [],
      message: '没有可写入的内容',
      scriptItemCount: 0
    }
  }

  const validation = validateModifications(modifications, request.profileId)
  if (validation.errors.length > 0) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      message: '属性校验未通过，已取消写入',
      scriptItemCount: 0
    }
  }

  const scriptModifications = modifications.filter((item) => hasScriptProperty(item.properties))
  const foodModifications = modifications.filter((item) => hasFoodProperty(item.properties))
  const backupEnabled = request.backup ?? request.backupEnabled

  // 写入前先校验两个目标路径，任一非法则不写入任何文件（避免只写入一半）
  if (scriptModifications.length > 0) {
    const target = getTargetInfo({
      gameDir: request.gameDir,
      startupScriptsDir: request.startupScriptsDir,
      backupDir: request.backupDir,
      fileName: request.fileName || request.outputFileName,
      subDir: outputSubDir('attributes')
    })
    if (!target.filePath) {
      return {
        ok: false,
        errors: ['KubeJS 脚本目标路径无效，请检查游戏目录、startup_scripts 目录与输出文件名'],
        warnings: validation.warnings,
        message: '路径校验失败',
        scriptItemCount: 0
      }
    }
  }
  if (foodModifications.length > 0) {
    const target = resolveFoodTarget(request.gameDir)
    if (!target.ok) {
      return {
        ok: false,
        errors: [target.error],
        warnings: validation.warnings,
        message: '路径校验失败',
        scriptItemCount: 0
      }
    }
  }

  const errors: string[] = []
  const warnings: string[] = [...validation.warnings]
  let scriptResult: WriteResult | null = null
  let foodInfo: FoodWriteInfo | undefined

  if (scriptModifications.length > 0) {
    scriptResult = writeScriptFile({
      gameDir: request.gameDir,
      startupScriptsDir: request.startupScriptsDir,
      backupDir: request.backupDir,
      fileName: request.fileName || request.outputFileName,
      subDir: outputSubDir('attributes'),
      modifications: scriptModifications,
      profileId: request.profileId,
      backupEnabled
    })
    errors.push(...scriptResult.errors)
    warnings.push(...scriptResult.warnings)
  }

  if (foodModifications.length > 0) {
    const foodResult = writeFoodConfig({
      gameDir: request.gameDir,
      backupDir: request.backupDir,
      modifications: foodModifications,
      backupEnabled
    })
    warnings.push(...foodResult.warnings)
    if (foodResult.ok) foodInfo = foodResult.info
    else errors.push(...foodResult.errors)
  }

  const ok = errors.length === 0
  const parts: string[] = []
  if (scriptResult?.ok) parts.push('KubeJS 脚本已更新')
  if (foodInfo) parts.push('FoodTweaker 配置已更新')

  return {
    ok,
    filePath: scriptResult?.ok ? scriptResult.filePath : undefined,
    backupPath: scriptResult?.backupPath,
    code: scriptResult?.code,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    message: ok ? parts.join('；') || '写入成功' : '写入失败',
    food: foodInfo,
    scriptItemCount: scriptResult?.ok ? scriptModifications.length : 0
  }
}
