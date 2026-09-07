import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/** 平台边界测试使用 Node，不加载桌面构建插件或真实 AudioContext。 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
