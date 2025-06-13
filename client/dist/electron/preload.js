"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    toggleStream: () => electron_1.ipcRenderer.invoke('toggle-stream'),
    send: (channel, data) => {
        const validChannels = ['start-stream', 'stop-stream'];
        if (validChannels.includes(channel)) {
            electron_1.ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        const validChannels = ['stream-status'];
        if (validChannels.includes(channel)) {
            electron_1.ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    invoke: (channel, ...args) => {
        const validChannels = ['toggle-stream'];
        if (validChannels.includes(channel)) {
            return electron_1.ipcRenderer.invoke(channel, ...args);
        }
    }
});
