import { contextBridge, ipcRenderer } from 'electron'
import type { CurioLibrary, CuriosSlotConfig } from '@shared/curios'
import type { CustomItemLibrary } from '@shared/customItems'
import type {
  AppConfig,
  CurioWritePayload,
  CuriosConfigWritePayload,
  CustomItemWritePayload,
  ItemModification,
  ItemQuery,
  KubeJsProfileId,
  RecipeEntry,
  RecipeWritePayload,
  RendererApi,
  WritePayload
} from '@shared/types'

/**
 * 通信桥（contextBridge）：仅暴露白名单 API，渲染进程无 Node 权限。
 */
const api: RendererApi = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    setPortable: (enabled: boolean) => ipcRenderer.invoke('app:set-portable', enabled),
    relaunch: () => ipcRenderer.invoke('app:relaunch')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (patch: Partial<AppConfig>) => ipcRenderer.invoke('config:set', patch)
  },
  detection: {
    scan: () => ipcRenderer.invoke('detect:scan'),
    inspect: (dir: string) => ipcRenderer.invoke('detect:inspect', dir),
    pick: () => ipcRenderer.invoke('detect:pick')
  },
  items: {
    query: (query: ItemQuery) => ipcRenderer.invoke('items:query', query),
    facets: () => ipcRenderer.invoke('items:facets')
  },
  script: {
    preview: (modifications: ItemModification[], profileId?: KubeJsProfileId) =>
      ipcRenderer.invoke('script:preview', modifications, profileId),
    targetInfo: () => ipcRenderer.invoke('script:target-info'),
    write: (payload: WritePayload) => ipcRenderer.invoke('script:write', payload)
  },
  records: {
    list: () => ipcRenderer.invoke('records:list'),
    clear: () => ipcRenderer.invoke('records:clear'),
    listRecipes: () => ipcRenderer.invoke('records:list-recipes'),
    clearRecipes: () => ipcRenderer.invoke('records:clear-recipes'),
    listCustom: () => ipcRenderer.invoke('records:list-custom'),
    clearCustom: () => ipcRenderer.invoke('records:clear-custom'),
    listCurios: () => ipcRenderer.invoke('records:list-curios'),
    clearCurios: () => ipcRenderer.invoke('records:clear-curios')
  },
  recipe: {
    preview: (entries: RecipeEntry[]) => ipcRenderer.invoke('recipe:preview', entries),
    targetInfo: () => ipcRenderer.invoke('recipe:target-info'),
    write: (payload: RecipeWritePayload) => ipcRenderer.invoke('recipe:write', payload)
  },
  custom: {
    get: () => ipcRenderer.invoke('custom:get'),
    save: (library: CustomItemLibrary) => ipcRenderer.invoke('custom:save', library),
    preview: (library: CustomItemLibrary) => ipcRenderer.invoke('custom:preview', library),
    targetInfo: () => ipcRenderer.invoke('custom:target-info'),
    write: (payload: CustomItemWritePayload) => ipcRenderer.invoke('custom:write', payload)
  },
  curios: {
    get: () => ipcRenderer.invoke('curios:get'),
    save: (library: CurioLibrary) => ipcRenderer.invoke('curios:save', library),
    preview: (library: CurioLibrary) => ipcRenderer.invoke('curios:preview', library),
    targetInfo: () => ipcRenderer.invoke('curios:target-info'),
    write: (payload: CurioWritePayload) => ipcRenderer.invoke('curios:write', payload),
    configPreview: (slots: CuriosSlotConfig[]) => ipcRenderer.invoke('curios:config-preview', slots),
    configTargetInfo: () => ipcRenderer.invoke('curios:config-target-info'),
    configWrite: (payload: CuriosConfigWritePayload) =>
      ipcRenderer.invoke('curios:config-write', payload),
    info: () => ipcRenderer.invoke('curios:info')
  },
  food: {
    info: () => ipcRenderer.invoke('food:info')
  },
  shell: {
    openPath: (target: string) => ipcRenderer.invoke('shell:open-path', target),
    openManual: () => ipcRenderer.invoke('shell:open-manual')
  }
}

contextBridge.exposeInMainWorld('api', api)
