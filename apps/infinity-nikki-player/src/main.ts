import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.use(createPinia())

// 读取当前 window label
const params = new URLSearchParams(window.location.search)
const windowLabel = params.get('windowLabel') || 'main'

// 将 label 注入到 provide
app.provide('windowLabel', windowLabel)

app.mount('#app')
