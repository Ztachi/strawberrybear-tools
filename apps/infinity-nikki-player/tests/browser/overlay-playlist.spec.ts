import { test, expect, type Page } from '@playwright/test'

async function openPlaylist(page: Page): Promise<void> {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1&overlay-playlist=1')
  await page.getByRole('button', { name: '进入悬浮模式', exact: true }).click()
  await page.evaluate(() => {
    window.midiEditorFixture.setSongs(['Alpha.mid', 'Beta.mid', 'Gamma.mid', 'Alpha two.mid'])
    window.midiEditorFixture.setSongLists([
      { id: 'favorites', name: '喜欢的歌', filenames: ['Alpha.mid', 'Beta.mid', 'Alpha two.mid'] },
      { id: 'empty', name: '空歌单', filenames: [] },
    ])
  })
  await page.setViewportSize({ width: 360, height: 320 })
  await page.getByRole('button', { name: '展开', exact: true }).click()
}

async function choosePlaylist(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: '选择歌单', exact: true }).click()
  await page
    .locator('.overlay-playlist-select-popup .ant-select-item-option')
    .getByText(name, { exact: true })
    .click()
  await expect(page.locator('.overlay-playlist-select-popup')).not.toBeVisible()
}

test('搜索与歌单选择只改变显示，播放使用完整歌单队列', async ({ page }, testInfo) => {
  await openPlaylist(page)
  const initial = await page.evaluate(() => window.midiEditorFixture.previewState())
  const songs = page.locator('.playlist-item')
  await expect(songs).toHaveCount(4)
  const search = page.getByRole('textbox', { name: '搜索歌曲', exact: true })
  await search.fill('  ALPHA  ')
  await expect(songs).toHaveCount(2)
  await choosePlaylist(page, '喜欢的歌')
  await expect(songs).toHaveCount(2)
  expect(await page.evaluate(() => window.midiEditorFixture.previewState())).toEqual(initial)
  await songs.filter({ hasText: 'Alpha two' }).click()
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.previewState()))
    .toEqual({
      filename: 'Alpha two.mid',
      source: 'song-list:favorites',
      queue: ['Alpha.mid', 'Beta.mid', 'Alpha two.mid'],
    })
  await page.getByRole('button', { name: '上一曲', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.previewState().filename))
    .toBe('Beta.mid')
  await page.getByRole('button', { name: '停止', exact: true }).click()
  await search.fill('Gamma')
  await expect(page.locator('.playlist-empty')).toHaveText('没有找到歌曲')
  await choosePlaylist(page, '全部歌曲')
  await expect(songs).toHaveCount(1)
  expect((await page.evaluate(() => window.midiEditorFixture.previewState())).source).toBe(
    'song-list:favorites'
  )
  await songs.click()
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.previewState().source))
    .toBe('all')
  expect((await page.evaluate(() => window.midiEditorFixture.previewState())).queue).toHaveLength(4)
  await page.getByRole('button', { name: '停止', exact: true }).click()
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).not.toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('overlay-playlist-search.png'),
    animations: 'disabled',
  })
})

test('小窗口操作栏保持紧凑，歌单可搜索，收起保留浏览条件', async ({ page }, testInfo) => {
  await openPlaylist(page)
  const select = page.getByRole('combobox', { name: '选择歌单', exact: true })
  await select.click()
  await expect(
    page.locator('.overlay-playlist-select-popup .ant-select-item-option-content')
  ).toHaveText(['全部歌曲', '喜欢的歌', '空歌单'])
  await select.fill('喜欢')
  await expect(page.locator('.overlay-playlist-select-popup .ant-select-item-option')).toHaveCount(
    1
  )
  await select.press('Enter')
  const search = page.getByRole('textbox', { name: '搜索歌曲', exact: true })
  await search.fill('Beta')
  await expect(page.locator('.playlist-item')).toHaveCount(1)
  for (const control of [search, page.locator('.overlay-playlist-toolbar .ant-select')]) {
    const box = (await control.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(26)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  }
  await page.getByRole('button', { name: '收起', exact: true }).click()
  await page.getByRole('button', { name: '展开', exact: true }).click()
  await expect(search).toHaveValue('Beta')
  await expect(page.locator('.playlist-item')).toHaveText(/Beta/)
  await choosePlaylist(page, '空歌单')
  await expect(page.locator('.playlist-empty')).toHaveText('暂无歌曲')
  await choosePlaylist(page, '全部歌曲')
  await search.fill('')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).not.toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('overlay-playlist.png'),
    animations: 'disabled',
  })
})

test('定位清除隐藏当前歌曲的筛选，删除浏览中的歌单回到全部歌曲', async ({ page }) => {
  await openPlaylist(page)
  await choosePlaylist(page, '喜欢的歌')
  await page.locator('.playlist-item').filter({ hasText: 'Beta' }).click()
  await page.getByRole('button', { name: '停止', exact: true }).click()
  const state = await page.evaluate(() => window.midiEditorFixture.previewState())
  await choosePlaylist(page, '空歌单')
  await page.getByRole('textbox', { name: '搜索歌曲', exact: true }).fill('hidden')
  await page.getByRole('button', { name: '定位', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '搜索歌曲', exact: true })).toHaveValue('')
  await expect(page.locator('.playlist-item.active')).toContainText('Beta')
  expect(await page.evaluate(() => window.midiEditorFixture.previewState())).toEqual(state)
  await choosePlaylist(page, '空歌单')
  await page.evaluate(() =>
    window.midiEditorFixture.setSongLists([
      { id: 'favorites', name: '喜欢的歌', filenames: ['Alpha.mid', 'Beta.mid', 'Alpha two.mid'] },
    ])
  )
  await expect(page.locator('.overlay-playlist-toolbar .ant-select')).toContainText('全部歌曲')
  await expect(page.locator('.playlist-item')).toHaveCount(4)
  expect(await page.evaluate(() => window.midiEditorFixture.previewState())).toEqual(state)
})

test('长列表的工具栏固定，定位恢复筛选后让当前歌曲进入滚动区', async ({ page }) => {
  await openPlaylist(page)
  await page.evaluate(() => {
    const filenames = Array.from(
      { length: 30 },
      (_, i) => `Song ${String(i + 1).padStart(2, '0')}.mid`
    )
    window.midiEditorFixture.setSongs(filenames)
    window.midiEditorFixture.setSongLists([{ id: 'long', name: '长歌单', filenames }])
  })
  await choosePlaylist(page, '长歌单')
  const toolbar = page.locator('.overlay-playlist-toolbar')
  const before = (await toolbar.boundingBox())!.y
  const current = page.locator('.playlist-item').filter({ hasText: 'Song 30' })
  await current.click()
  await page.getByRole('button', { name: '停止', exact: true }).click()
  expect((await toolbar.boundingBox())!.y).toBe(before)
  const search = page.getByRole('textbox', { name: '搜索歌曲', exact: true })
  await search.fill('Song 01')
  await expect(current).toHaveCount(0)
  await page.getByRole('button', { name: '定位', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect
    .poll(async () => {
      const row = (await current.boundingBox())!
      const list = (await page.locator('.playlist').boundingBox())!
      return row.y >= list.y && row.y + row.height <= list.y + list.height
    })
    .toBe(true)
  expect((await toolbar.boundingBox())!.y).toBe(before)
})
