#!/usr/bin/env node
/* global process, console */
/**
 * @description: 通过 GitHub 镜像代理调用 tauri build，避免在国内网络下下载 NSIS / WiX 等工具超时
 * @param {string} [--no-bundle]                   透传给 `tauri build --no-bundle`，跳过所有打包
 * @param {string} [--bundles <nsis|msi>]          透传给 `tauri build --bundles`，仅打包指定格式
 * @param {string} [--mirror <url>]                GitHub 镜像 host，默认 https://mirror.ghproxy.com/
 * @param {string} [-- <tauri build 其它参数>]     透传给 `tauri build` 的其它参数
 * @return {Promise<number>} 子进程退出码
 */
import { spawn } from 'node:child_process'

// 默认使用 ghproxy，国内访问 GitHub Release 较稳定；可被 --mirror 覆盖
const DEFAULT_MIRROR = 'https://mirror.ghproxy.com/'

// 简易参数解析
const args = process.argv.slice(2)
let mirror = DEFAULT_MIRROR
const passthrough = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--mirror' || a === '-m') {
    mirror = args[++i] ?? ''
    if (!mirror) {
      console.error('[tauri-build-with-mirror] --mirror 需要一个 URL 参数')
      process.exit(2)
    }
  } else if (a === '--help' || a === '-h') {
    console.log(
      `用法: node scripts/tauri-build-with-mirror.mjs [--no-bundle | --bundles <nsis|msi>] [--mirror <url>] [-- <tauri build 其它参数>]`
    )
    process.exit(0)
  } else {
    passthrough.push(a)
  }
}

// 把镜像 host 注入到 Tauri bundler 的下载逻辑（详见 tauri-apps/tauri#10866 / #11096）
// 兼容 Windows / macOS / Linux
const env = {
  ...process.env,
  TAURI_BUNDLER_TOOLS_GITHUB_MIRROR: mirror,
}

console.log(`[tauri-build-with-mirror] TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=${mirror}`)
console.log(`[tauri-build-with-mirror] tauri build ${passthrough.join(' ')}`)

// Windows 上 pnpm/node 调用 .bin/tauri 实际是 .cmd / .ps1，需要走 shell；非 Windows 直接 spawn 即可
const useShell = process.platform === 'win32'
const child = spawn('pnpm', ['tauri', 'build', ...passthrough], {
  stdio: 'inherit',
  env,
  shell: useShell,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
child.on('error', (err) => {
  console.error('[tauri-build-with-mirror] 启动子进程失败:', err.message)
  process.exit(1)
})
