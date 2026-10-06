import { createApp } from 'vue'
import { mockIPC } from '@tauri-apps/api/mocks'
import type { RecorderAudio } from '@/features/midi-recording/types'
mockIPC((command, args) => window.opener.midiEditorFixture.recordingDraft(command, args ?? {}))
import { createPinia } from 'pinia'
import { i18n } from '@/i18n'
import { MIDI_PROJECT_EDITOR_CLIENT_PORT } from '@/features/midi-project-editor-window'
import MidiProjectEditorWindow from '@/views/MidiProjectEditorWindow/MidiProjectEditorWindow.vue'
import { browserMidiProjectEditorClientPort } from './midi-project-editor-window-port'
import 'antdv-next/dist/reset.css'
import '@/style.css'

createApp(MidiProjectEditorWindow)
  .use(createPinia())
  .use(i18n)
  .provide(
    'track-recorder-audio-factory',
    (): RecorderAudio => ({
      prepare: async () => {},
      now: () => performance.now() / 1000,
      note: () => ({ stop() {} }),
      startAccompaniment() {},
      stopAccompaniment() {},
    })
  )
  .provide(MIDI_PROJECT_EDITOR_CLIENT_PORT, browserMidiProjectEditorClientPort())
  .mount('#app')
