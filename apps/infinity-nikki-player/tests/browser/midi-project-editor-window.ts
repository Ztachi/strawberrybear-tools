import { createApp } from 'vue'
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
  .provide(MIDI_PROJECT_EDITOR_CLIENT_PORT, browserMidiProjectEditorClientPort())
  .mount('#app')
