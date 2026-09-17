/** 独立窗口专用入口：不装配主播放器、音频引擎、按键模拟器、路由或自动更新。 */
import { createApp } from 'vue'
import PianoEditorWindow from '@/views/PianoEditorWindow/PianoEditorWindow.vue'
import { i18n } from '@/i18n'
import 'antdv-next/dist/reset.css'
import '@/style.css'

createApp(PianoEditorWindow).use(i18n).mount('#app')
