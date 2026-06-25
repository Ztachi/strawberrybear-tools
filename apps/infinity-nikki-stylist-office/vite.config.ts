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
import { defineConfig, type Plugin } from 'vite'
import vuetify from 'vite-plugin-vuetify'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as {
  version: string
}

/**
 * @description 生成线上版本清单，运行中的旧 bundle 可绕过资源缓存检查是否需要刷新。
 * @param {string} version - 当前应用版本
 * @return {Plugin} Vite 插件
 */
function appVersionManifestPlugin(version: string): Plugin {
  return {
    name: 'stylist-office-app-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app-version.json',
        source: `${JSON.stringify({ version }, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [
    appVersionManifestPlugin(packageJson.version),
    vue(),
    vuetify({ autoImport: true }),
    tailwindcss(),
  ],
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
