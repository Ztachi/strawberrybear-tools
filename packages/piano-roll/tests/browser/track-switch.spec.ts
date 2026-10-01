import { expect, test } from '@playwright/test'
import type {} from './fixture'

test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<style>body{margin:12px;background:#151619}#overview{height:350px}</style><div id="overview"></div><div id="editor"></div>'
  )
  // 复用控制器交互测试的浏览器 fixture，确保开关测试使用真实渲染路径。
  const { build } = await import('esbuild')
  const { fileURLToPath } = await import('node:url')
  const bundle = (
    await build({
      entryPoints: [fileURLToPath(new URL('./fixture.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    })
  ).outputFiles[0]!.text
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(
    () => document.querySelector('#overview canvas')?.getAttribute('width') !== '300'
  )
})

test('track switch is visible, semantic, and isolated from track gestures', async ({ page }) => {
  const toggle = page.locator('#overview .pr-track-toggle').first()
  await expect(toggle).toHaveAttribute('role', 'switch')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(toggle).toHaveAttribute('aria-label', /禁用音轨|Disable track/)
  await expect(toggle).not.toHaveAttribute('title')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.fixture.toggles)).toEqual(['0', '0', '0'])
  expect(await page.evaluate(() => window.fixture.selections)).toEqual([])
  expect(await page.evaluate(() => window.fixture.opened)).toEqual([])
  expect(await page.evaluate(() => window.fixture.seeks)).toEqual([])
})

test('track switch reflects enabled state from the next document', async ({ page }) => {
  await page.evaluate(() => {
    window.fixture.overview.setDocument({
      durationTicks: 9600,
      ticksPerBeat: 480,
      tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
      timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
      tracks: [{ id: '0', name: 'Muted track', isPercussion: false, enabled: false }],
      notes: [],
    })
  })
  const toggle = page.locator('#overview .pr-track-toggle').first()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).toHaveAttribute('aria-label', /启用音轨|Enable track/)
  await expect(toggle).not.toHaveAttribute('title')
})
