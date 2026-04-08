import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, initI18n } from './i18n'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)

// 读取当前 window label
const params = new URLSearchParams(window.location.search)
const windowLabel = params.get('windowLabel') || 'main'

// 将 label 注入到 provide
app.provide('windowLabel', windowLabel)

// 初始化 i18n - 从 Rust 后端获取系统语言
initI18n()

app.mount('#app')
