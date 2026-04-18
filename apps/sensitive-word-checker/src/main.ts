/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:23:51
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:23:51
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/main.ts
 * @Description:
 */
/**
 * @fileOverview 应用入口
 * @description 初始化 Vue 应用，注册 Vuetify、Pinia、vue-i18n，加载本地词库后挂载
 * @author strawberrybear
 * @date 2026-04-18
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import './style.css'

import { i18n } from './i18n'
import { useLexiconStore } from './stores/lexicon'
import App from './App.vue'

const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#f7c0c1',
          'primary-darken-1': '#f5a8aa',
          secondary: '#f5b8c0',
          surface: '#ffffff',
          'surface-variant': '#fdf8f8',
          background: '#fdf8f8',
        },
      },
    },
  },
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(vuetify)
app.use(i18n)

// 启动时从 IndexedDB 加载词库
const lexicon = useLexiconStore()
lexicon.loadFromDB().finally(() => {
  app.mount('#app')
})
