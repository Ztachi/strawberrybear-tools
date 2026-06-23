/**
 * @fileOverview Vite 构建配置
 * @description 配置 Vue 3 + Vuetify 4 + Tailwind CSS 4 的静态 Web App 构建链路。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as {
  version: string
}

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true }), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3004,
    open: true,
  },
  build: {
    target: 'es2022',
  },
})
