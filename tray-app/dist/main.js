"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// tray-app/main.ts
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
let tray = null;
let senderProcess = null;
function createTray() {
    // Always resolve icon relative to the project root, not dist
    const iconPath = path_1.default.join(__dirname, '..', 'icon.png');
    tray = new electron_1.Tray(iconPath);
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Start Streaming',
            click: () => {
                if (!senderProcess) {
                    senderProcess = (0, child_process_1.spawn)('node', [path_1.default.join(__dirname, '../sender/dist/sender.js')], {
                        stdio: 'inherit',
                        shell: false, // Use false for better module support
                    });
                    tray?.setToolTip('Streaming: Active ✅');
                }
                else {
                    electron_1.dialog.showMessageBox({
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
                electron_1.app.quit();
            },
        },
    ]);
    tray.setToolTip('Streaming: Idle ⚪');
    tray.setContextMenu(contextMenu);
}
electron_1.app.whenReady().then(() => {
    createTray();
});
electron_1.app.on('window-all-closed', (e) => {
    e.preventDefault(); // Prevent quitting app when no windows
});
//# sourceMappingURL=main.js.map