import { expect, test, type Locator, type Page } from '@playwright/test'

/** 检查实际动画与位移，不能只验证当前歌曲的高亮样式。 */
async function expectMoving(title: Locator): Promise<void> {
  const content = title.locator('.marquee-text__content')
  await expect(content).toBeVisible()
  await expect
    .poll(() => content.evaluate((node) => getComputedStyle(node).animationName))
    .toMatch(/^marquee-text-ping-pong(?:-|$)/)
  await content.evaluate((node) => {
    const animation = node.getAnimations()[0]!
    animation.currentTime = Number(animation.effect!.getTiming().duration) / 2
  })
  await expect
    .poll(() => content.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41))
    .toBeLessThan(-1)
}

async function expectStatic(title: Locator): Promise<void> {
  const content = title.locator('.marquee-text__content')
  await expect(content).toBeVisible()
  await expect
    .poll(() =>
      content.evaluate((node) => ({
        animation: getComputedStyle(node).animationName,
        transform: getComputedStyle(node).transform,
        overflow: getComputedStyle(node).textOverflow,
      }))
    )
    .toEqual({ animation: 'none', transform: 'none', overflow: 'ellipsis' })
}

test('播放队列当前长曲名往返滚动，暂停和停止保留滚动', async ({ page }) => {
  await page.goto('/tests/browser/midi-detail-page.html?controls=1&longTitle=1')
  await page.getByRole('button', { name: '打开播放队列', exact: true }).click()
  const drawer = page.locator('.play-queue-drawer')
  const title = drawer.locator('.queue-song-title').first()
  await expectStatic(title)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  await page.getByRole('button', { name: '打开播放队列', exact: true }).click()
  await expectMoving(title)
  await expectStatic(drawer.locator('.queue-song-title').nth(1))
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await page
    .locator('.global-music-player')
    .getByRole('button', { name: '暂停', exact: true })
    .click()
  await page.getByRole('button', { name: '打开播放队列', exact: true }).click()
  await expectMoving(title)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await page
    .locator('.global-music-player')
    .getByRole('button', { name: '停止', exact: true })
    .click()
  await page.getByRole('button', { name: '打开播放队列', exact: true }).click()
  await expectMoving(title)
  await drawer.locator('.queue-item').nth(1).click()
  await expectStatic(title)
  await expectStatic(drawer.locator('.queue-song-title').nth(1))
})

const longTitle =
  '非常长的验收歌曲名称：用于验证当前歌曲在所有播放列表中左右自动滚动，其他歌曲仍保持静态省略号'

for (const collection of ['navigation', 'playlist']) {
  test(`${collection} 列表响应当前歌曲，未播放、暂停及停止均滚动，切歌后恢复静态`, async ({
    page,
  }) => {
    await page.goto(`/tests/browser/midi-editor-page.html?${collection}=1`)
    await expect(page.locator('.song-row').first()).toBeVisible()
    await page.evaluate((title) => {
      window.midiEditorFixture.setSongs([`${title}.mid`, '短歌.mid'])
      window.midiEditorFixture.setSongLists([
        { id: 'favorites', name: '喜欢的歌', filenames: [`${title}.mid`, '短歌.mid'] },
      ])
    }, longTitle)
    // 曲库变化会自动修复播放队列；在该响应式更新之后设置无当前歌曲的输入。
    await page.evaluate(() => window.midiEditorFixture.setCurrentSong(null, 'stopped'))
    const title = page.locator('.song-title').filter({ hasText: longTitle })
    await expectStatic(title)
    const initialWidth = (await title.boundingBox())!.width
    for (const status of ['stopped', 'playing', 'paused'] as const) {
      await page.evaluate(
        ({ title, status, source }) =>
          window.midiEditorFixture.setCurrentSong(`${title}.mid`, status, undefined, source),
        {
          title: longTitle,
          status,
          source: collection === 'playlist' ? 'song-list:favorites' : 'all',
        }
      )
      await expectMoving(title)
      expect((await title.boundingBox())!.width).toBeCloseTo(initialWidth, 0)
    }
    await page.evaluate(() => window.midiEditorFixture.setCurrentSong('短歌.mid', 'stopped'))
    await expectStatic(title)
    await expectStatic(page.locator('.song-title').filter({ hasText: '短歌' }))
    await page.evaluate(
      (title) => window.midiEditorFixture.setCurrentSong(`${title}.mid`, 'stopped'),
      longTitle
    )
    await expectMoving(title)
  })
}

