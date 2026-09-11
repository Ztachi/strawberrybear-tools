import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './fixture'

let bundle: string
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

for (const dpr of [1, 2]) {
  test.describe(`ruler at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr })
    for (const id of ['overview', 'editor'] as const) {
      test(`${id}: ticks move continuously and labels keep their identity during Follow`, async ({
        page,
      }) => {
        await page.setContent(
          '<style>body{margin:12px}#overview{height:350px}#editor{height:400px;margin-top:12px}</style><div id="overview"></div><div id="editor"></div>'
        )
        await page.addScriptTag({ content: bundle })
        const results = await page.evaluate(async (id) => {
          const canvas = document.querySelector<HTMLCanvasElement>(`#${id} .pr-ruler canvas`)!
          const context = canvas.getContext('2d')!
          const moveTo = context.moveTo.bind(context)
          const fillText = context.fillText.bind(context)
          let lines: number[] = []
          let labels: { text: string; x: number; width: number }[] = []
          context.moveTo = (x, y) => {
            lines.push(x)
            moveTo(x, y)
          }
          context.fillText = (text, x, y) => {
            labels.push({ text, x, width: context.measureText(text).width })
            fillText(text, x, y)
          }
          const view = window.fixture[id]
          const width = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.clientWidth
          const results: { zoom: number; maximumError: number; flashes: number }[] = []
          for (const zoom of [9, 23.999, 24.001, 70.63, 1200]) {
            view.setTimeZoom(zoom)
            view.setFollow(true)
            let previousLines: number[] = []
            let previousLabels: typeof labels = []
            let maximumError = 0
            let flashes = 0
            for (let frame = 0; frame < 64; frame += 1) {
              lines = []
              labels = []
              window.fixture.setTime(75 + (frame * 0.37) / zoom, true)
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
              if (frame > 0) {
                for (const x of previousLines.filter((x) => x > 4 && x < width - 4)) {
                  const distance = Math.min(...lines.map((next) => Math.abs(next - (x - 0.37))))
                  maximumError = Math.max(maximumError, distance)
                }
                // 完整位于视口内的文字不能凭空出现或消失；跨边缘的标签允许自然裁剪。
                const interior = (label: (typeof labels)[number]) =>
                  label.x > 2 && label.x + label.width < width - 2
                for (const label of previousLabels.filter(interior))
                  if (!labels.some((next) => next.text === label.text)) flashes += 1
                for (const label of labels.filter(interior))
                  if (!previousLabels.some((previous) => previous.text === label.text)) flashes += 1
              }
              previousLines = lines
              previousLabels = labels
            }
            results.push({ zoom, maximumError, flashes })
          }
          return results
        }, id)
        for (const result of results) {
          expect(result.maximumError, `tick motion at ${result.zoom} px/s`).toBeLessThan(0.00001)
          expect(result.flashes, `label identity at ${result.zoom} px/s`).toBe(0)
        }
      })
    }
  })
}
