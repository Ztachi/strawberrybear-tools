/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-05 16:30:32
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-05 21:45:41
 * @FilePath: /strawberrybear-tools/apps/dq7-shuffle/vite.config.ts
 * @Description: DQ7 对对碰洗牌记录工具 Vite 配置
 */
import { defineConfig } from 'vite'
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distDir = resolve(__dirname, 'dist')

/**
 * 将构建产物全部内联到 index.html，输出单个压缩的 HTML 文件
 */
function inlinePlugin() {
  return {
    name: 'inline-all-assets',
    closeBundle() {
      const htmlPath = resolve(distDir, 'index.html')
      let html = readFileSync(htmlPath, 'utf-8')

      // 查找 JS 文件并内联
      const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/)
      if (jsMatch) {
        const jsFileName = jsMatch[1].split('/').pop()!
        const jsPath = resolve(distDir, 'assets', jsFileName)
        const jsContent = readFileSync(jsPath, 'utf-8')
        html = html.replace(
          `<script type="module" crossorigin src="${jsMatch[1]}"></script>`,
          `<script type="module">${jsContent}</script>`
        )
      }

      // 查找 CSS 文件并内联
      const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/)
      if (cssMatch) {
        const cssFileName = cssMatch[1].split('/').pop()!
        const cssPath = resolve(distDir, 'assets', cssFileName)
        const cssContent = readFileSync(cssPath, 'utf-8')
        html = html.replace(
          `<link rel="stylesheet" crossorigin href="${cssMatch[1]}">`,
          `<style>${cssContent}</style>`
        )
      }

      // 内联 favicon SVG 为 data URI
      const faviconMatch = html.match(/href="(\/favicon\.svg)"/)
      if (faviconMatch) {
        const faviconPath = resolve(distDir, 'favicon.svg')
        const faviconContent = readFileSync(faviconPath, 'utf-8')
        const faviconDataUri = `data:image/svg+xml,${encodeURIComponent(faviconContent)}`
        html = html.replace(
          `<link rel="icon" type="image/svg+xml" href="${faviconMatch[1]}" />`,
          `<link rel="icon" type="image/svg+xml" href="${faviconDataUri}" />`
        )
      }

      // HTML 压缩：移除注释、合并空白
      html = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/\s+\/>/g, '/>')
        .replace(/<\s+/g, '<')
        .trim()

      writeFileSync(htmlPath, html)

      // 删除 assets 目录
      try {
        rmSync(resolve(distDir, 'assets'), { force: true, recursive: true })
      } catch {
        // ignore
      }

      // 删除 favicon.svg
      try {
        rmSync(resolve(distDir, 'favicon.svg'), { force: true })
      } catch {
        // ignore
      }
    },
  }
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3001,
    open: true,
  },
  plugins: [inlinePlugin()],
  build: {
    codeSplitting: false,
    cssCodeSplit: false,
    minify: 'esbuild',
    rollupOptions: {
      input: './index.html',
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
})
