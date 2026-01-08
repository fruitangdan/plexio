// Preload script to inject Electron detection flag
// This runs in a context that has access to both Node.js and the renderer

const { contextBridge } = require('electron');

// Inject a flag so the renderer can detect it's running in Electron
contextBridge.exposeInMainWorld('__ELECTRON__', true);
