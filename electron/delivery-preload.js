const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deliveryAPI', {
  onStartDelivery: (callback) => {
    ipcRenderer.on('start-delivery', () => callback());
  },
  signalEnvelopeOpen: () => ipcRenderer.send('delivery-envelope-open'),
  signalDeliveryFinished: () => ipcRenderer.send('delivery-finished'),
});
