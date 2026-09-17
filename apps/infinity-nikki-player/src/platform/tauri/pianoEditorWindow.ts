import { LogicalPosition } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type {
  EditorClientPort,
  EditorRequest,
  EditorUpdate,
  EditorWindowPort,
} from '@/features/piano-editor'

export const PIANO_EDITOR_WINDOW = 'piano-editor'
export const PIANO_EDITOR_REQUEST = 'piano-editor-request'
export const PIANO_EDITOR_UPDATE = 'piano-editor-update'

/** 子窗口仅具有展示、关闭和定向事件端口。 */
export function createPianoEditorClientPort(): EditorClientPort {
  const current = getCurrentWebviewWindow()
  return {
    listen: async (callback) =>
      current.listen<EditorUpdate>(PIANO_EDITOR_UPDATE, (event) => callback(event.payload)),
    send: async (request) => current.emitTo('main', PIANO_EDITOR_REQUEST, request),
    setTitle: async (title) => current.setTitle(title),
    show: async () => current.show(),
    destroy: async () => current.destroy(),
    onCloseRequested: async (callback) =>
      current.onCloseRequested((event) => {
        event.preventDefault()
        callback()
      }),
  }
}

/**
 * 创建真正的独立 WebviewWindow，使用轻量入口，避免重复启动播放器和游戏按键监听。
 * @returns 主窗口使用的系统窗口及定向事件端口。
 */
export function createPianoEditorWindowPort(): EditorWindowPort {
  return {
    async open(session) {
      const existing = await WebviewWindow.getByLabel(PIANO_EDITOR_WINDOW)
      if (existing) await existing.destroy()
      const child = new WebviewWindow(PIANO_EDITOR_WINDOW, {
        url: `piano-editor.html?session=${encodeURIComponent(session)}`,
        title: 'Piano Roll',
        width: 1100,
        height: 640,
        minWidth: 720,
        minHeight: 480,
        center: true,
        visible: false,
        // 与主窗口一致：macOS 沉浸式系统交通灯，Windows 自定义窗口按钮。
        decorations: !/Windows/i.test(navigator.userAgent),
        titleBarStyle: 'overlay',
        hiddenTitle: true,
        trafficLightPosition: new LogicalPosition(10, 20),
        resizable: true,
        dragDropEnabled: false,
      })
      let unlistenMainClose: () => void
      try {
        // 构造完成不等于窗口创建成功；同时监听错误，交由宿主保留内嵌面板。
        await new Promise<void>((resolve, reject) => {
          void child.once('tauri://created', () => resolve()).catch(reject)
          void child
            .once('tauri://error', (event) => reject(new Error(String(event.payload))))
            .catch(reject)
        })
        unlistenMainClose = await getCurrentWebviewWindow().onCloseRequested(() => {
          void child.destroy().catch(() => undefined)
        })
      } catch (error) {
        // 平台监听注册失败时同样释放已创建的窗口，不能留下不可还原的隐藏窗口。
        await child.destroy().catch(() => undefined)
        throw error
      }
      return {
        destroy: async () => {
          unlistenMainClose()
          await child.destroy()
        },
        focus: async () => {
          await child.show()
          await child.setFocus()
        },
        onDestroyed: async (callback) =>
          child.once('tauri://destroyed', () => {
            unlistenMainClose()
            callback()
          }),
      }
    },
    listen: async (callback) =>
      getCurrentWebviewWindow().listen<EditorRequest>(PIANO_EDITOR_REQUEST, (event) =>
        callback(event.payload)
      ),
    send: async (update: EditorUpdate) =>
      getCurrentWebviewWindow().emitTo(PIANO_EDITOR_WINDOW, PIANO_EDITOR_UPDATE, update),
  }
}
