import { createApp } from 'vue'
import { i18n } from '@/i18n'
import '@/style.css'
import Fixture from './piano-track-hosts.vue'

createApp(Fixture).use(i18n).mount('#app')
