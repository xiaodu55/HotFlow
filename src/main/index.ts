import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { loadSettings, saveSettings } from './settings'
import type { AppSettings } from '@shared/types'

// 固定用户数据目录名，不随 productName 变化，避免改名/升级后历史数据"消失"
app.setName('hotflow')
app.setPath('userData', join(app.getPath('appData'), 'hotflow'))

let cachedSettings: AppSettings | null = null

function createWindow(): void {
  const bounds = cachedSettings?.windowBounds
  const win = new BrowserWindow({
    width: bounds?.width ?? 1380,
    height: bounds?.height ?? 880,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'HotFlow 视频运营分析',
    backgroundColor: '#070b16',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  // 防抖记录窗口位置与大小，下次启动恢复
  let saveTimer: NodeJS.Timeout | null = null
  const currentWithBounds = (b: AppSettings['windowBounds']): AppSettings => {
    const current = cachedSettings ?? { llm: { provider: 'deepseek' as const, baseURL: '', apiKey: '', model: '' } }
    return { ...current, windowBounds: b }
  }
  const rememberBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return
      void saveSettings(currentWithBounds(win.getBounds())).catch(() => undefined)
    }, 300)
  }
  win.on('resize', rememberBounds)
  win.on('move', rememberBounds)

  // 退出兜底：防抖窗口内快速退出也能保住最后一次位置（拦截一次 close，落盘后 destroy）
  let boundsFlushed = false
  win.on('close', (e) => {
    if (boundsFlushed || win.isDestroyed()) return
    boundsFlushed = true
    e.preventDefault()
    // 最小化/最大化时 bounds 不可靠，沿用上次保存值（与防抖路径同一取舍：不持久化最大化状态）
    const keepPrev = win.isMinimized() || win.isMaximized()
    const next = keepPrev ? cachedSettings?.windowBounds ?? null : win.getBounds()
    void saveSettings(currentWithBounds(next ?? undefined))
      .catch(() => undefined)
      .finally(() => {
        if (!win.isDestroyed()) win.destroy()
      })
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  cachedSettings = await loadSettings().catch(() => null)
  if (!process.env.ELECTRON_RENDERER_URL) {
    Menu.setApplicationMenu(null)
  }
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
