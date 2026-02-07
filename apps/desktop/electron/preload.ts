import { ipcRenderer, contextBridge } from 'electron'

const serverHost = process.env.DISPATCH_HOST ?? '127.0.0.1'
const serverPort = process.env.DISPATCH_PORT ?? '3001'
const serverUrl = `http://${serverHost}:${serverPort}`

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...listenerArgs) => listener(event, ...listenerArgs))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APIs you need here.
  // ...
})

contextBridge.exposeInMainWorld('dispatchApi', {
  request(payload: { path: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }) {
    return ipcRenderer.invoke('dispatch:request', payload)
  },
  getServerUrl() {
    return serverUrl
  },
  openExternal(url: string) {
    return ipcRenderer.invoke('dispatch:openExternal', url)
  },
})
