/**
 * @fileOverview 应用入口
 * @description 初始化 Vue、Pinia、Vuetify、Vue Router、vue-i18n 和 TanStack Query。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'
import '@mdi/font/css/materialdesignicons.css'
import '@/theme/tailwind.css'
import 'vuetify/styles'
import '@/theme/styles.css'
import App from './App.vue'
import { pinia } from './pinia'
import { queryClient } from './queryClient'
import { router } from './router'
import { vuetify } from '@/theme/vuetify'
import { i18n, setUiLocale } from '@/i18n'
import { installInteractionSound } from '@/plugins/interactionSound'
import { useUiStore } from '@/stores/ui'

/** 创建 Vue 应用实例。 */
const app = createApp(App)

app.use(pinia)

const uiStore = useUiStore()
// Pinia persisted state 会在 store 创建时恢复，挂载 i18n 前同步一次，避免首屏语言闪烁。
setUiLocale(uiStore.uiLocale)

app.use(i18n)
app.use(vuetify)
app.use(VueQueryPlugin, { queryClient })
app.use(router)
installInteractionSound()

app.mount('#app')
