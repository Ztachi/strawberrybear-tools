import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './fixture'

let bundle: string
// fixture.ts 只在浏览器执行；此处仅为 evaluate 提供 Window 类型。
test.beforeAll(async () => {
  bundle = (
    await build({
      entryPoints: [fileURLToPath(new URL('./fixture.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    })
  ).outputFiles[0]!.text
})
test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<style>body{margin:12px;background:#151619}#overview{height:350px}#editor{height:400px;margin-top:12px}</style><div id="overview"></div><div id="editor"></div>'
  )
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(
    () => document.querySelector('#overview canvas')?.getAttribute('width') !== '300'
  )
  await expect(page.locator('#overview .pr-empty')).toBeHidden()
  await expect(page.locator('#editor .pr-empty')).toBeHidden()
})

test('two instances keep zoom, scroll and Follow independent', async ({ page }) => {
  const initial = await page.evaluate(() => window.fixture.editor.getViewport())
  await page.evaluate(() => window.fixture.overview.setTimeZoom(200))
  await expect.poll(() => page.evaluate(() => window.fixture.editor.getViewport())).toEqual(initial)
  await page.locator('#overview .pr-scroll').evaluate((el) => {
    el.scrollLeft = 620
    el.scrollTop = 150
  })
  await expect
    .poll(() => page.evaluate(() => window.fixture.overview.getViewport().follow))
    .toBe(false)
  expect(await page.evaluate(() => window.fixture.editor.getViewport())).toEqual(initial)
  await page.evaluate(() => window.fixture.editor.setTimeZoom(320))
  expect(await page.evaluate(() => window.fixture.overview.getViewport().timeZoom)).toBe(200)
  expect(await page.evaluate(() => window.fixture.overview.getViewport().scrollLeft)).toBe(620)
})

test('rulers with different zoom and scroll seek the same source seconds', async ({ page }) => {
  await page.evaluate(() => {
    window.fixture.overview.setTimeZoom(80)
    window.fixture.editor.setTimeZoom(160)
  })
  await page.locator('#overview .pr-scroll').evaluate((el) => {
    el.scrollLeft = 120
  })
  await page.locator('#editor .pr-scroll').evaluate((el) => {
    el.scrollLeft = 260
  })
  await page.locator('#overview .pr-ruler').click({ position: { x: 200, y: 20 } })
  await page.locator('#editor .pr-ruler').click({ position: { x: 380, y: 20 } })
  expect(await page.evaluate(() => window.fixture.seeks)).toEqual([4, 4])
})

test('handle previews while dragging and commits once on release', async ({ page }) => {
  await page.evaluate(() => window.fixture.setTime(2))
  const handle = page.locator('#overview .pr-handle')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 9, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + 180, box.y + 8, { steps: 6 })
  expect(await page.evaluate(() => window.fixture.seeks.length)).toBe(0)
  expect(await page.evaluate(() => window.fixture.previews.length)).toBeGreaterThan(1)
  await page.mouse.up()
  expect(await page.evaluate(() => window.fixture.seeks.length)).toBe(1)
  expect(await page.evaluate(() => window.fixture.previews.at(-1))).toBe(null)
})

test('pointercancel and blur cancel drag without seeking', async ({ page }) => {
  for (const cancel of ['pointercancel', 'blur']) {
    await page.evaluate(() => window.fixture.setTime(2))
    const box = (await page.locator('#overview .pr-handle').boundingBox())!
    await page.mouse.move(box.x + 9, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + 90, box.y + 8)
    if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else await page.locator('#overview .pr-handle').dispatchEvent('pointercancel')
    await page.mouse.up()
  }
  expect(await page.evaluate(() => window.fixture.seeks.length)).toBe(0)
  expect(await page.evaluate(() => window.fixture.previews.at(-1))).toBe(null)
})

test('drag near right edge scrolls with pointer captured', async ({ page }) => {
  await page.evaluate(() => window.fixture.setTime(2))
  const box = (await page.locator('#overview .pr-handle').boundingBox())!
  const ruler = (await page.locator('#overview .pr-ruler').boundingBox())!
  await page.mouse.move(box.x + 9, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(ruler.x + ruler.width - 2, box.y + 8)
  await expect
    .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
    .toBeGreaterThan(30)
  await page.mouse.up()
  expect(await page.evaluate(() => window.fixture.seeks.length)).toBe(1)
})

test('200k notes use viewport backing stores and transport does not repaint static layers', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.fixture.large()
    window.fixture.overview.setFollow(false)
  })
  await page.waitForTimeout(100)
  const sizes = await page
    .locator('#overview canvas')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: (node as HTMLCanvasElement).width,
        height: (node as HTMLCanvasElement).height,
      }))
    )
  expect(sizes.every((size) => size.width <= 2200 && size.height <= 1700)).toBe(true)
  await page.evaluate(() => {
    window.fixture.paints = 0
    for (let i = 1; i <= 60; i++)
      window.fixture.overview.setTransport({
        positionSeconds: i / 100,
        isPlaying: true,
        playbackRate: 2,
      })
  })
  await page.waitForTimeout(40)
  expect(await page.evaluate(() => window.fixture.paints)).toBe(0)
})

test('track single and double click preserve independent editor view', async ({ page }) => {
  await page.evaluate(() => window.fixture.editor.setTimeZoom(240))
  await page.locator('#overview .pr-track-select').nth(1).dblclick()
  expect(await page.evaluate(() => window.fixture.opened)).toEqual(['1'])
  await page.locator('#overview .pr-track-select').nth(2).click()
  expect(await page.evaluate(() => window.fixture.selections.at(-1))).toBe('2')
  expect(await page.evaluate(() => window.fixture.editor.getViewport().timeZoom)).toBe(240)
  expect(await page.evaluate(() => window.fixture.seeks)).toEqual([])
})

test('keyboard seek and destroy clean up all view DOM', async ({ page }) => {
  await page.locator('#overview .pr-handle').focus()
  await page.keyboard.press('ArrowRight')
  expect(await page.evaluate(() => window.fixture.seeks)).toEqual([0.1])
  await page.evaluate(() => {
    window.fixture.overview.destroy()
    window.fixture.editor.destroy()
  })
  await expect(page.locator('.pr-view')).toHaveCount(0)
})
