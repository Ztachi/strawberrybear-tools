import { expect, test } from '@playwright/test'
import type {} from './midi-detail-page'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/midi-detail-page.html')
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
})
test.afterEach(async ({ page }) => {
  const state = await page.evaluate(() => window.midiDetailFixture.snapshot())
  expect(
    state.nativeCalls.every((call) =>
      ['extract_all_notes', 'extract_melody', 'load_midi_config', 'save_midi_config'].includes(call)
    )
  ).toBe(true)
  expect(state.keyboardStatus).toBe('idle')
})

test('detached editor switches tracks and songs, restores on native close, and releases overview space', async ({
  page,
}) => {
  await page.locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select').dblclick()
  const embedded = page.locator('.detail-piano-editor')
  await embedded.locator('.ant-slider').last().getByRole('slider').press('ArrowRight')
  const pitch = await embedded
    .locator('.ant-slider')
    .last()
    .getByRole('slider')
    .getAttribute('aria-valuenow')
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await popupPromise
  await expect(popup.locator('.detail-piano-editor')).toBeVisible()
  await expect(embedded).toHaveCount(0)
  await expect(page.locator('.detail-piano-roll')).toHaveCount(0)
  await expect(popup.locator('.detail-piano-roll')).toBeVisible()
  await expect(popup.locator('.ant-slider').last().getByRole('slider')).toHaveAttribute(
    'aria-valuenow',
    pitch!
  )
  await popup.locator('.detail-piano-roll .pr-track[data-track-id="2"] .pr-track-select').click()
  await expect(popup.locator('.detail-piano-editor .piano-roll-slot-title')).toHaveText('低音')
  const trackSwitch = popup
    .locator('.detail-piano-roll .pr-track[data-track-id="2"]')
    .getByRole('switch')
  await expect(trackSwitch).toHaveAttribute('aria-checked', 'false')
  await trackSwitch.click()
  await expect(trackSwitch).toHaveAttribute('aria-checked', 'true')
  await expect
    .poll(
      async () => (await page.evaluate(() => window.midiDetailFixture.snapshot())).disabledTracks
    )
    .not.toContain(3)
  await page.evaluate(() => window.midiDetailFixture.navigate('second.mid'))
  await expect(popup.locator('.detached-song-title')).toHaveText('第二首验收歌曲')
  await popup.evaluate(() => window.dispatchEvent(new Event('test-native-close')))
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(page.locator('.detail-piano-editor')).toBeVisible()
})

test('a missing song ends loading in the detached workspace instead of retaining stale tracks', async ({
  page,
}) => {
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await expect(popup.locator('.detail-piano-roll')).toBeVisible()
  await page.evaluate(() => window.midiDetailFixture.navigate('missing.mid'))
  await expect(popup.locator('.detached-song-title')).toHaveText('missing.mid')
  await expect(popup.locator('.pr-track')).toHaveCount(0)
  await expect(popup.locator('.ant-spin')).toHaveCount(0)
  await expect(popup.locator('.detached-error')).toBeVisible()
  await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
})

test('auto switch defaults off, follows the playing identity only when enabled, and leaves playback unchanged', async ({
  page,
}) => {
  const button = page.getByRole('button', { name: '自动切换', exact: true })
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.midiDetailFixture.play('second.mid'))
  await expect(page.locator('.detail-title')).toHaveText('钢琴卷帘界面验收')
  await button.hover()
  await expect(page.getByRole('tooltip')).toContainText('不会改变播放队列')
  await button.click()
  await expect(page.locator('.detail-title')).toHaveText('第二首验收歌曲')
  await button.click()
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  await expect(page.locator('.detail-title')).toHaveText('第二首验收歌曲')
  expect((await page.evaluate(() => window.midiDetailFixture.snapshot())).isPlaying).toBe(true)
})

