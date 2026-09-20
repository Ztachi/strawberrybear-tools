import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/** 平台边界测试使用 Node，不加载桌面构建插件或真实 AudioContext。 */
export default defineConfig({
  // 应用使用 Vite 8，Vitest 3 内置 Vite 7；仅在此适配插件类型，实际转换已由组件测试覆盖。
  plugins: [vue() as unknown as Plugin],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 自定义 Vue renderer 需要客户端模板，但不依赖浏览器或音频设备。
    testTransformMode: { web: ['**/editorHistory.test.ts'] },
  },
})
