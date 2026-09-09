import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type {} from './midi-detail-page'

test.afterEach(async ({ page }) => {
  const calls = await page.evaluate(() => window.midiDetailFixture.snapshot().nativeCalls)
  expect(calls.sort()).toEqual(['extract_all_notes', 'extract_melody', 'load_midi_config'])
})

async function openDetail(page: Page, query = ''): Promise<void> {
  await page.goto(`/tests/browser/midi-detail-page.html${query}`)
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.midiDetailFixture.snapshot().loading))
    .toBe(false)
}

async function rowIds(page: Page): Promise<string[]> {
  return page
    .locator('.detail-piano-roll .pr-track')
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset.trackId!).sort((a, b) => Number(a) - Number(b))
    )
}

async function expectLeftActions(header: Locator): Promise<void> {
  const positions = await header.evaluate((element) => {
    const title = element.querySelector('.piano-roll-slot-title')!.getBoundingClientRect()
    const action = element.querySelector('.piano-roll-app-toolbar button')!.getBoundingClientRect()
    return {
      gap: action.left - title.right,
      offset: action.left - element.getBoundingClientRect().left,
    }
  })
  expect(positions.gap).toBeGreaterThanOrEqual(20)
  expect(positions.gap).toBeLessThanOrEqual(32)
  expect(positions.offset).toBeLessThan(320)
}

for (const [locale, width] of [
  ['zh-CN', 1100],
  ['en-US', 780],
] as const) {
  test(`actual ${locale} page keeps left actions spaced and danger close at the right`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 })
    await openDetail(page, `?locale=${locale}`)
    const overview = page.locator('.detail-piano-roll')
    await expectLeftActions(overview.locator('.piano-roll-toolbar'))
    const row = overview.locator('.pr-track[data-track-id="1"]')
    const initialHeight = await row.evaluate((element) => element.getBoundingClientRect().height)
    await row.locator('.pr-track-select').dblclick()
    const editor = page.locator('.detail-piano-editor')
    await expect(editor).toBeVisible()
    await expectLeftActions(editor.locator('.piano-roll-toolbar'))
    await expect
      .poll(() => row.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThan(initialHeight)
    const close = editor.locator('.ant-btn-dangerous')
    await expect(close).toBeVisible()
    const layout = await editor.locator('.piano-roll-toolbar').evaluate((header) => {
      const rect = header.getBoundingClientRect()
      const close = header.querySelector('.ant-btn-dangerous')!
      const button = close.getBoundingClientRect()
      const lastSlider = [...header.querySelectorAll('.piano-roll-app-slider')]
        .at(-1)!
        .getBoundingClientRect()
      return {
        rightGap: rect.right - button.right,
        clearOfSlider: button.left >= lastSlider.right,
        color: getComputedStyle(close).color,
        overflow: header.scrollWidth > header.clientWidth,
      }
    })
    expect(layout.rightGap).toBeGreaterThanOrEqual(6)
    expect(layout.rightGap).toBeLessThanOrEqual(16)
    expect(layout.clearOfSlider).toBe(true)
    expect(layout.color).toBe('rgb(239, 91, 107)')
    expect(layout.overflow).toBe(false)
    await page.mouse.move(0, 0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`midi-detail-${locale}.png`) })
    await close.click()
    await expect(editor).toHaveCount(0)
    expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toMatchObject({
      disabledTracks: [3],
      currentMidi: null,
      isPlaying: false,
      keyboardStatus: 'idle',
      eventCount: 24,
    })
  })
}

test('empty-track visibility defaults on and never changes enabled tracks or an open editor', async ({
  page,
}) => {
  await openDetail(page)
  const filter = page.getByRole('button', { name: '隐藏没有音符的音轨', exact: true })
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => rowIds(page)).toEqual(['1', '2'])
  const before = await page.evaluate(() => window.midiDetailFixture.snapshot())
  await filter.click()
  await expect.poll(() => rowIds(page)).toEqual(['0', '1', '2', '3'])
  await page.locator('.pr-track[data-track-id="0"] .pr-track-select').dblclick()
  const editor = page.locator('.detail-piano-editor')
  await expect(editor).toBeVisible()
  await expect(editor.locator('.piano-roll-slot-title')).toHaveText('指挥轨')
  const originalEditor = await editor.elementHandle()
  await filter.click()
  await expect.poll(() => rowIds(page)).toEqual(['1', '2'])
  await expect(editor.locator('.piano-roll-slot-title')).toHaveText('指挥轨')
  expect(
    await originalEditor!.evaluate(
      (element) => element === document.querySelector('.detail-piano-editor')
    )
  ).toBe(true)
  expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toEqual(before)
})

test('an all-empty MIDI retains a usable filter to reveal its tracks', async ({ page }) => {
  await openDetail(page, '?empty=1')
  await expect(page.locator('.detail-piano-roll .pr-track')).toHaveCount(0)
  await expect(page.locator('.detail-piano-roll .pr-empty')).toHaveText('没有包含音符的音轨')
  const filter = page.getByRole('button', { name: '隐藏没有音符的音轨', exact: true })
  await expect(filter).toBeVisible()
  await filter.click()
  await expect.poll(() => rowIds(page)).toEqual(['0', '1', '2', '3'])
  expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toMatchObject({
    disabledTracks: [3],
    currentMidi: null,
    isPlaying: false,
    keyboardStatus: 'idle',
    eventCount: 0,
  })
})

