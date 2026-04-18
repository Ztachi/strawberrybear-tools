/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:17:19
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:17:19
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/vite.config.ts
 * @Description:
 */
/**
 * @fileOverview Vite 构建配置
 * @description 配置 Vue 3 + Vuetify 3 + Tailwind CSS（禁用 Preflight）
 * @author strawberrybear
 * @date 2026-04-18
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', '32x32.ico', '48x48.ico', '64x64.ico'],
      manifest: {
        name: '敏感词检测 | Sensitive Word Checker',
        short_name: '敏感词检测',
        description: '本地单机敏感词检测工具，支持多词汇库管理与离线扫描。',
        theme_color: '#f7c0c1',
        background_color: '#fdf8f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/32x32.ico',
            sizes: '32x32',
            type: 'image/x-icon',
          },
          {
            src: '/48x48.ico',
            sizes: '48x48',
            type: 'image/x-icon',
          },
          {
            src: '/64x64.ico',
            sizes: '64x64',
            type: 'image/x-icon',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.github\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'github-api-cache',
              networkTimeoutSeconds: 6,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
          {
            urlPattern: ({ request }) =>
              ['style', 'script', 'worker'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'asset-cache',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
})
