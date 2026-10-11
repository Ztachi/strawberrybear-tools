import { expect, test, type Locator } from '@playwright/test'

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
        ({ title, status }) => window.midiEditorFixture.setCurrentSong(`${title}.mid`, status),
        { title: longTitle, status }
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
