import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDb } from './store/db'
import { registerIpc } from './ipc'
import { registerSageIpc } from './sage/ipc'

let win: BrowserWindow | null = null

function createWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return
  }
  const appIcon = join(__dirname, '../../resources/icon.png')
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    icon: appIcon,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f0e17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win?.show()
    win?.focus()
    if (process.platform === 'darwin') app.dock?.show()
  })
  win.on('closed', () => {
    win = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpc(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Development/testing only: isolate app data (profile, jobs, browser session) in a separate folder.
if (!app.isPackaged && process.env.SAGE_USER_DATA_DIR) app.setPath('userData', process.env.SAGE_USER_DATA_DIR)

// Prevent duplicate hidden instances; focus the existing window instead.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
    initDb()
    registerSageIpc(() => win)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else {
        win?.show()
        win?.focus()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