test('slider endpoints and low-factor pinches share exact bounds without a left dead zone', async ({
  page,
}) => {
  await page.locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select').dblclick()
  for (const selector of ['.detail-piano-roll', '.detail-piano-editor']) {
    const target = page.locator(selector)
    const slider = target.locator('.ant-slider').first().getByRole('slider')
    await slider.press('Home')
    await expect(slider).toHaveAttribute('aria-valuenow', '0')
    const scroll = target.locator('.pr-scroll')
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(1)
    await target.locator('.pr-view').evaluate((element) => {
      for (const [type, scale] of [
        ['gesturestart', 1],
        ['gesturechange', 0.01],
        ['gesturechange', 0.02],
        ['gestureend', 0.02],
      ] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.assign(event, { scale, clientX: element.getBoundingClientRect().left + 200 })
        element.dispatchEvent(event)
      }
    })
    // 同一次手势越过最小值后反向，也必须立即增大，不能等 scale 回到 1。
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(10)
    await slider.press('Home')
    const pinch = async (scale: number) =>
      target.locator('.pr-view').evaluate((element, scale) => {
        for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
          const event = new Event(type, { bubbles: true, cancelable: true })
          Object.assign(event, {
            scale: type === 'gesturestart' ? 1 : scale,
            clientX: element.getBoundingClientRect().left + 200,
          })
          element.dispatchEvent(event)
        }
      }, scale)
    await pinch(0.2)
    await expect(slider).toHaveAttribute('aria-valuenow', '0')
    await pinch(2)
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(10)
    const position = Number(await slider.getAttribute('aria-valuenow'))
    const zoom = await page.evaluate((selector) => {
      const saved = JSON.parse(
        localStorage.getItem('infinity-nikki-player:piano-roll-zoom:v1:piano-detail-fixture.mid')!
      )
      return selector.includes('editor') ? saved.editorTimeZoom : saved.overviewTimeZoom
    }, selector)
    const width = await scroll.evaluate((el) => el.clientWidth)
    // 手指放大 2 倍，默认倍率指数为 2，真实时间轴展开 4 倍并原样持久化。
    expect(zoom).toBeCloseTo((width / 10) * 4, 6)
    await pinch(2)
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeCloseTo(position * 2, 4)
    await slider.press('Home')
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(1)
  }
})

test('leaving the detail route destroys its window and a subsequent open creates a fresh session', async ({
  page,
}) => {
  await page.locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select').dblclick()
  const promise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await promise
  await expect(popup.locator('.detail-piano-editor')).toBeVisible()
  await page.evaluate(() => window.midiDetailFixture.navigate(''))
  await expect.poll(() => popup.isClosed()).toBe(true)
  await page.evaluate(() => window.midiDetailFixture.navigate('piano-detail-fixture.mid'))
  await page.locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select').dblclick()
  const reopened = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const newPopup = await reopened
  await expect(newPopup.locator('.detail-piano-editor')).toBeVisible()
  expect(new URL(newPopup.url()).searchParams.get('session')).not.toBe(
    new URL(popup.url()).searchParams.get('session')
  )
  await newPopup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
  await expect.poll(() => newPopup.isClosed()).toBe(true)
})

test('large detached workspace renders continuous local frames between transport messages', async ({
  page,
}) => {
  await page.locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select').dblclick()
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await popup.setViewportSize({ width: 2800, height: 1500 })
  const editor = popup.locator('.detail-piano-editor')
  await expect(editor).toBeVisible()
  await editor.locator('.ant-slider').first().getByRole('slider').press('End')
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  await expect
    .poll(async () => Number(await editor.locator('.pr-handle').getAttribute('aria-valuenow')))
    .toBeGreaterThan(4)
  const result = await popup.evaluate(async () => {
    let messages = 0
    const receive = (event: MessageEvent) => {
      if (event.data.update?.kind === 'transport') messages++
    }
    window.addEventListener('message', receive)
    const values: number[] = []
    const positions: string[] = []
    for (let frame = 0; frame < 30; frame++) {
      await new Promise(requestAnimationFrame)
      const handle = document.querySelector<HTMLElement>('.detail-piano-editor .pr-handle')!
      values.push(Number(handle.getAttribute('aria-valuenow')))
      positions.push(handle.style.transform)
    }
    window.removeEventListener('message', receive)
    return { messages, distinctFrames: new Set(values).size, positions: new Set(positions).size }
  })
  expect(result.distinctFrames).toBeGreaterThan(result.messages + 10)
  expect(result.positions).toBe(1)
  await popup.screenshot({ path: test.info().outputPath('piano-workspace-large.png') })
  await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
})

