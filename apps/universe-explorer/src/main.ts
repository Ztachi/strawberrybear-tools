/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:28:02
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:28:03
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/main.ts
 * @Description:
 */
/**
 * @fileOverview 应用入口
 * @description 初始化 Vue App，注册 Pinia 和 vue-i18n，挂载到 #app
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { i18n } from './i18n'
import App from './App.vue'
import './style.css'

createApp(App).use(createPinia()).use(i18n).mount('#app')
