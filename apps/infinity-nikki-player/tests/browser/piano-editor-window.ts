import { createApp } from 'vue'
import { i18n } from '@/i18n'
import PianoEditorWindow from '@/views/PianoEditorWindow/PianoEditorWindow.vue'
import { EDITOR_CLIENT_PORT } from '@/features/piano-editor'
import { browserEditorClientPort } from './editor-window-port'
import 'antdv-next/dist/reset.css'
import '@/style.css'

createApp(PianoEditorWindow)
  .use(i18n)
  .provide(EDITOR_CLIENT_PORT, browserEditorClientPort())
  .mount('#app')