for (const follow of [true, false]) {
  test(`occluded host keeps detached playback continuous across heartbeats (follow=${follow})`, async ({
    page,
  }) => {
    await page
      .locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select')
      .dblclick()
    const opening = page.waitForEvent('popup')
    await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
    const popup = await opening
    await popup.setViewportSize({ width: 2800, height: 1500 })
    const editor = popup.locator('.detail-piano-editor')
    await expect(editor).toBeVisible()
    const slider = editor.locator('.ant-slider').first().getByRole('slider')
    await slider.press(follow ? 'End' : 'Home')
    if (!follow) {
      await slider.press('ArrowRight')
      await editor.getByRole('button', { name: '跟随中', exact: true }).click()
    }
    await page.evaluate(() => {
      // 模拟主 WebView 被全屏窗口遮挡：visible 不变，但平台不再交付 RAF。
      window.requestAnimationFrame = () => 0
      window.midiDetailFixture.startClock()
    })
    await expect
      .poll(async () => Number(await editor.locator('.pr-handle').getAttribute('aria-valuenow')))
      .toBeGreaterThan(2.1)
    const result = await popup.evaluate(async () => {
      const handle = document.querySelector<HTMLElement>('.detail-piano-editor .pr-handle')!
      const scroll = document.querySelector<HTMLElement>('.detail-piano-editor .pr-scroll')!
      const frames: { time: number; position: number; left: number; x: number }[] = []
      const start = performance.now()
      let messages = 0
      const receive = (event: MessageEvent) => {
        if (event.data.update?.kind === 'transport') messages++
      }
      window.addEventListener('message', receive)
      while (performance.now() - start < 4500) {
        await new Promise(requestAnimationFrame)
        frames.push({
          time: performance.now(),
          position: Number(handle.getAttribute('aria-valuenow')),
          left: scroll.scrollLeft,
          x: new DOMMatrix(getComputedStyle(handle).transform).m41,
        })
      }
      window.removeEventListener('message', receive)
      return { frames, messages }
    })
    await test.info().attach('playback-frames.json', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    })
    const { frames } = result
    expect(result.messages).toBeGreaterThan(8)
    expect(frames.length).toBeGreaterThan(60)
    const elapsed = (frames.at(-1)!.time - frames[0]!.time) / 1000
    expect(frames.at(-1)!.position - frames[0]!.position).toBeCloseTo(elapsed, 1)
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.position - frames[i - 1]!.position).toBeGreaterThanOrEqual(-0.001)
      expect(frames[i]!.left - frames[i - 1]!.left).toBeGreaterThanOrEqual(-1)
    }
    if (follow) expect(new Set(frames.map((frame) => frame.x)).size).toBe(1)
    else {
      expect(new Set(frames.map((frame) => frame.left)).size).toBe(1)
      expect(frames.at(-1)!.x).toBeGreaterThan(frames[0]!.x + 1000)
    }
    await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
    await expect.poll(() => popup.isClosed()).toBe(true)
  })
}

test('immersive header reuses the global title and playback controls, with one authoritative player', async ({
  page,
}) => {
  await page.goto('/tests/browser/midi-detail-page.html?controls=1&longTitle=1')
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await popup.setViewportSize({ width: 720, height: 600 })
  const header = popup.locator('.window-title-bar')
  await expect(header).toBeVisible()
  // 打开浮窗自动开启；用户仍可关闭以独立查看其他详情。
  await header.getByRole('button', { name: '自动切换', exact: true }).click()
  const title = header.locator('.current-title.marquee-text')
  await expect(title).toHaveClass(/is-overflowing/)
  await expect(popup.locator('.detached-song-title')).toHaveCount(1)
  await expect(popup).not.toHaveTitle(/钢琴卷帘$/)
  await title.hover()
  await expect(popup.getByRole('tooltip')).toHaveText(await title.innerText())
  const center = await header.locator('.preview-playback-controls').boundingBox()
  expect(Math.abs(center!.x + center!.width / 2 - 360)).toBeLessThan(1)
  const autoSwitchBox = await header.getByRole('button', { name: '自动切换', exact: true }).boundingBox()
  expect(autoSwitchBox!.x).toBeGreaterThan(center!.x + center!.width)
  expect(720 - autoSwitchBox!.x - autoSwitchBox!.width).toBeLessThan(17)
  const nameBox = await title.boundingBox()
  expect(nameBox!.x + nameBox!.width).toBeLessThan(center!.x)
  await header.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(header.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(
    page.locator('.global-music-player').getByRole('button', { name: '播放', exact: true })
  ).toBeVisible()
  await header.getByRole('button', { name: '播放', exact: true }).click()
  await expect(header.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await header.getByRole('button', { name: '顺序播放', exact: true }).click()
  await popup.getByRole('button', { name: '单曲循环', exact: true }).click()
  await expect(
    page.locator('.global-music-player').getByRole('button', { name: '单曲循环', exact: true })
  ).toBeVisible()
  await header.getByRole('button', { name: '下一曲', exact: true }).click()
  await expect
    .poll(async () => (await page.evaluate(() => window.midiDetailFixture.snapshot())).currentMidi)
    .toBe('second.mid')
  // 全局当前曲改变，但未开启自动切换时，正在查看的文档保持不变。
  await expect(title).toContainText('一首非常长的曲名')
  await header.getByRole('button', { name: '上一曲', exact: true }).click()
  await expect
    .poll(async () => (await page.evaluate(() => window.midiDetailFixture.snapshot())).currentMidi)
    .toBe('piano-detail-fixture.mid')
  await header.getByRole('button', { name: '停止', exact: true }).click()
  await expect(header.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.midiDetailFixture.snapshot())).playbackActions).toEqual([
    'pause',
    'resume',
    'mode:repeat-one',
    'next',
    'previous',
    'stop',
  ])
  await popup.screenshot({ path: test.info().outputPath('immersive-header.png') })
  await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
})


