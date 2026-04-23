/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:23:30
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:23:31
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/vite.config.ts
 * @Description:
 */
/**
 * @fileOverview Vite 构建配置
 * @description Vue 3 + Babylon.js (WebGPU/WebGL) + Tailwind CSS
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Babylon.js is a large ESM package — exclude from pre-bundling to avoid timeout
  optimizeDeps: {
    exclude: ['@babylonjs/core'],
  },
  server: {
    host: '0.0.0.0',
    port: 3003,
    open: true,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs/core')) {
            return 'babylon'
          }
        },
      },
    },
  },
})
