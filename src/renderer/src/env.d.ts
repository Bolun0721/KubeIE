/// <reference types="vite/client" />

import type { RendererApi } from '@shared/types'

declare global {
  interface Window {
    /** preload 通过 contextBridge 暴露的白名单 API */
    api: RendererApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