test('悬浮列表在选中未播放和暂停时滚动，保持歌曲及时间的原有宽度', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1&overlay-playlist=1')
  await page.getByRole('button', { name: '进入悬浮模式', exact: true }).click()
  await page.evaluate((title) => {
    window.midiEditorFixture.setSongs([`${title}.mid`, '短歌.mid'])
  }, longTitle)
  await page.evaluate(() => window.midiEditorFixture.setCurrentSong(null, 'stopped'))
  await page.setViewportSize({ width: 360, height: 320 })
  await page.getByRole('button', { name: '展开', exact: true }).click()
  const title = page.locator('.playlist-name').first()
  await expectStatic(title)
  const duration = page.locator('.playlist-duration').first()
  const initialTimeBox = (await duration.boundingBox())!
  for (const status of ['stopped', 'paused'] as const) {
    await page.evaluate(
      ({ title, status }) => window.midiEditorFixture.setCurrentSong(`${title}.mid`, status),
      { title: longTitle, status }
    )
    await expectMoving(title)
    await expect(duration).toBeVisible()
    const timeBox = (await duration.boundingBox())!
    expect(timeBox.x).toBeCloseTo(initialTimeBox.x, 0)
    expect(timeBox.width).toBeCloseTo(initialTimeBox.width, 0)
    expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(360)
  }
  await page.evaluate(() => window.midiEditorFixture.setCurrentSong('短歌.mid', 'stopped'))
  await expectStatic(title)
  await expectStatic(page.locator('.playlist-name').nth(1))
  await page.screenshot({ path: test.info().outputPath('overlay-marquee.png') })
})

test('在线曲库按当前歌曲的在线 ID 或文件哈希响应，暂停后持续滚动', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?online=1')
  await expect(page.locator('.song-card').first()).toBeVisible()
  await page.evaluate((title) => {
    window.midiEditorFixture.setOnlineTitles([title, '短歌'])
    window.midiEditorFixture.setSongs(['imported.mid'])
  }, longTitle)
  await page.evaluate(() => window.midiEditorFixture.setCurrentSong(null, 'stopped'))
  const title = page.locator('.song-card h3 .marquee-text').first()
  await expectStatic(title)
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong('imported.mid', 'stopped', { id: 'online-1' })
  )
  await expectMoving(title)
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong('imported.mid', 'paused', { sha256: 'fixture-1' })
  )
  await expectMoving(title)
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong('imported.mid', 'paused', { id: 'online-2' })
  )
  await expectStatic(title)
  await expectStatic(page.locator('.song-card h3 .marquee-text').nth(1))
})

test('独立窗口队列统一响应主窗口当前歌曲，暂停与停止保留滚动', async ({ page }) => {
  await page.goto('/tests/browser/midi-detail-page.html?controls=1&longTitle=1')
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await expect(popup.locator('.detail-piano-roll')).toBeVisible()
  await popup.getByRole('button', { name: '打开播放队列', exact: true }).click()
  const drawer = popup.locator('.play-queue-drawer')
  const title = drawer.locator('.queue-song-title').first()
  await expectMoving(title)
  for (const control of ['暂停', '停止']) {
    await page
      .locator('.global-music-player')
      .getByRole('button', { name: control, exact: true })
      .click()
    await expectMoving(title)
  }
  await drawer.locator('.queue-item').nth(1).click()
  await expectStatic(title)
  await expectStatic(drawer.locator('.queue-song-title').nth(1))
  await popup.evaluate(() => window.dispatchEvent(new Event('test-native-close')))
  await expect.poll(() => popup.isClosed()).toBe(true)
})

async function chooseOverlayCollection(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: '选择歌单', exact: true }).click()
  await page
    .locator('.overlay-playlist-select-popup .ant-select-item-option')
    .getByText(name, { exact: true })
    .click()
}

