import { app, BrowserWindow, ipcMain } from 'electron';
import { getAudioStream } from '../../../sender/capture/audio_capture';
import { getVideoStream } from '../../../sender/capture/video_capture';
import { startSender } from '../../../sender/sender';

import path from 'path';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadURL('http://localhost:5173');
}


ipcMain.handle('toggle-stream', async () => {
  const video = await getVideoStream();
  const audio = await getAudioStream();
  await startSender(video, audio);
});


app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('toggle-stream', () => {
    console.log('[Electron] Stream toggled');
    // In future: call sender/receiver logic
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
