import { afterEach, expect, it, vi } from 'vitest'
import { createPianoEditorWindowPort } from './pianoEditorWindow'

const native = vi.hoisted(() => ({ options: {} as Record<string, unknown> }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ onCloseRequested: async () => () => {} }),
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
  'uses the main-window immersive titlebar convention on %s',
  async (platform) => {
    vi.stubGlobal('navigator', { userAgent: platform })
    await createPianoEditorWindowPort().open('session')
    expect(native.options).toMatchObject({
      hiddenTitle: true,
      titleBarStyle: 'overlay',
      decorations: platform === 'Macintosh',
      trafficLightPosition: { x: 10, y: 20 },
      visible: false,
    })
  }
)
