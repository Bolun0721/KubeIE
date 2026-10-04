import { app, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { initDataDir } from './appData'
import { registerIpcHandlers } from './ipc'

// 必须早于 app ready：便携模式下把 userData 一并指到程序目录（data/），
// 之后的配置与写入记录都会落在程序目录，实现解压即用。
initDataDir()

/** 软件图标：随包放在 asar 的 assets/icon.ico（开发态即项目里的 assets/icon.ico） */
function resolveIconPath(): string | undefined {
  const candidate = path.join(app.getAppPath(), 'assets', 'icon.ico')
  return fs.existsSync(candidate) ? candidate : undefined
}

/** 主进程入口：创建窗口并注册 IPC 路由 */
function createWindow(): void {
  const icon = resolveIconPath()
  const window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'KubeIE',
    ...(icon ? { icon } : {}),
    backgroundColor: '#eef1f6',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.setAppUserModelId('com.trae.kubejs.itemeditor')

void app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
