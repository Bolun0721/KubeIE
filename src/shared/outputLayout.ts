/**
 * 生成脚本的输出目录分类。
 *
 * KubeJS 6 用 `Files.walk(脚本目录, 10, FOLLOW_LINKS)` 递归加载脚本，
 * 因此可以把不同用途的脚本放进子文件夹，KubeJS 一样能加载到（最多 10 层）。
 *
 * 目录约定（统一放在 KubeIE 下，避免和用户自己的脚本混在一起）：
 *   kubejs/startup_scripts/KubeIE/attributes/   ← 物品属性修改
 *   kubejs/server_scripts /KubeIE/recipes/      ← 配方
 *   kubejs/startup_scripts/KubeIE/items/        ← 自定义物品
 *   kubejs/startup_scripts/KubeIE/curios/       ← 自定义饰品（事件脚本在 server_scripts 同名分类下）
 *
 * 目录名用 ASCII，避免 Java 在不同平台编码下读目录名出现乱码；中文名在界面里展示。
 */

/** 分类根目录名 */
export const OUTPUT_ROOT = 'KubeIE'

export type OutputCategoryId = 'attributes' | 'recipes' | 'items' | 'curios'

export interface OutputCategory {
  id: OutputCategoryId
  /** 界面展示用的中文名 */
  label: string
  /** 脚本目录下的相对子路径（写入时传给 fileWriter 的 subDir） */
  subDir: string
}

export const OUTPUT_CATEGORIES: OutputCategory[] = [
  { id: 'attributes', label: '属性修改', subDir: `${OUTPUT_ROOT}/attributes` },
  { id: 'recipes', label: '配方', subDir: `${OUTPUT_ROOT}/recipes` },
  { id: 'items', label: '自定义物品', subDir: `${OUTPUT_ROOT}/items` },
  { id: 'curios', label: '饰品', subDir: `${OUTPUT_ROOT}/curios` }
]

/** 取某个分类的子目录（不存在时回退到根目录） */
export function outputSubDir(id: OutputCategoryId): string {
  return OUTPUT_CATEGORIES.find((category) => category.id === id)?.subDir ?? OUTPUT_ROOT
}

/** 分类中文名 */
export function outputCategoryLabel(id: OutputCategoryId): string {
  return OUTPUT_CATEGORIES.find((category) => category.id === id)?.label ?? id
}
