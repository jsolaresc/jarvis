// Puente entre las ventanas (notch y ajustes) y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  pedir: (canal, ...datos) => ipcRenderer.invoke(canal, ...datos),
  enviar: (canal, ...datos) => ipcRenderer.send(canal, ...datos),
  escuchar: (canal, alRecibir) => {
    ipcRenderer.on(canal, (_evento, ...datos) => alRecibir(...datos));
  },
});