test('同曲跨歌单只在实际播放域高亮和滚动，悬浮定位恢复实际来源', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1&overlay-playlist=1')
  await page.getByRole('button', { name: '进入悬浮模式', exact: true }).click()
  await page.evaluate((title) => {
    window.midiEditorFixture.setSongs([`${title}.mid`, '短歌.mid'])
    window.midiEditorFixture.setSongLists([
      { id: 'one', name: '歌单一', filenames: [`${title}.mid`, '短歌.mid'] },
      { id: 'two', name: '歌单二', filenames: [`${title}.mid`] },
    ])
  }, longTitle)
  await page.setViewportSize({ width: 360, height: 320 })
  await page.getByRole('button', { name: '展开', exact: true }).click()
  const row = page.locator('.playlist-item').filter({ hasText: longTitle })
  const title = row.locator('.playlist-name')
  await row.click()
  await page.getByRole('button', { name: '停止', exact: true }).click()
  await expect(row).toHaveClass(/active/)
  await expectMoving(title)
  const initial = await page.evaluate(() => window.midiEditorFixture.previewState())
  expect(initial.source).toBe('all')
  await chooseOverlayCollection(page, '歌单一')
  await expect(page.locator('.playlist-item.active')).toHaveCount(0)
  await expectStatic(title)
  expect(await page.evaluate(() => window.midiEditorFixture.previewState())).toEqual(initial)
  await chooseOverlayCollection(page, '歌单二')
  await expect(page.locator('.playlist-item.active')).toHaveCount(0)
  await expectStatic(title)
  await row.click()
  await page.getByRole('button', { name: '停止', exact: true }).click()
  expect((await page.evaluate(() => window.midiEditorFixture.previewState())).source).toBe(
    'song-list:two'
  )
  await expectMoving(title)
  await chooseOverlayCollection(page, '全部歌曲')
  await expect(page.locator('.playlist-item.active')).toHaveCount(0)
  await expectStatic(title)
  await page.getByRole('button', { name: '定位', exact: true }).click()
  await expect(page.locator('.overlay-playlist-toolbar .ant-select')).toContainText('歌单二')
  await expect(row).toHaveClass(/active/)
  await expectMoving(title)
})

test('主界面同曲在别的歌单和全部歌曲中不冒充当前播放项', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await page.evaluate((title) => {
    window.midiEditorFixture.setSongs([`${title}.mid`, '短歌.mid'])
    window.midiEditorFixture.setSongLists([
      { id: 'one', name: '歌单一', filenames: [`${title}.mid`, '短歌.mid'] },
      { id: 'two', name: '歌单二', filenames: [`${title}.mid`] },
    ])
  }, longTitle)
  await page.evaluate(
    (title) => window.midiEditorFixture.setCurrentSong(`${title}.mid`, 'playing'),
    longTitle
  )
  const row = page.locator('.song-row').filter({ hasText: longTitle })
  const title = row.locator('.song-title')
  await expect(row).toHaveClass(/song-row-current/)
  await expectMoving(title)
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/song-lists/one'))
  await expect(page.locator('.main-page-leave-active')).toHaveCount(0)
  await expect(row).toHaveCount(1)
  await expect(page.locator('.song-row-current')).toHaveCount(0)
  await expectStatic(title)
  await expect(row.getByRole('button', { name: '播放歌曲', exact: true })).toBeVisible()
  await expect(row.locator('.playing-bars')).toHaveCount(0)
  await page.evaluate(
    (title) =>
      window.midiEditorFixture.setCurrentSong(`${title}.mid`, 'paused', undefined, 'song-list:one'),
    longTitle
  )
  await expect(row).toHaveClass(/song-row-current/)
  await expectMoving(title)
  const search = page.getByPlaceholder('搜索歌曲', { exact: true })
  await search.fill('短歌')
  await expect(row).toHaveCount(0)
  await search.fill('')
  await expectMoving(title)
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/song-lists/two'))
  await expect(page.locator('.main-page-leave-active')).toHaveCount(0)
  await expect(row).toHaveCount(1)
  await expect(page.locator('.song-row-current')).toHaveCount(0)
  await expectStatic(title)
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/all'))
  await expect(page.locator('.main-page-leave-active')).toHaveCount(0)
  await expect(row).toHaveCount(1)
  await expect(page.locator('.song-row-current')).toHaveCount(0)
  await expectStatic(title)
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/song-lists/one'))
  await expect(page.locator('.main-page-leave-active')).toHaveCount(0)
  await expect(row).toHaveCount(1)
  await expect(page.locator('.song-list-detail-page h1')).toHaveText('歌单一')
  await expect(page.locator('.song-row')).toHaveCount(2)
  await expectMoving(title)
  await page.evaluate(
    (title) =>
      window.midiEditorFixture.setSongLists([
        { id: 'one', name: '改名后的歌单', filenames: [`${title}.mid`, '短歌.mid'] },
        { id: 'two', name: '歌单二', filenames: [`${title}.mid`] },
      ]),
    longTitle
  )
  await expect(row).toHaveClass(/song-row-current/)
  await expectMoving(title)
  await page.evaluate(
    (title) =>
      window.midiEditorFixture.setSongLists([
        { id: 'two', name: '歌单二', filenames: [`${title}.mid`] },
      ]),
    longTitle
  )
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.previewState().source))
    .toBe('all')
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/all'))
  await expect(page.locator('.main-page-leave-active')).toHaveCount(0)
  await expect(row).toHaveCount(1)
  await expect(row).toHaveClass(/song-row-current/)
  await expectMoving(title)
})

