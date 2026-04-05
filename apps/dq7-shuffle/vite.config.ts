/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-05 16:30:32
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-05 17:12:02
 * @FilePath: /strawberrybear-tools/apps/dq7-shuffle/vite.config.ts
 * @Description: DQ7 对对碰洗牌记录工具 Vite 配置
 */
import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    cssInjectedByJsPlugin(),
    createHtmlPlugin({
      minify: true,
      entry: './src/main.ts',
    }),
  ],
  build: {
    codeSplitting: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: './index.html',
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
})
