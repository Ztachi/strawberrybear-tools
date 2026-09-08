import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { compileScript, compileStyle, parse } from 'vue/compiler-sfc'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { PianoRollView } from '../../src/browser'

test.describe('Vue piano roll integration', () => {
  let bundle: string
  test.beforeAll(async () => {
    bundle = (
      await build({
        entryPoints: [fileURLToPath(new URL('./vue-fixture.ts', import.meta.url))],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        plugins: [
          {
            name: 'vue-sfc-inline',
            setup(buildApi) {
              buildApi.onLoad({ filter: /\.vue$/ }, ({ path: filename }) => {
                const source = fs.readFileSync(filename, 'utf8')
                const descriptor = parse(source, { filename }).descriptor
                const id = `data-v-${createHash('sha256').update(filename).digest('hex').slice(0, 8)}`
                const script = compileScript(descriptor, {
                  id,
                  inlineTemplate: true,
                  genDefaultAs: '_component',
                })
                const style = descriptor.styles
                  .map(
                    (item) =>
                      compileStyle({
                        id,
                        filename,
                        source: item.content,
                        scoped: item.scoped,
                      }).code
                  )
                  .join('\n')
                return {
                  loader: 'ts',
                  contents: `${script.content}\n_component.__scopeId = ${JSON.stringify(id)}; export default _component;\nif (typeof document !== 'undefined') { const style = document.createElement('style'); style.textContent = ${JSON.stringify(style)}; document.head.appendChild(style) }`,
                  resolveDir: path.dirname(filename),
                }
              })
            },
          },
        ],
      })
    ).outputFiles[0]!.text
  })

  test.beforeEach(async ({ page }) => {
    await page.setContent(
      '<style>html,body{margin:0}#mount{height:100vh}</style><div id="mount"></div>'
    )
    await page.addScriptTag({ content: bundle })
    await page.waitForFunction(() => document.querySelector('.piano-roll .pr-pane canvas') !== null)
  })

  test('fit and slider minimum make the complete song exactly fill the timeline viewport', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '适合全曲' }).click()
    const result = await page.locator('#mount').evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('.piano-roll .pr-scroll')!
      const slider = document.querySelector<HTMLInputElement>('.piano-roll-zoom input')!
      return {
        width: scroll.clientWidth,
        extent: scroll.scrollWidth,
        min: Number(slider.min),
        value: Number(slider.value),
      }
    })
    expect(result.extent).toBe(result.width)
    expect(result.value).toBeCloseTo(result.min, 8)
    await page.locator('.piano-roll-zoom input').press('Home')
    await expect
      .poll(() => page.locator('.piano-roll-zoom input').inputValue())
      .toBe(String(result.min))
  })

  test('a fit view recomputes its minimum after a container resize', async ({ page }) => {
    await page.getByRole('button', { name: '适合全曲' }).click()
    const before = await page.locator('.piano-roll-zoom input').getAttribute('min')
    await page.evaluate(() => {
      ;(window as unknown as { viewBefore: unknown }).viewBefore = window.vueFixture.getView()
      window.vueFixture.setWidth('520px')
    })
    await expect
      .poll(() => page.locator('.piano-roll-zoom input').getAttribute('min'))
      .not.toBe(before)
    const result = await page.locator('#mount').evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('.piano-roll .pr-scroll')!
      const slider = document.querySelector<HTMLInputElement>('.piano-roll-zoom input')!
      return {
        width: scroll.clientWidth,
        extent: scroll.scrollWidth,
        min: Number(slider.min),
        value: Number(slider.value),
        sameView:
          (window as unknown as { viewBefore: unknown }).viewBefore === window.vueFixture.getView(),
        viewport: (
          window.vueFixture.getView() as {
            getViewport: () => { timeZoom: number; minTimeZoom: number }
          }
        ).getViewport(),
      }
    })
    expect(result.sameView).toBe(true)
    expect(result.extent).toBe(result.width)
    expect(result.value).toBeCloseTo(result.min, 8)
    expect(result.viewport.timeZoom).toBeCloseTo(result.viewport.minTimeZoom, 8)
  })

  test('theme tokens update DOM and rendered canvas without resetting the view', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const view = window.vueFixture.getView() as PianoRollView
      view.setTimeZoom(120)
      view.setFollow(false)
      document.querySelector<HTMLElement>('.pr-scroll')!.scrollLeft = 128
    })
    await expect
      .poll(() =>
        page.evaluate(() => (window.vueFixture.getView() as PianoRollView).getViewport().scrollLeft)
      )
      .toBe(128)
    const instance = await page.evaluateHandle(() => window.vueFixture.getView())
    const viewport = await page.evaluate(() =>
      (window.vueFixture.getView() as PianoRollView).getViewport()
    )
    await page.evaluate(() =>
      window.vueFixture.setTheme({
        colors: {
          surface: '#102030',
          trackSelected: '#102030',
          primary: '#ff0066',
        },
      })
    )
    await expect
      .poll(() =>
        page
          .locator('.piano-roll')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--pr-primary').trim())
      )
      .toBe('#ff0066')
    await expect
      .poll(() =>
        page.evaluate(
          () => (window.vueFixture.getTheme() as { colors: { surface: string } }).colors.surface
        )
      )
      .toBe('#102030')
    await expect
      .poll(() =>
        page
          .locator('.piano-roll .pr-pane canvas')
          .first()
          .evaluate((node) => {
            const canvas = node as HTMLCanvasElement
            const context = canvas.getContext('2d')!
            return Array.from(context.getImageData(1, 1, 1, 1).data).slice(0, 3)
          })
      )
      .toEqual([16, 32, 48])
    expect(await page.evaluate((before) => window.vueFixture.getView() === before, instance)).toBe(
      true
    )
    expect(
      await page.evaluate(() => (window.vueFixture.getView() as PianoRollView).getViewport())
    ).toEqual(viewport)
  })

  test('the non-modal editor closes on a second double-click of the same track', async ({
    page,
  }, testInfo) => {
    await page.evaluate(() => window.vueFixture.mountMinimal())
    await page.screenshot({ path: testInfo.outputPath('piano-roll-default.png') })
    const track = page.locator('.piano-roll .pr-track-select').first()
    await track.dblclick()
    await expect(page.getByRole('complementary', { name: '单轨详情' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('piano-roll-overlay.png') })
    await track.dblclick()
    await expect(page.getByRole('complementary', { name: '单轨详情' })).toHaveCount(0)
    await track.dblclick()
    await expect(page.getByRole('complementary', { name: '单轨详情' })).toBeVisible()
    await page.locator('.piano-roll .pr-track-select').nth(1).dblclick()
    await expect(page.getByRole('complementary', { name: '单轨详情' })).toBeVisible()
    await expect(
      page.getByRole('complementary', { name: '单轨详情' }).locator('.piano-roll-title')
    ).toContainText('Bass')
    await page.setViewportSize({ width: 520, height: 850 })
    const close = page
      .getByRole('complementary', { name: '单轨详情' })
      .getByRole('button', { name: '关闭', exact: true })
    await expect(close).toBeVisible()
    await close.click()
    await expect(page.getByRole('complementary', { name: '单轨详情' })).toHaveCount(0)
    await expect(page.locator('.pr-track-select').nth(1)).toHaveAttribute('aria-pressed', 'true')
  })
})
