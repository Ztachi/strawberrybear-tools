import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './hide-empty-fixture'

let bundle: string
test.beforeAll(async () => {
  bundle = (
    await build({
      entryPoints: [fileURLToPath(new URL('./hide-empty-fixture.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    })
  ).outputFiles[0]!.text
})

test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<style>body{margin:0}#overview,#editor{width:800px;height:380px}</style><div id="overview"></div><div id="editor"></div>'
  )
  await page.addScriptTag({ content: bundle })
  await expect(page.locator('#overview .pr-track')).toHaveCount(5)
})

test('the default shows all tracks and the initial option filters only invalid or empty tracks', async ({
  page,
}) => {
  await page.evaluate(() => window.hideEmptyFixture.withInitialFilter())
  await expect(page.locator('#overview .pr-track')).toHaveCount(2)
  expect(
    await page
      .locator('#overview .pr-track')
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.trackId))
  ).toEqual(['melody', 'disabled'])
  await expect(
    page.locator('#overview .pr-track[data-track-id="disabled"] [role="switch"]')
  ).toHaveAttribute('aria-checked', 'false')
  // 仅含非法音符的轨道同样为空；禁用却含有效音符的轨道仍可见。
  await expect(page.locator('#overview .pr-track[data-track-id="invalid"]')).toHaveCount(0)
  await expect(page.locator('#editor .pr-gutter canvas')).toBeVisible()
})

test('runtime filtering preserves selection, source IDs, document duration and viewport state', async ({
  page,
}) => {
  await page.evaluate(() => {
    const view = window.hideEmptyFixture.overview
    view.setTimeZoom(100)
    view.setFollow(false)
    document.querySelector<HTMLElement>('#overview .pr-scroll')!.scrollLeft = 240
  })
  await expect
    .poll(() => page.evaluate(() => window.hideEmptyFixture.overview.getViewport().scrollLeft))
    .toBe(240)
  const root = await page.locator('#overview .pr-view').elementHandle()
  const before = await page.evaluate(() => ({
    viewport: window.hideEmptyFixture.overview.getViewport(),
    document: window.hideEmptyFixture.document,
    editor: window.hideEmptyFixture.editor.getViewport(),
    followChanges: window.hideEmptyFixture.followChanges,
  }))
  await page.evaluate(() => window.hideEmptyFixture.overview.setHideEmptyTracks(true))
  await expect(page.locator('#overview .pr-track')).toHaveCount(2)
  expect(await page.locator('#overview .pr-view').evaluate((node, old) => node === old, root)).toBe(
    true
  )
  expect(
    await page.evaluate(() => ({
      viewport: window.hideEmptyFixture.overview.getViewport(),
      document: window.hideEmptyFixture.document,
      editor: window.hideEmptyFixture.editor.getViewport(),
      followChanges: window.hideEmptyFixture.followChanges,
    }))
  ).toEqual(before)
  await expect(page.locator('#overview .pr-handle')).toHaveAttribute('aria-valuemax', '100')
  await expect(page.locator('#editor .pr-handle')).toHaveAttribute('aria-valuemax', '100')
  await page.locator('#overview .pr-track[data-track-id="disabled"] [role="switch"]').click()
  expect(await page.evaluate(() => window.hideEmptyFixture.toggles)).toEqual(['disabled'])

  await page.evaluate(() => window.hideEmptyFixture.overview.setHideEmptyTracks(false))
  await expect(page.locator('#overview .pr-track')).toHaveCount(5)
  await expect(page.locator('#overview .pr-track[data-track-id="meta-empty"]')).toHaveAttribute(
    'data-selected',
    'true'
  )
  await expect(
    page.locator('#overview .pr-track[data-track-id="disabled"] [role="switch"]')
  ).toHaveAttribute('aria-checked', 'false')
})

