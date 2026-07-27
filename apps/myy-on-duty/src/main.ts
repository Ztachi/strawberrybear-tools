import { createNikkiCssVariableRecord } from '@strawberrybear/nikki-theme'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from '@/App.vue'
import { i18n } from '@/i18n'
import { router } from '@/router'
import '@/style.css'

// 品牌色统一来自 @strawberrybear/nikki-theme，注入后 CSS 只引用变量不落死值。
for (const [name, value] of Object.entries(createNikkiCssVariableRecord())) {
  document.documentElement.style.setProperty(name, value)
}

createApp(App).use(createPinia()).use(i18n).use(router).mount('#app')
