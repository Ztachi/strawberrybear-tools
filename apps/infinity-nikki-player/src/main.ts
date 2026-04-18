/**
 * @fileOverview 应用入口文件
 * @description 负责创建 Vue 应用、初始化插件（Pinia、i18n）和挂载点配置
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, initI18n } from './i18n'
import './style.css'

/** 创建 Vue 应用实例 */
const app = createApp(App)

/** 注册 Pinia 状态管理插件 */
app.use(createPinia())

/** 注册 i18n 国际化插件 */
app.use(i18n)

/**
 * @description: 获取窗口标签
 * @description 从 URL 查询参数中读取 windowLabel，用于支持多窗口
 * @return {string} 窗口标签，默认为 'main'
 */
const params = new URLSearchParams(window.location.search)
const windowLabel = params.get('windowLabel') || 'main'

/** 将窗口标签注入到 Vue provide 供子组件使用 */
app.provide('windowLabel', windowLabel)

/**
 * @description: 初始化 i18n
 * @description 从 Rust 后端获取系统语言设置，然后初始化国际化配置
 * @return Promise
 */
initI18n()

/** 将应用挂载到 DOM */
app.mount('#app')
