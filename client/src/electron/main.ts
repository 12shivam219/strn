import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the Vite dev server in development
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('https://client.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io');
    win.webContents.openDevTools();
  } else {
    // Load the built index.html from the dist folder
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

ipcMain.handle('toggle-stream', async () => {
  console.log('[Electron] Stream toggle requested');
  return { success: true, message: 'Stream toggled' };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});