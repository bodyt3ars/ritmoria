const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("RitmoriaDesktop", {
  isDesktop: true,
  platform: process.platform
});
