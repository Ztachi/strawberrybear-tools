import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './regions-fixture'

let bundle: string
const surface = [255, 249, 250, 255]
const selectedRegion = [255, 232, 238, 255]
const enabledRegion = [252, 233, 237, 255]
// 在高 DPI 下按 CSS 坐标采样，确保区域裁剪与 backing store 比例一致。
test.use({ deviceScaleFactor: 2 })
test.beforeAll(async () => {
  bundle = (
    await build({
      entryPoints: [fileURLToPath(new URL('./regions-fixture.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    })
  ).outputFiles[0]!.text
})

test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<style>body{margin:0}#overview{width:800px;height:320px}</style><div id="overview"></div>'
  )
  await page.addScriptTag({ content: bundle })
  await expect.poll(() => pixel(page, 20, 20)).toEqual(surface)
})

/** 采样真实 Canvas，负横坐标表示距视口右边缘的距离。 */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page
    .locator('#overview .pr-pane canvas')
    .first()
    .evaluate(
      (node, position) => {
        const canvas = node as HTMLCanvasElement
        const dpr = canvas.width / canvas.clientWidth
        const x = position.x < 0 ? canvas.clientWidth + position.x : position.x
        return Array.from(
          canvas
            .getContext('2d')!
            .getImageData(Math.round(x * dpr), Math.round(position.y * dpr), 1, 1).data
        )
      },
      { x, y }
    )
}

test('regions keep actual bounds, gaps and visible end markers when scrolling', async ({
  page,
}) => {
  const rows = await page.locator('#overview .pr-track').evaluateAll((elements) =>
    elements.map((element) => ({
      top: (element as HTMLElement).offsetTop,
      height: (element as HTMLElement).offsetHeight,
    }))
  )
  const gapY = rows[0]!.height - 2
  const middleY = rows[1]!.top + rows[1]!.height / 2
  const lastY = rows[2]!.top + rows[2]!.height / 2
  expect(await pixel(page, 4, 20)).toEqual(selectedRegion)
  expect(await pixel(page, 20, 20)).toEqual(surface)
  expect(await pixel(page, 4, gapY)).toEqual(surface)
  // 第二轨从 10 秒开始，前导区留白；音轨区域内的小节线被背景覆盖。
  expect(await pixel(page, 10, middleY)).toEqual(surface)
  expect(await pixel(page, 500, middleY)).toEqual(enabledRegion)
  expect(await pixel(page, 576, middleY)).toEqual(enabledRegion)
  expect(await pixel(page, -4, lastY)).toEqual(surface)

  await page.locator('#overview .pr-scroll').evaluate((element) => {
    element.scrollLeft = element.scrollWidth - element.clientWidth
  })
  await expect.poll(() => pixel(page, -4, lastY)).toEqual(enabledRegion)
  // 滚动后短轨及其名称离开视口，不残留粉色背景或文字。
  expect(await pixel(page, 4, 20)).toEqual(surface)
  expect(await pixel(page, 500, middleY)).toEqual(surface)
  await page.locator('#overview .pr-scroll').evaluate((element) => {
    element.scrollLeft = 0
  })
  await expect.poll(() => pixel(page, -4, lastY)).toEqual(surface)
})

test('a zero-duration document retains its empty track marker at the start', async ({ page }) => {
  await page.evaluate(() =>
    window.regionView.setDocument({
      durationTicks: 0,
      ticksPerBeat: 480,
      tempoMap: [],
      timeSignatureMap: [],
      notes: [],
      tracks: [
        {
          id: 'empty',
          name: '空轨道',
          startTick: 0,
          endTick: 0,
          isPercussion: false,
          enabled: true,
        },
      ],
    })
  )
  await expect.poll(() => pixel(page, 4, 20)).toEqual(selectedRegion)
  expect(await pixel(page, 20, 20)).toEqual(surface)
})
