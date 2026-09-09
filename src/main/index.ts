import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'

// 固定用户数据目录名，不随 productName 变化，避免改名/升级后历史数据"消失"
app.setName('hotflow')
app.setPath('userData', join(app.getPath('appData'), 'hotflow'))

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'HotFlow 视频运营分析',
    backgroundColor: '#f4f6f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
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
