import { invoke } from '@tauri-apps/api/core'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type {
  MidiProjectEditorClientPort,
  MidiProjectEditorRequest,
  MidiProjectEditorUpdate,
  MidiProjectEditorWindowPort,
} from '@/features/midi-project-editor-window'

export const MIDI_PROJECT_EDITOR_WINDOW = 'midi-project-editor'
export const MIDI_PROJECT_EDITOR_REQUEST = 'midi-project-editor-request'
export const MIDI_PROJECT_EDITOR_UPDATE = 'midi-project-editor-update'

/** 独立 MIDI 编辑窗口使用的定向事件端口。 */
export function createMidiProjectEditorClientPort(): MidiProjectEditorClientPort {
  const current = getCurrentWebviewWindow()
  return {
    listen: async (callback) =>
      current.listen<MidiProjectEditorUpdate>(MIDI_PROJECT_EDITOR_UPDATE, (event) =>
        callback(event.payload)
      ),
    send: async (request) => current.emitTo('main', MIDI_PROJECT_EDITOR_REQUEST, request),
    setTitle: async (title) => current.setTitle(title),
    show: async () => invoke('show_detached_editor'),
    destroy: async () => current.destroy(),
    onCloseRequested: async (callback) =>
      current.onCloseRequested((event) => {
        event.preventDefault()
        callback()
      }),
  }
}

/**
 * @description: 创建单例 MIDI 项目编辑窗口
 * @param {string} session 当前窗口会话 ID
 * @return {Promise<import('@/features/midi-project-editor-window').MidiProjectEditorWindowHandle>} 窗口句柄
 */
async function openMidiProjectEditorWindow(session: string) {
  const stale = await WebviewWindow.getByLabel(MIDI_PROJECT_EDITOR_WINDOW)
  if (stale) await stale.destroy()
  const child = new WebviewWindow(MIDI_PROJECT_EDITOR_WINDOW, {
    url: `midi-project-editor.html?session=${encodeURIComponent(session)}`,
    title: 'MIDI Editor',
    width: 1180,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    center: true,
    visible: false,
    decorations: !/Windows/i.test(navigator.userAgent),
    titleBarStyle: 'overlay',
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(10, 20),
    resizable: true,
    dragDropEnabled: false,
  })
  let unlistenMainClose: () => void
  try {
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
    onDestroyed: async (callback: () => void) =>
      child.once('tauri://destroyed', () => {
        unlistenMainClose()
        callback()
      }),
  }
}

/** 主窗口使用的 MIDI 项目编辑窗口平台端口。 */
export function createMidiProjectEditorWindowPort(): MidiProjectEditorWindowPort {
  return {
    open: openMidiProjectEditorWindow,
    listen: async (callback) =>
      getCurrentWebviewWindow().listen<MidiProjectEditorRequest>(
        MIDI_PROJECT_EDITOR_REQUEST,
        (event) => callback(event.payload)
      ),
    send: async (update) =>
      getCurrentWebviewWindow().emitTo(
        MIDI_PROJECT_EDITOR_WINDOW,
        MIDI_PROJECT_EDITOR_UPDATE,
        update
      ),
  }
}