test('在线曲库同曲在歌单播放域保持静态，临时在线试听只匹配自己的来源', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?online=1')
  await expect(page.locator('.song-card').first()).toBeVisible()
  await page.evaluate((title) => {
    window.midiEditorFixture.setOnlineTitles([title, '短歌'])
    window.midiEditorFixture.setSongs(['imported.mid'])
    window.midiEditorFixture.setSongLists([
      { id: 'one', name: '歌单一', filenames: ['imported.mid'] },
    ])
  }, longTitle)
  const title = page.locator('.song-card h3 .marquee-text').first()
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong(
      'imported.mid',
      'playing',
      { id: 'online-1' },
      'song-list:one'
    )
  )
  await expectStatic(title)
  await expect(
    page.locator('.song-card').first().getByRole('button', { name: '停止播放', exact: true })
  ).toHaveCount(0)
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong('imported.mid', 'paused', { id: 'online-1' }, 'all')
  )
  await expectMoving(title)
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong(
      'imported.mid',
      'paused',
      { id: 'online-1', temporary: true },
      'online-preview:online-1'
    )
  )
  await expectMoving(title)
  await page.evaluate(() =>
    window.midiEditorFixture.setCurrentSong(
      'imported.mid',
      'playing',
      { id: 'online-1', temporary: true },
      'online-preview:online-2'
    )
  )
  await expectStatic(title)
})

for (const entry of ['列表', '详情'] as const) {
  test(`临时试听后从在线${entry}播放先前已导入歌曲，保持播放而非误暂停`, async ({ page }) => {
    await page.goto('/tests/browser/midi-editor-page.html?online=1&online-playback=1')
    await expect(page.locator('.song-card').first()).toBeVisible()
    await page.evaluate(() => {
      window.midiEditorFixture.setSongs(['imported.mid'])
      window.midiEditorFixture.setOnlineTitles(['已导入歌曲 A', '临时歌曲 B'])
    })
    await page.evaluate(() =>
      window.midiEditorFixture.setCurrentSong('imported.mid', 'stopped', { id: 'online-1' }, 'all')
    )
    const card = page.locator('.song-card').first()
    await card.getByRole('button', { name: '播放', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => window.midiEditorFixture.previewStatus()))
      .toBe('playing')
    if (entry === '详情') {
      await page.evaluate(() => window.midiEditorFixture.navigate('/online-library/song/online-1'))
      await expect(page.locator('.detail-actions')).toBeVisible()
    }
    expect(await page.evaluate(() => window.midiEditorFixture.auditionOnlineSong('online-2'))).toBe(
      true
    )
    await expect
      .poll(() => page.evaluate(() => window.midiEditorFixture.previewState().source))
      .toBe('online-preview:online-2')
    const actions = entry === '详情' ? page.locator('.detail-actions') : card
    await actions.getByRole('button', { name: '播放', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => window.midiEditorFixture.previewState()))
      .toEqual({ filename: 'imported.mid', source: 'all', queue: ['imported.mid'] })
    await expect
      .poll(() => page.evaluate(() => window.midiEditorFixture.previewStatus()))
      .toBe('playing')
  })
}