test('Escape cancels a playhead drag before closing the details on a second press', async ({ page }) => {
  await openDetail(page)
  await page.locator('.pr-track[data-track-id="1"] .pr-track-select').dblclick()
  const editor = page.locator('.detail-piano-editor')
  await expect(editor).toBeVisible()
  const handle = editor.locator('.pr-handle')
  const bounds = await handle.boundingBox()
  const before = await page.evaluate(() => window.midiDetailFixture.snapshot())
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 8)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + 120, bounds!.y + 8, { steps: 4 })
  await expect(handle).not.toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(editor).toBeVisible()
  await expect(handle).toHaveAttribute('aria-valuenow', '0')
  expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toEqual(before)
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toEqual(before)
})

for (const variant of ['overview', 'editor'] as const) {
  test(`actual ${variant} trackpad vertical wheel preserves Follow in the pane and gutter`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 620 })
    await openDetail(page)
    await page.getByRole('button', { name: '隐藏没有音符的音轨', exact: true }).click()
    await page.locator('.pr-track[data-track-id="1"] .pr-track-select').dblclick()
    const overview = page.locator('.detail-piano-roll')
    const editor = page.locator('.detail-piano-editor')
    await expect(editor).toBeVisible()
    const before = await page.evaluate(() => window.midiDetailFixture.snapshot())
    const current = variant === 'overview' ? overview : editor
    const other = variant === 'overview' ? editor : overview
    const follow = current.locator('.piano-roll-app-toolbar button[aria-pressed]').first()
    const otherFollow = other.locator('.piano-roll-app-toolbar button[aria-pressed]').first()
    const scroll = current.locator('.pr-scroll')

    // 用真实 antd Slider 制造横向可滚范围，避免内容恰好铺满时掩盖横向杂量。
    const zoom = current.locator('.piano-roll-app-slider').first().getByRole('slider')
    await zoom.focus()
    await page.keyboard.press('End')
    await expect.poll(() => scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await expect.poll(() => scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)

    for (const surface of ['.pr-scroll', '.pr-gutter']) {
      if (await follow.getAttribute('aria-pressed') === 'false') await follow.click()
      await expect(follow).toHaveAttribute('aria-pressed', 'true')
      await scroll.evaluate((element) => { element.scrollTop = 0 })
      const initialLeft = await scroll.evaluate((element) => element.scrollLeft)
      await current.locator(surface).hover()
      for (let gesture = 0; gesture < 16; gesture += 1) {
        const noiseX = [0, 0.25, 1, 6][gesture % 4]!
        await page.mouse.wheel(noiseX, gesture % 2 === 0 ? 80 : -60)
        // 连续上下滑动的尾帧可能只剩横向小量，不能因此把按钮切到未跟随。
        await page.mouse.wheel(6, 0)
        // Wheel 是异步原生输入；必须等后续 scroll 落地，不能在旧的选中态上误判通过。
        await page.waitForTimeout(80)
        await expect(follow).toHaveAttribute('aria-pressed', 'true')
        await expect(follow).toHaveClass(/ant-btn-primary/)
        await expect(otherFollow).toHaveAttribute('aria-pressed', 'true')
        expect(await scroll.evaluate((element) => element.scrollLeft)).toBeLessThanOrEqual(initialLeft + 6)
      }
      expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBe(initialLeft)

      const visibleWidth = await scroll.evaluate((element) => element.clientWidth)
      await page.mouse.wheel(Math.ceil(visibleWidth / 4) + 20, 6)
      await expect(follow).toHaveAttribute('aria-pressed', 'false')
      await expect(otherFollow).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialLeft)
    }
    expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toEqual(before)
  })
}

for (const copy of [
  { locale: 'zh-CN', title: '钢琴卷帘操作说明', done: '知道了', filter: '隐藏没有音符的音轨', readOnly: '当前版本' },
  { locale: 'en-US', title: 'Piano Roll Guide', done: 'Got it', filter: 'Hide tracks without notes', readOnly: 'Current version' },
]) {
  test(`actual ${copy.locale} help dialog is complete, accessible and isolated from playback`, async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 680 })
    await openDetail(page, `?locale=${copy.locale}`)
    await page.locator('.pr-track[data-track-id="1"] .pr-track-select').dblclick()
    const editor = page.locator('.detail-piano-editor')
    const originalEditor = await editor.elementHandle()
    const before = await page.evaluate(() => window.midiDetailFixture.snapshot())
    const help = page.getByRole('button', { name: copy.title, exact: true })
    const filter = page.getByRole('button', { name: copy.filter, exact: true })
    const helpBox = await help.boundingBox()
    const filterBox = await filter.boundingBox()
    expect(helpBox!.x - filterBox!.x - filterBox!.width).toBeGreaterThanOrEqual(6)
    expect(helpBox!.x - filterBox!.x - filterBox!.width).toBeLessThanOrEqual(10)
    expect(780 - helpBox!.x - helpBox!.width).toBeLessThanOrEqual(28)
    await help.hover()
    await expect(page.getByRole('tooltip', { name: copy.title })).toBeVisible()
    await help.click()
    const dialog = page.getByRole('dialog', { name: copy.title, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('h3')).toHaveCount(3)
    await expect(dialog.locator('dt')).toHaveCount(9)
    await expect(dialog.getByText(copy.readOnly, { exact: true })).toBeAttached()
    const body = dialog.locator('.ant-modal-body')
    expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(780)
    expect(box!.y + box!.height).toBeLessThanOrEqual(680)
    await page.mouse.move(0, 0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`midi-detail-help-${copy.locale}.png`) })
    await dialog.getByText(copy.readOnly, { exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByText(copy.readOnly, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: copy.done, exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`midi-detail-help-end-${copy.locale}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(editor).toBeVisible()
    expect(await originalEditor!.evaluate((element) => element === document.querySelector('.detail-piano-editor'))).toBe(true)
    await help.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: copy.done, exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => window.midiDetailFixture.snapshot())).toEqual(before)
  })
}