test('filtering clamps vertical overflow and keeps Follow enabled', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window.hideEmptyFixture
    fixture.overview.setDocument({
      ...fixture.document,
      tracks: [
        ...fixture.document.tracks,
        ...Array.from({ length: 40 }, (_, index) => ({
          id: `empty-${index}`,
          name: `Empty ${index}`,
          isPercussion: false,
          enabled: true,
        })),
      ],
    })
    document.querySelector<HTMLElement>('#overview .pr-scroll')!.scrollTop = 1000
  })
  await expect
    .poll(() => page.evaluate(() => window.hideEmptyFixture.overview.getViewport().scrollTop))
    .toBe(1000)
  expect(await page.evaluate(() => window.hideEmptyFixture.overview.getViewport().follow)).toBe(
    true
  )
  await page.evaluate(() => window.hideEmptyFixture.overview.setHideEmptyTracks(true))
  await expect(page.locator('#overview .pr-track')).toHaveCount(2)
  const after = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    return {
      scrollTop: scroll.scrollTop,
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      follow: window.hideEmptyFixture.overview.getViewport().follow,
      followChanges: window.hideEmptyFixture.followChanges,
    }
  })
  expect(after.scrollTop).toBe(0)
  expect(after.scrollHeight).toBe(after.clientHeight)
  expect(after.follow).toBe(true)
  expect(after.followChanges).toEqual([])
})

test('an all-empty document retains the timeline and can reveal its tracks again', async ({
  page,
}) => {
  await page.evaluate(() => {
    const fixture = window.hideEmptyFixture
    fixture.overview.setDocument({ ...fixture.document, notes: [] })
    fixture.editor.setDocument({ ...fixture.document, notes: [] })
    fixture.overview.setHideEmptyTracks(true)
    fixture.editor.setHideEmptyTracks(false)
    fixture.editor.setHideEmptyTracks(true)
  })
  await expect(page.locator('#overview .pr-track')).toHaveCount(0)
  await expect(page.locator('#overview .pr-empty')).toBeVisible()
  await expect(page.locator('#overview .pr-ruler')).toBeVisible()
  await expect(page.locator('#editor .pr-empty')).toBeHidden()
  await expect(page.locator('#editor .pr-gutter canvas')).toBeVisible()
  await expect(page.locator('#overview .pr-handle')).toHaveAttribute('aria-valuemax', '100')
  await page.evaluate(() => {
    window.hideEmptyFixture.overview.setTransport({
      positionSeconds: 100,
      isPlaying: true,
      playbackRate: 1,
    })
  })
  await expect(page.locator('#overview .pr-handle')).toHaveAttribute('aria-valuenow', '100')
  await page.evaluate(() => window.hideEmptyFixture.overview.setHideEmptyTracks(false))
  await expect(page.locator('#overview .pr-track')).toHaveCount(5)
  await expect(page.locator('#overview .pr-empty')).toBeHidden()
  await expect(page.locator('#overview .pr-track[data-track-id="meta-empty"]')).toHaveAttribute(
    'data-selected',
    'true'
  )
})

test('document replacement reevaluates the filter without changing selected hidden tracks', async ({
  page,
}) => {
  await page.evaluate(() => {
    const fixture = window.hideEmptyFixture
    fixture.overview.setHideEmptyTracks(true)
    fixture.overview.setDocument({
      ...fixture.document,
      notes: [
        ...fixture.document.notes,
        {
          id: 'new-note',
          trackId: 'meta-empty',
          pitch: 67,
          velocity: 100,
          startTick: 0,
          endTick: 480,
        },
      ],
    })
  })
  await expect(page.locator('#overview .pr-track')).toHaveCount(3)
  await expect(page.locator('#overview .pr-track[data-track-id="meta-empty"]')).toHaveAttribute(
    'data-selected',
    'true'
  )
  await page.evaluate(() => {
    const fixture = window.hideEmptyFixture
    fixture.overview.setDocument(fixture.document)
  })
  await expect(page.locator('#overview .pr-track')).toHaveCount(2)
})
