// tray-app/main.ts
import { app, Tray, Menu, dialog, Event } from 'electron';
import path from 'path';
import { spawn } from 'child_process';

let tray: Tray | null = null;
let senderProcess: any = null;

function createTray() {
  // Always resolve icon relative to the project root, not dist
  const iconPath = path.join(__dirname, '..', 'icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Start Streaming',
      click: () => {
        if (!senderProcess) {
          senderProcess = spawn('node', [path.resolve(__dirname, '..', '..', 'sender', 'dist', 'sender.js')], {
            stdio: 'inherit',
            shell: false, // Use false for better module support
          });
          tray?.setToolTip('Streaming: Active ✅');
        } else {
          dialog.showMessageBox({
            type: 'info',
            message: 'Streaming already running.',
          });
        }
      },
    },
    {
      label: 'Stop Streaming',
      click: () => {
        if (senderProcess) {
          senderProcess.kill();
          senderProcess = null;
          tray?.setToolTip('Streaming: Stopped ❌');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Exit App',
      click: () => {
        senderProcess?.kill();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Streaming: Idle ⚪');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createTray();
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault(); // Prevent quitting app when no windows
});