test('auto switching keeps the existing detached session and synchronizes both header buttons', async ({ page }) => {
  await page.locator('.detail-piano-roll .pr-track[data-track-id="1"] .pr-track-select').dblclick()
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await expect(popup.locator('.detail-piano-editor')).toBeVisible()
  const originalUrl = popup.url()
  const hostButton = page.getByRole('button', { name: '自动切换', exact: true })
  await expect(hostButton).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.midiDetailFixture.play('second.mid'))
  await expect(page.locator('.detail-title')).toHaveText('第二首验收歌曲')
  await expect(popup.locator('.detached-song-title')).toHaveText('第二首验收歌曲')
  expect(popup.url()).toBe(originalUrl)
  await expect(popup.locator('.detail-piano-editor')).toBeVisible()
  const childButton = popup.getByRole('button', { name: '自动切换', exact: true })
  await expect(childButton).toHaveAttribute('aria-pressed', 'true')
  await childButton.click()
  await expect(hostButton).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  await expect(popup.locator('.detached-song-title')).toHaveText('第二首验收歌曲')
  await childButton.click()
  await expect(popup.locator('.detached-song-title')).toHaveText('钢琴卷帘界面验收')
  expect(popup.url()).toBe(originalUrl)
  await popup.evaluate(() => window.dispatchEvent(new Event('test-native-close')))
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(page.locator('.detail-piano-editor')).toBeVisible()
})


test('detached queue reuses the player drawer and selects songs through the host while keeping its window', async ({ page }) => {
  await page.goto('/tests/browser/midi-detail-page.html?controls=1')
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
  await page.evaluate(() => window.midiDetailFixture.play('piano-detail-fixture.mid'))
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await expect(popup.locator('.detail-piano-roll')).toBeVisible()
  const url = popup.url()
  await expect(popup.getByRole('button', { name: '自动切换', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await popup.getByRole('button', { name: '打开播放队列', exact: true }).click()
  const drawer = popup.locator('.play-queue-drawer')
  await expect(drawer.locator('.queue-item')).toHaveCount(2)
  await expect(drawer.locator('.queue-item.active')).toContainText('钢琴卷帘界面验收')
  await drawer.locator('.queue-item').filter({ hasText: '第二首验收歌曲' }).click()
  await expect(popup.locator('.detached-song-title')).toHaveText('第二首验收歌曲')
  await expect(drawer.locator('.queue-item.active')).toContainText('第二首验收歌曲')
  await popup.screenshot({ path: test.info().outputPath('detached-queue.png') })
  expect(popup.url()).toBe(url)
  expect((await page.evaluate(() => window.midiDetailFixture.snapshot())).playbackActions).toEqual(['queue:second.mid'])
  await page.evaluate(() => window.midiDetailFixture.setQueue(['second.mid']))
  await expect(drawer.locator('.queue-item')).toHaveCount(1)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(popup.getByRole('button', { name: '打开播放队列', exact: true })).toHaveAttribute('aria-expanded', 'false')
  // 主窗口仍使用同一展示组件、同一实时队列。
  await page.getByRole('button', { name: '打开播放队列', exact: true }).click()
  await expect(page.locator('.play-queue-drawer .queue-item')).toHaveCount(1)
  await popup.evaluate(() => window.dispatchEvent(new Event('test-native-close')))
  await expect.poll(() => popup.isClosed()).toBe(true)
})


test('queue opening and closing never scrolls the host layout or hides the workspace', async ({ page }) => {
  await page.goto('/tests/browser/midi-detail-page.html?controls=1')
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
  await page.evaluate(() => window.midiDetailFixture.play('second.mid'))
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await expect(popup.locator('.detail-piano-roll')).toBeVisible()
  for (const target of [page, popup]) {
    for (let repeat = 0; repeat < 2; repeat++) {
      const motion = target.evaluate(async () => {
        const frames: { x: number; y: number }[] = []
        const started = performance.now()
        while (performance.now() - started < 1300) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          frames.push({ x: window.scrollX, y: window.scrollY })
        }
        return frames
      })
      await target.getByRole('button', { name: '打开播放队列', exact: true }).click()
      const drawer = target.locator('.play-queue-drawer')
      await expect(drawer.locator('.queue-item')).toHaveCount(2)
      const samples = await motion
      expect([...new Set(samples.map(({ x, y }) => `${x},${y}`))], `${target === page ? 'main' : 'detached'} open ${repeat}`).toEqual(['0,0'])
      await drawer.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(drawer.locator('.queue-list')).toBeHidden()
      expect(await target.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 })
    }
  }
  await expect(popup.locator('.detail-piano-roll canvas').first()).toBeVisible()
  await popup.evaluate(() => window.dispatchEvent(new Event('test-native-close')))
})
