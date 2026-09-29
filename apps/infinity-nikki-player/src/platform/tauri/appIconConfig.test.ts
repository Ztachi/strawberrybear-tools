import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = fileURLToPath(new URL('../../../', import.meta.url))
const tauriRoot = resolve(appRoot, 'src-tauri')

function readIcon(name: string) {
  return readFileSync(resolve(tauriRoot, 'icons', name))
}

function readPngSize(name: string) {
  const icon = readIcon(name)
  return {
    width: icon.readUInt32BE(16),
    height: icon.readUInt32BE(20),
  }
}

describe('桌面应用图标配置', () => {
  it('为 macOS、Windows 和常规桌面尺寸声明完整资源', () => {
    const config = JSON.parse(readFileSync(resolve(tauriRoot, 'tauri.conf.json'), 'utf8'))

    expect(config.bundle.icon).toEqual([
      'icons/32x32.png',
      'icons/128x128.png',
      'icons/128x128@2x.png',
      'icons/icon.icns',
      'icons/icon.ico',
    ])
    expect(config.bundle.windows.nsis.installerIcon).toBe('icons/icon.ico')
    expect(readPngSize('32x32.png')).toEqual({ width: 32, height: 32 })
    expect(readPngSize('128x128.png')).toEqual({ width: 128, height: 128 })
    expect(readPngSize('128x128@2x.png')).toEqual({ width: 256, height: 256 })
  })

  it('不再用未解析的 Xcode 占位符覆盖 Tauri 生成的应用身份', () => {
    const infoPlist = readFileSync(resolve(tauriRoot, 'Info.plist'), 'utf8')

    expect(infoPlist).not.toContain('$(')
    expect(infoPlist).toContain('<key>CFBundleLocalizations</key>')
  })

  it('Windows 图标包含多个系统尺寸，macOS 图标格式有效', () => {
    const windowsIcon = readIcon('icon.ico')
    const windowsIconCount = windowsIcon.readUInt16LE(4)
    const windowsIconSizes = Array.from({ length: windowsIconCount }, (_, index) => {
      const width = windowsIcon[6 + index * 16]
      return width === 0 ? 256 : width
    })
    const macIcon = readIcon('icon.icns')

    expect(windowsIconSizes).toEqual(expect.arrayContaining([16, 24, 32, 48, 64, 256]))
    expect(macIcon.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(statSync(resolve(tauriRoot, 'icons', '128x128.png')).size).toBeGreaterThan(20_000)
  })

  it.each(['index.html', 'piano-editor.html', 'midi-project-editor.html'])(
    '%s 使用应用标志而不是脚手架默认图标',
    (entry) => {
      const html = readFileSync(resolve(appRoot, entry), 'utf8')

      expect(html).toContain('href="/src-tauri/icons/32x32.png"')
      expect(html).not.toContain('vite.svg')
    }
  )

  it('macOS 系统集成预览通过应用包启动', () => {
    const previewScript = readFileSync(resolve(appRoot, 'scripts/build-and-launch.sh'), 'utf8')

    expect(previewScript).toContain('/usr/bin/open -n "$APP_PATH"')
    expect(previewScript).toContain('启动 ${APP_PATH}……')
    expect(previewScript).not.toContain('启动 $APP_PATH……')
    expect(previewScript).toContain('"createUpdaterArtifacts":false')
    expect(previewScript).not.toContain('"$APP_PATH/Contents/MacOS/infinity-nikki-player"')
  })
})
