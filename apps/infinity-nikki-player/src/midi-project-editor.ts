/** 独立 MIDI 项目编辑窗口入口：不装配主路由、全局播放器或游戏按键模拟。 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import MidiProjectEditorWindow from '@/views/MidiProjectEditorWindow/MidiProjectEditorWindow.vue'
import { configureAntdvStaticContext } from '@/theme/infinityNikkiTheme'
import { i18n } from '@/i18n'
import 'antdv-next/dist/reset.css'
import '@/style.css'

configureAntdvStaticContext()
createApp(MidiProjectEditorWindow).use(createPinia()).use(i18n).mount('#app')
