import { createApp, defineComponent, h, ref } from 'vue'
import PianoRoll from '../../src/PianoRoll.vue'
import Minimal from '../../examples/Minimal.vue'
import type { PianoRollDocument } from '../../src/core'
import type { PianoRollThemeInput, PianoRollTransport } from '../../src/browser'

const documentModel: PianoRollDocument = {
  ticksPerBeat: 480,
  durationTicks: 9600,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [{ id: 'piano', name: 'Grand Piano', isPercussion: false, enabled: true }],
  notes: Array.from({ length: 24 }, (_, index) => ({
    id: `note-${index}`,
    trackId: 'piano',
    startTick: 240 + index * 320,
    endTick: 400 + index * 320,
    pitch: 48 + (index % 24),
    velocity: 90,
  })),
}

const transport: PianoRollTransport = { positionSeconds: 0, isPlaying: false, playbackRate: 1 }
let app: ReturnType<typeof createApp> | null = null
let roll: {
  getView?: () => { getTheme: () => unknown; getViewport: () => unknown } | null
} | null = null
const theme = ref<PianoRollThemeInput | undefined>(undefined)
const width = ref('760px')

const Harness = defineComponent({
  setup() {
    return () =>
      h('div', { id: 'harness', style: { width: width.value, height: '380px' } }, [
        h(PianoRoll, {
          ref: (value: unknown) => {
            roll = value as typeof roll
          },
          document: documentModel,
          transport,
          theme: theme.value,
        }),
      ])
  },
})

function mountHarness(): void {
  const mount = document.querySelector('#mount')!
  app?.unmount()
  app = createApp(Harness)
  app.mount(mount)
}

function mountMinimal(): void {
  const mount = document.querySelector('#mount')!
  app?.unmount()
  app = createApp(Minimal)
  app.mount(mount)
}

declare global {
  interface Window {
    vueFixture: {
      mountHarness: () => void
      mountMinimal: () => void
      setWidth: (value: string) => void
      setTheme: (value: PianoRollThemeInput | undefined) => void
      getTheme: () => unknown
      getView: () => unknown
      unmount: () => void
    }
  }
}

window.vueFixture = {
  mountHarness,
  mountMinimal,
  setWidth(value) {
    width.value = value
  },
  setTheme(value) {
    theme.value = value
  },
  getTheme() {
    return roll?.getView?.()?.getTheme() ?? null
  },
  getView() {
    return roll?.getView?.() ?? null
  },
  unmount() {
    app?.unmount()
    app = null
    roll = null
  },
}
mountHarness()
