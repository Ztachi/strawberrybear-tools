/** 仅替换平台窗口端口；页面、会话协议、独立页面、Vue 和 antdv 均运行真实实现。 */
import type {
  EditorClientPort,
  EditorRequest,
  EditorUpdate,
  EditorWindowPort,
} from '@/features/piano-editor'

export function browserEditorWindowPort(): EditorWindowPort {
  let child: Window | null = null
  return {
    async open(session) {
      child = window.open(
        `/tests/browser/piano-editor-window.html?session=${session}`,
        '_blank',
        'popup,width=1100,height=640'
      )
      if (!child) throw new Error('Popup was blocked')
      const target = child
      return {
        destroy: async () => target.close(),
        focus: async () => target.focus(),
        onDestroyed: async (callback) => {
          const timer = window.setInterval(() => {
            if (target.closed) {
              clearInterval(timer)
              callback()
            }
          }, 50)
          return () => clearInterval(timer)
        },
      }
    },
    async listen(callback) {
      const listener = (event: MessageEvent<{ request: EditorRequest }>) => {
        if (event.origin === location.origin && event.source === child && event.data.request)
          callback(event.data.request)
      }
      window.addEventListener('message', listener)
      return () => window.removeEventListener('message', listener)
    },
    async send(update) {
      child?.postMessage({ update }, location.origin)
    },
  }
}

export function browserEditorClientPort(): EditorClientPort {
  return {
    async listen(callback) {
      const listener = (event: MessageEvent<{ update: EditorUpdate }>) => {
        if (event.origin === location.origin && event.source === window.opener && event.data.update)
          callback(event.data.update)
      }
      window.addEventListener('message', listener)
      return () => window.removeEventListener('message', listener)
    },
    async send(request) {
      window.opener?.postMessage({ request }, location.origin)
    },
    async show() {},
    async destroy() {
      window.close()
    },
    async setTitle(title) {
      document.title = title
    },
    async onCloseRequested(callback) {
      // 浏览器本身没有可取消的原生关窗事件；测试事件模拟 Tauri 的 closeRequested 端口。
      window.addEventListener('test-native-close', callback)
      return () => window.removeEventListener('test-native-close', callback)
    },
  }
}
