/** 浏览器回归测试端口：只替换 Tauri 窗口边界，编辑器会话和独立页面仍运行真实实现。 */
import type {
  MidiProjectEditorClientPort,
  MidiProjectEditorRequest,
  MidiProjectEditorUpdate,
  MidiProjectEditorWindowPort,
} from '@/features/midi-project-editor-window'

export function browserMidiProjectEditorWindowPort(): MidiProjectEditorWindowPort {
  let child: Window | null = null
  return {
    async open(session) {
      child = window.open(
        `/tests/browser/midi-project-editor-window.html?session=${encodeURIComponent(session)}`,
        '_blank',
        'popup,width=1180,height=760'
      )
      if (!child) throw new Error('Popup was blocked')
      const target = child
      return {
        destroy: async () => target.close(),
        focus: async () => target.focus(),
        onDestroyed: async (callback) => {
          const timer = window.setInterval(() => {
            if (!target.closed) return
            window.clearInterval(timer)
            callback()
          }, 50)
          return () => window.clearInterval(timer)
        },
      }
    },
    async listen(callback) {
      const listener = (event: MessageEvent<{ request: MidiProjectEditorRequest }>) => {
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

export function browserMidiProjectEditorClientPort(): MidiProjectEditorClientPort {
  return {
    async listen(callback) {
      const listener = (event: MessageEvent<{ update: MidiProjectEditorUpdate }>) => {
        if (event.origin === location.origin && event.source === window.opener && event.data.update)
          callback(event.data.update)
      }
      window.addEventListener('message', listener)
      return () => window.removeEventListener('message', listener)
    },
    async send(request) {
      window.opener?.postMessage({ request }, location.origin)
    },
    async setTitle(title) {
      document.title = title
    },
    async show() {},
    async destroy() {
      window.close()
    },
    async onCloseRequested(callback) {
      window.addEventListener('test-native-close', callback)
      return () => window.removeEventListener('test-native-close', callback)
    },
  }
}
