import { afterEach, expect, it, vi } from 'vitest'
import { createMidiProjectEditorWindowPort } from './midiProjectEditorWindow'

const native = vi.hoisted(() => ({ options: {} as Record<string, unknown> }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    onCloseRequested: async () => () => {},
    listen: async () => () => {},
    emitTo: async () => {},
  }),
  WebviewWindow: class {
    static async getByLabel() {
      return null
    }
    constructor(_label: string, options: Record<string, unknown>) {
      native.options = options
    }
    async once(event: string, callback: () => void) {
      if (event === 'tauri://created') callback()
      return () => {}
    }
    async destroy() {}
  },
}))

afterEach(() => vi.unstubAllGlobals())

it.each(['Macintosh', 'Windows NT 10.0'])(
  'uses the shared detached-window chrome on %s',
  async (platform) => {
    vi.stubGlobal('navigator', { userAgent: platform })
    await createMidiProjectEditorWindowPort().open('session')
    expect(native.options).toMatchObject({
      url: 'midi-project-editor.html?session=session',
      hiddenTitle: true,
      titleBarStyle: 'overlay',
      decorations: platform === 'Macintosh',
      trafficLightPosition: { x: 10, y: 20 },
      visible: false,
    })
  }
)
