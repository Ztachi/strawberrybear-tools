import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './fixture'

// 保留原生滚动条，真实拖动回归需要覆盖浏览器thumb命中，不能只模拟scrollLeft赋值。
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

let bundle: string
/** 公共控制器在 RAF 中统一提交图层；读取命中位置之前等待真实绘制完成。 */
async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}
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
    .toBe(true)
  expect(await page.evaluate(() => window.fixture.editor.getViewport())).toEqual(initial)
  await page.evaluate(() => window.fixture.editor.setTimeZoom(320))
  expect(await page.evaluate(() => window.fixture.overview.getViewport().timeZoom)).toBe(200)
  expect(await page.evaluate(() => window.fixture.overview.getViewport().scrollLeft)).toBe(620)
})

test('vertical scrolling and wheel preserve Follow in each view and its gutter', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    const other: 'overview' | 'editor' = id === 'overview' ? 'editor' : 'overview'
    const scroll = page.locator(`#${id} .pr-scroll`)
    await scroll.evaluate((element) => {
      element.scrollTop += 80
    })
    await expect
      .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollTop, id))
      .toBeGreaterThan(0)
    expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
    const before = await scroll.evaluate((element) => element.scrollTop)
    await page.locator(`#${id} .pr-gutter`).dispatchEvent('wheel', {
      deltaY: 40,
      bubbles: true,
      cancelable: true,
    })
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(before)
    await scroll.hover()
    await page.mouse.wheel(0, 40)
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before + 40)
    expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
    expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, other)).toBe(true)
  }
})

test('dominant vertical trackpad gestures ignore incidental horizontal deltas in each view', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    const other: 'overview' | 'editor' = id === 'overview' ? 'editor' : 'overview'
    for (const selector of ['.pr-scroll', '.pr-gutter']) {
      for (const deltaX of [0.25, 1, 6, -0.25, -1, -6]) {
        for (const deltaY of [80, -80]) {
          await page.evaluate((id) => {
            window.fixture.setTime(50, true)
            window.fixture.overview.setFollow(true)
            window.fixture.editor.setFollow(true)
            document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.scrollTop = 250
          }, id)
          const before = await page.evaluate((id) => window.fixture[id].getViewport(), id)
          await page.locator(`#${id} ${selector}`).hover()
          // 使用浏览器原生滚轮，覆盖主导纵向手势中触控板实际会产生的微小横向分量。
          await page.mouse.wheel(deltaX, deltaY)
          await expect
            .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollTop, id))
            .toBe(250 + deltaY)
          const after = await page.evaluate((id) => window.fixture[id].getViewport(), id)
          expect(after.follow).toBe(true)
          expect(after.scrollLeft).toBe(before.scrollLeft)
          expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, other)).toBe(
            true
          )
        }
      }
      // 转为明显横向浏览后，视口移动超过四分之一屏才暂停当前视图的Follow。
      const beforeHorizontal = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      const width = await page
        .locator(`#${id} .pr-scroll`)
        .evaluate((element) => element.clientWidth)
      await page.mouse.wheel(width / 3, 6)
      await expect
        .poll(() => page.evaluate((id) => window.fixture[id].getViewport().follow, id))
        .toBe(false)
      await expect
        .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id))
        .toBeGreaterThan(beforeHorizontal.scrollLeft)
      expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, other)).toBe(true)
    }
  }
})

test('vertical trackpad scrolling preserves Follow while the transport advances horizontally', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    for (const selector of ['.pr-scroll', '.pr-gutter']) {
      await page.evaluate((id) => {
        window.fixture.setTime(50, true)
        window.fixture.overview.setFollow(true)
        window.fixture.editor.setFollow(true)
        document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.scrollTop = 100
      }, id)
      await page.locator(`#${id} ${selector}`).hover()
      const before = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      const advancing = page.evaluate(async () => {
        const followed: boolean[] = []
        for (let frame = 0; frame < 36; frame += 1) {
          window.fixture.setTime(50 + frame * 0.025, true)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          followed.push(
            window.fixture.overview.getViewport().follow &&
              window.fixture.editor.getViewport().follow
          )
        }
        return followed
      })
      await page.mouse.wheel(0, 40)
      await page.mouse.wheel(1, 40)
      await page.mouse.wheel(-6, 40)
      expect((await advancing).every(Boolean)).toBe(true)
      const after = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      expect(after.scrollTop).toBe(220)
      expect(after.scrollLeft).toBeGreaterThan(before.scrollLeft)
      expect(after.follow).toBe(true)
    }
  }
})

test('hundreds of real vertical trackpad gestures and horizontal tails never disable Follow', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.evaluate(() => window.fixture.setTime(50, true))
  for (let step = 0; step < 200; step += 1) {
    const id = step % 2 === 0 ? 'overview' : 'editor'
    const selector = Math.floor(step / 2) % 2 === 0 ? '.pr-scroll' : '.pr-gutter'
    await page.locator(`#${id} ${selector}`).hover()
    await page.mouse.wheel([0.25, 6, -1, 1, -6, 0][step % 6]!, step % 3 === 0 ? -40 : 80)
    await page.mouse.wheel(step % 2 === 0 ? 6 : -6, 0)
    const followed = await page.evaluate(async (step) => {
      window.fixture.setTime(50 + step * 0.01, true)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
      return (
        window.fixture.overview.getViewport().follow && window.fixture.editor.getViewport().follow
      )
    }, step)
    expect(followed, `vertical/tail gesture ${step}`).toBe(true)
  }
})

test('vertical intent at scroll boundaries preserves Follow and mixed modifier wheels still zoom', async ({
  page,
}) => {
  await page.evaluate(() =>
    window.fixture.overview.setDocument({
      durationTicks: 96000,
      ticksPerBeat: 480,
      tempoMap: [],
      timeSignatureMap: [],
      tracks: [{ id: '0', name: 'Single track', isPercussion: false, enabled: true }],
      notes: [],
    })
  )
  for (const id of ['overview', 'editor'] as const) {
    for (const selector of ['.pr-scroll', '.pr-gutter']) {
      await page.evaluate((id) => {
        window.fixture.setTime(50, true)
        window.fixture[id].setFollow(true)
        document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.scrollTop = 0
      }, id)
      const surface = page.locator(`#${id} ${selector}`)
      const initial = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      await surface.hover()
      for (const deltaY of id === 'overview' ? [80, -80] : [-80]) {
        // 记录真实 wheel 的完成帧，因为边界上不滚动，不会产生可等待的 scroll 事件。
        await surface.evaluate((element) => {
          const target = element as HTMLElement
          target.dataset.wheelHandled = 'false'
          target.addEventListener(
            'wheel',
            () =>
              requestAnimationFrame(() => {
                target.dataset.wheelHandled = 'true'
              }),
            { once: true }
          )
        })
        await page.mouse.wheel(6, deltaY)
        await expect(surface).toHaveAttribute('data-wheel-handled', 'true')
        const after = await page.evaluate((id) => window.fixture[id].getViewport(), id)
        expect(after.scrollTop).toBe(0)
        expect(after.scrollLeft).toBe(initial.scrollLeft)
        expect(after.follow).toBe(true)
      }
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
        const before = await page.evaluate((id) => window.fixture[id].getViewport(), id)
        await surface.dispatchEvent('wheel', {
          ...modifier,
          deltaX: 6,
          deltaY: -20,
          bubbles: true,
          cancelable: true,
        })
        const after = await page.evaluate((id) => window.fixture[id].getViewport(), id)
        expect(after.timeZoom).toBeGreaterThan(before.timeZoom)
        expect(after.follow).toBe(true)
      }
    }
  }
})

test('gutter line and page wheel units preserve vertical intent', async ({ page }) => {
  for (const id of ['overview', 'editor'] as const) {
    for (const deltaMode of [1, 2]) {
      await page.evaluate((id) => {
        window.fixture.setTime(50, true)
        window.fixture[id].setFollow(true)
        document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.scrollTop = 0
      }, id)
      const before = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      const height = await page
        .locator(`#${id} .pr-scroll`)
        .evaluate((element) => element.clientHeight)
      await page.locator(`#${id} .pr-gutter`).dispatchEvent('wheel', {
        deltaMode,
        deltaX: 0.25,
        deltaY: 1,
        bubbles: true,
        cancelable: true,
      })
      const after = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      expect(after.scrollTop).toBe(deltaMode === 1 ? 16 : height)
      expect(after.scrollLeft).toBe(before.scrollLeft)
      expect(after.follow).toBe(true)
    }
  }
})

test('horizontal and Shift wheel suspend only the corresponding view Follow', async ({ page }) => {
  for (const id of ['overview', 'editor'] as const) {
    const other: 'overview' | 'editor' = id === 'overview' ? 'editor' : 'overview'
    for (const selector of ['.pr-scroll', '.pr-gutter']) {
      for (const shiftKey of [false, true]) {
        await page.evaluate(() => {
          window.fixture.setTime(50, true)
          window.fixture.overview.setFollow(true)
          window.fixture.editor.setFollow(true)
        })
        await page.locator(`#${id} ${selector}`).hover()
        const distance = await page
          .locator(`#${id} .pr-scroll`)
          .evaluate((element) => element.clientWidth / 3)
        if (shiftKey) await page.keyboard.down('Shift')
        await page.mouse.wheel(shiftKey ? 0 : distance, shiftKey ? distance : 0)
        if (shiftKey) await page.keyboard.up('Shift')
        await expect
          .poll(() => page.evaluate((id) => window.fixture[id].getViewport().follow, id))
          .toBe(false)
        expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, other)).toBe(
          true
        )
      }
    }
  }
})

test('only a significant explicit horizontal pan disables Follow, while short pans leave playback steady', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    const other: 'overview' | 'editor' = id === 'overview' ? 'editor' : 'overview'
    for (const selector of ['.pr-scroll', '.pr-gutter']) {
      const surface = page.locator(`#${id} ${selector}`)
      await page.evaluate(() => {
        window.fixture.setTime(50, true)
        window.fixture.overview.setFollow(true)
        window.fixture.editor.setFollow(true)
      })
      const width = await page
        .locator(`#${id} .pr-scroll`)
        .evaluate((element) => element.clientWidth)
      const initial = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      await surface.hover()
      await page.mouse.wheel(6, 80)
      for (const deltaX of [0.25, 1, 6, -6]) {
        await page.mouse.wheel(deltaX, 0)
        // 亚像素wheel可由浏览器合并或舍入，不依赖必定发出独立wheel/scroll通知。
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            })
        )
        expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
      }
      // 杂量候选不改变播放画面，Follow状态没有开关闪烁。
      await expect
        .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id))
        .toBe(initial.scrollLeft)
      await page.mouse.wheel(width * 0.1, 0)
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      expect(await page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id)).toBe(
        initial.scrollLeft
      )
      const duringPan = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      await page.evaluate(() => window.fixture.setTime(50.05, true))
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      // 候选仅记录输入净位移，播放仍连续推进，不能暂停平移后在手势结束时突然追赶。
      const advancedLeft = await page.evaluate(
        (id) => window.fixture[id].getViewport().scrollLeft,
        id
      )
      expect(
        Math.abs(advancedLeft - (duringPan.scrollLeft + duringPan.timeZoom * 0.05))
      ).toBeLessThanOrEqual(1)
      expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
      // 反向输入抵消候选位移；播放时间的推进不能制造手动位移。
      await page.mouse.wheel(-width * 0.1, 0)
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 230)))
      expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
      const resumed = await page.evaluate((id) => {
        const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
        const handle = document.querySelector<HTMLElement>(`#${id} .pr-handle`)!
        return {
          x: Number(handle.style.transform.match(/-?\d+(?:\.\d+)?/)?.[0]),
          width: scroll.clientWidth,
        }
      }, id)
      expect(Math.abs(resumed.x - resumed.width / 2)).toBeLessThanOrEqual(1)
      await page.mouse.wheel(width * 0.15, 0)
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
      await page.evaluate(() => window.fixture.setTime(50.1, true))
      await page.mouse.wheel(width * 0.15, 0)
      await expect
        .poll(() => page.evaluate((id) => window.fixture[id].getViewport().follow, id))
        .toBe(false)
      expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, other)).toBe(true)
    }
  }
})

test('a small owned wheel pan never adopts an unrelated native scroll jump', async ({ page }) => {
  await page.evaluate(() => {
    window.fixture.setTime(50, true)
    window.fixture.overview.setFollow(true)
  })
  const scroll = page.locator('#overview .pr-scroll')
  await scroll.hover()
  const origin = await page.evaluate(() => window.fixture.overview.getViewport().scrollLeft)
  await page.mouse.wheel(6, 0)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  expect(await scroll.evaluate((element) => element.scrollLeft)).toBe(origin)
  await scroll.evaluate((element) => {
    element.scrollLeft += 500
    element.dispatchEvent(new Event('scroll'))
  })
  expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
  await page.mouse.wheel(6, 0)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  // 继续输入只有 12px 候选，不能把未知 500px 当成已确认的用户位移。
  expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
  await page.evaluate(() => window.fixture.setTime(50, true))
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBe(origin)
  await page.mouse.wheel(6, 0)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  expect(await scroll.evaluate((element) => element.scrollLeft)).toBe(origin)
  await scroll.evaluate((element) => {
    element.scrollLeft += 500
    element.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('blur'))
  })
  await page.evaluate(() => window.fixture.setTime(50, true))
  expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBe(origin)
})

test('unknown deferred scroll changes and smooth host layouts cannot authorize disabling Follow', async ({
  page,
}) => {
  await page.addStyleTag({ content: '.pr-scroll{scroll-behavior:smooth!important}' })
  const snapshots = await page.evaluate(async () => {
    const states: { overview: boolean; editor: boolean }[] = []
    for (let frame = 0; frame < 24; frame += 1) {
      window.fixture.setTime(50 + frame * 0.025, true)
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          for (const id of ['overview', 'editor'] as const) {
            const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
            // 模拟独立于控制器、延后到达的原生坐标变化；没有用户横向pan，不论幅度都不能解除Follow。
            scroll.scrollTo({
              left: scroll.scrollLeft + scroll.clientWidth * (frame % 2 === 0 ? 0.35 : -0.3),
              behavior: 'instant',
            })
            scroll.dispatchEvent(new Event('scroll'))
            scroll.dispatchEvent(new Event('scroll'))
          }
          resolve()
        }, 0)
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      states.push({
        overview: window.fixture.overview.getViewport().follow,
        editor: window.fixture.editor.getViewport().follow,
      })
    }
    window.fixture.setTime(51, true)
    return states
  })
  expect(snapshots.every((state) => state.overview && state.editor)).toBe(true)
  for (const id of ['overview', 'editor'] as const) {
    expect(
      await page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id)
    ).toBeGreaterThan(0)
    await page.evaluate((id) => window.fixture[id].fitToSong(), id)
    await expect
      .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id))
      .toBe(0)
    await page.locator(`#${id} .pr-scroll`).hover()
    await page.mouse.wheel(80, 0)
    // 全曲铺满时没有实际横移，不能仅凭滚轮输入取消 Follow。
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    )
    expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
  }
})

test.describe('native scrollbar input', () => {
  test('dragging an actual horizontal scrollbar suspends Follow after moving content', async ({
    page,
  }) => {
    const scroll = page.locator('#overview .pr-scroll')
    await scroll.hover()
    // macOS overlay滚动条先通过真实滚轮唤显，再恢复Follow，使测试操作真实thumb而非底部画布。
    await page.evaluate(() => window.fixture.overview.setFollow(false))
    await page.mouse.wheel(80, 0)
    await expect
      .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
      .toBeGreaterThan(0)
    await page.evaluate(() => window.fixture.overview.setFollow(true))
    await expect
      .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
      .toBe(0)
    const box = (await scroll.boundingBox())!
    await page.mouse.move(box.x + 30, box.y + box.height - 6)
    await page.mouse.down()
    expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
    await page.mouse.move(box.x + 230, box.y + box.height - 6, { steps: 10 })
    await page.mouse.up()
    await expect
      .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
      .toBeGreaterThan(box.width / 4)
    expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(false)
    expect(await page.evaluate(() => window.fixture.editor.getViewport().follow)).toBe(true)

    await page.evaluate(() => window.fixture.overview.setFollow(true))
    await expect
      .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
      .toBe(0)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await page.mouse.move(box.x + 30, box.y + box.height - 6)
    await page.mouse.down()
    await page.mouse.move(box.x + 38, box.y + box.height - 6)
    await expect
      .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
      .toBeGreaterThan(0)
    expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
    await page.mouse.up()
    await expect
      .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollLeft))
      .toBe(0)
    expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
  })
})

test('native keyboard scrolling distinguishes vertical browsing from horizontal intent during playback', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    const other: 'overview' | 'editor' = id === 'overview' ? 'editor' : 'overview'
    await page.evaluate(() => {
      window.fixture.setTime(50, true)
      window.fixture.overview.setFollow(true)
      window.fixture.editor.setFollow(true)
    })
    const scroll = page.locator(`#${id} .pr-scroll`)
    await scroll.focus()
    const before = await page.evaluate((id) => window.fixture[id].getViewport(), id)
    const advancing = page.evaluate(async () => {
      for (let frame = 0; frame < 48; frame += 1) {
        window.fixture.setTime(50 + frame * 0.02, true)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    })
    await page.keyboard.press('ArrowDown')
    await expect
      .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollTop, id))
      .toBeGreaterThan(before.scrollTop)
    expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, id)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() => page.evaluate((id) => window.fixture[id].getViewport().follow, id))
      .toBe(false)
    await advancing
    expect(await page.evaluate((id) => window.fixture[id].getViewport().follow, other)).toBe(true)
  }
})

test('Follow brings the playhead to center, holds it, then releases at the song end', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.fixture.overview.setDocument({
      durationTicks: 9600,
      ticksPerBeat: 480,
      tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
      timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
      tracks: [{ id: '0', name: 'Track', isPercussion: false, enabled: true }],
      notes: [],
    })
    window.fixture.overview.setTimeZoom(150)
    window.fixture.overview.setFollow(true)
  })
  const sample = async (seconds: number) => {
    await page.evaluate((seconds) => window.fixture.setTime(seconds, true), seconds)
    await waitForPaint(page)
    return page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
      const handle = document.querySelector<HTMLElement>('#overview .pr-handle')!
      return {
        scrollLeft: scroll.scrollLeft,
        playheadX: Number(handle.style.transform.match(/-?\d+(?:\.\d+)?/)?.[0] ?? 0),
        width: scroll.clientWidth,
        contentWidth: scroll.scrollWidth,
        timeZoom: window.fixture.overview.getViewport().timeZoom,
      }
    })
  }
  const start = await sample(2)
  const beforeCenter = await sample(3)
  const center = await sample(4)
  const held = await sample(5)
  const tail = await sample(7)
  const end = await sample(10)
  const centerLeft = (seconds: number, state: typeof center) =>
    Math.min(
      state.contentWidth - state.width,
      Math.max(0, seconds * state.timeZoom - state.width / 2)
    )
  expect(start.scrollLeft).toBe(0)
  expect(beforeCenter.scrollLeft).toBe(0)
  expect(center.scrollLeft).toBeCloseTo(centerLeft(4, center), 0)
  expect(center.playheadX).toBeCloseTo(center.width / 2, 0)
  expect(held.scrollLeft).toBeCloseTo(centerLeft(5, held), 0)
  expect(held.playheadX).toBeCloseTo(held.width / 2, 0)
  expect(tail.scrollLeft).toBeCloseTo(centerLeft(7, tail), 0)
  expect(end.scrollLeft).toBe(end.contentWidth - end.width)
  expect(end.playheadX).toBeCloseTo(end.contentWidth - end.scrollLeft, 0)
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
  await waitForPaint(page)
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

test('holding an edge handle without moving preserves its scroll position and seek time', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    await page.evaluate((id) => {
      const view = window.fixture[id]
      view.setFollow(false)
      view.setTimeZoom(80)
      document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.scrollLeft = 320
      window.fixture.setTime(4)
      window.fixture.seeks.length = 0
      window.fixture.previews.length = 0
    }, id)
    await expect
      .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id))
      .toBe(320)
    await waitForPaint(page)
    const box = (await page.locator(`#${id} .pr-handle`).boundingBox())!
    // 点击盖在轨道栏上的左半手柄并停留多帧；普通按住不能被当作边缘拖动。
    await page.mouse.move(box.x + 3, box.y + 8)
    await page.mouse.down()
    await page.evaluate(async () => {
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    })
    expect(await page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id)).toBe(320)
    expect(await page.evaluate(() => window.fixture.seeks)).toEqual([])
    expect(await page.evaluate(() => window.fixture.previews.at(-1))).toBe(4)
    await page.mouse.up()
    expect(await page.evaluate(() => window.fixture.seeks)).toEqual([4])
    expect(await page.evaluate(() => window.fixture.previews.at(-1))).toBe(null)
  }
})

test('symmetric handles remain centered and hittable across both timeline edges', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    await page.evaluate((id) => {
      window.fixture[id].fitToSong()
      window.fixture.setTime(0)
      window.fixture.seeks.length = 0
    }, id)
    await waitForPaint(page)
    const handle = page.locator(`#${id} .pr-handle`)
    const ruler = (await page.locator(`#${id} .pr-ruler`).boundingBox())!
    const start = (await handle.boundingBox())!
    expect(start.width).toBe(18)
    expect(start.height).toBe(25)
    expect(start.x + start.width / 2).toBeCloseTo(ruler.x, 5)
    expect(start.x).toBeCloseTo(ruler.x - 9, 5)
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, {
      x: start.x + 1,
      y: start.y + 8,
    })
    expect(hit).toBe('pr-handle')
    // 左半身体盖在轨道栏上；点击和拖动这一半也必须命中手柄，且不改变抓取时的 source time。
    await page.mouse.click(start.x + 3, start.y + 8)
    expect(await page.evaluate(() => window.fixture.seeks)).toEqual([0])
    await page.mouse.move(start.x + 3, start.y + 8)
    await page.mouse.down()
    await page.mouse.move(start.x + 53, start.y + 8)
    expect(await page.evaluate(() => window.fixture.seeks.length)).toBe(1)
    await page.mouse.up()
    expect(await page.evaluate(() => window.fixture.seeks.length)).toBe(2)
    const zoom = await page.evaluate((id) => window.fixture[id].getViewport().timeZoom, id)
    expect(await page.evaluate(() => window.fixture.seeks.at(-1))).toBeCloseTo(50 / zoom, 8)
    const duration = Number(await handle.getAttribute('aria-valuemax'))
    await page.evaluate((duration) => window.fixture.setTime(duration), duration)
    await waitForPaint(page)
    const end = (await handle.boundingBox())!
    expect(end.width).toBe(18)
    expect(end.height).toBe(25)
    expect(end.x + end.width / 2).toBeCloseTo(ruler.x + duration * zoom, 2)
    expect(end.x + end.width).toBeGreaterThan(ruler.x + ruler.width)
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, {
        x: end.x + 17,
        y: end.y + 8,
      })
    ).toBe('pr-handle')
    await page.mouse.click(end.x + 15, end.y + 8)
    expect(await page.evaluate(() => window.fixture.seeks.at(-1))).toBeCloseTo(duration, 8)
  }
})

test('fractional source positions stay visible at rounded viewport edges without changing seek', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    const handle = page.locator(`#${id} .pr-handle`)
    const assertVisibleAtEdge = async (sourceSeconds: number) => {
      await waitForPaint(page)
      await expect(handle).toBeVisible()
      const state = await page.evaluate((id) => {
        const handle = document.querySelector<HTMLElement>(`#${id} .pr-handle`)!
        const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
        const seconds = Number(handle.getAttribute('aria-valuenow'))
        const style = getComputedStyle(handle)
        const line = document.querySelector<HTMLElement>(`#${id} .pr-line`)!
        const lineBox = line.getBoundingClientRect()
        return {
          seconds,
          // 自动跟随曲首/尾使用逻辑端点，不能由取整后的 DOM scrollLeft 反推。
          sourceX: window.fixture[id].getViewport().follow
            ? seconds === 0
              ? 0
              : scroll.clientWidth
            : seconds * window.fixture[id].getViewport().timeZoom - scroll.scrollLeft,
          displayX: Number(handle.style.transform.match(/-?\d+(?:\.\d+)?/)?.[0]),
          lineTransform: line.style.transform,
          handleTransform: handle.style.transform,
          clipPath: style.clipPath,
          lineX: lineBox.left,
          lineY: lineBox.top,
          lineHeight: lineBox.height,
          scrollY: scroll.getBoundingClientRect().top,
          scrollHeight: scroll.clientHeight,
        }
      }, id)
      expect(state.seconds).toBeCloseTo(sourceSeconds, 8)
      expect(state.displayX).toBeCloseTo(state.sourceX, 2)
      expect(state.lineTransform).toBe(state.handleTransform)
      expect(state.clipPath).toBe('polygon(0px 0px, 100% 0px, 100% 65%, 50% 100%, 0px 65%)')
      const box = (await handle.boundingBox())!
      const ruler = (await page.locator(`#${id} .pr-ruler`).boundingBox())!
      expect(box.width).toBe(18)
      expect(box.height).toBe(25)
      expect(box.x + box.width / 2).toBeCloseTo(ruler.x + state.sourceX, 2)
      expect(state.lineX).toBeCloseTo(box.x + box.width / 2, 5)
      expect(state.lineY).toBeCloseTo(state.scrollY, 5)
      expect(state.lineHeight).toBe(state.scrollHeight)
      for (const x of [box.x + 1, box.x + 17]) {
        expect(
          await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, {
            x,
            y: box.y + 8,
          })
        ).toBe('pr-handle')
      }
      await page.mouse.click(box.x + 3, box.y + 8)
      expect(await page.evaluate(() => window.fixture.seeks.at(-1))).toBeCloseTo(sourceSeconds, 8)
    }
    for (const zoom of [42, 80]) {
      await page.evaluate(
        ({ id, zoom }) => {
          window.fixture[id].setTimeZoom(zoom)
          window.fixture[id].setFollow(true)
          const duration = Number(
            document.querySelector(`#${id} .pr-handle`)!.getAttribute('aria-valuemax')
          )
          window.fixture.setTime(duration, true)
        },
        { id, zoom }
      )
      const duration = Number(await handle.getAttribute('aria-valuemax'))
      // fixture 曲长为149.000592秒，CSS scrollWidth取整后真实曲尾可能超出视口不足1px。
      await assertVisibleAtEdge(duration)
    }
    for (const sourceSeconds of [0, -0.25]) {
      await page.evaluate(
        ({ id, sourceSeconds }) => {
          window.fixture.setTime(sourceSeconds)
          window.fixture[id].setFollow(true)
        },
        { id, sourceSeconds }
      )
      await assertVisibleAtEdge(0)
    }
    await page.evaluate((id) => {
      window.fixture[id].setFollow(false)
      document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!.scrollLeft = 300
    }, id)
    await expect
      .poll(() => page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id))
      .toBe(300)
    const nearLeftSource = await page.evaluate((id) => {
      const state = window.fixture[id].getViewport()
      const seconds = (state.scrollLeft - 0.25) / state.timeZoom
      window.fixture.setTime(seconds)
      return seconds
    }, id)
    await assertVisibleAtEdge(nearLeftSource)
  }
})

test('overview rows fill available height, shrink to the minimum, then scroll', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.fixture.overview.setDocument({
      durationTicks: 9600,
      ticksPerBeat: 480,
      tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
      timeSignatureMap: [],
      tracks: Array.from({ length: 4 }, (_, index) => ({
        id: String(index),
        name: `Track ${index}`,
        isPercussion: false,
        enabled: true,
      })),
      notes: [],
    })
    document.querySelector<HTMLElement>('#overview')!.style.height = '500px'
  })
  const geometry = () =>
    page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
      const row = document.querySelector<HTMLElement>('#overview .pr-track')!
      return { height: scroll.clientHeight, extent: scroll.scrollHeight, row: row.offsetHeight }
    })
  await expect
    .poll(async () => {
      const state = await geometry()
      return Math.abs(state.row * 4 - state.height)
    })
    .toBeLessThanOrEqual(2)
  const expanded = await geometry()
  expect(expanded.extent).toBe(expanded.height)
  await page.locator('#overview').evaluate((element) => {
    element.style.height = '320px'
  })
  await expect.poll(async () => (await geometry()).row).toBeLessThan(expanded.row)
  const compact = await geometry()
  expect(compact.row).toBeGreaterThan(56)
  expect(compact.extent).toBe(compact.height)
  await page.locator('#overview').evaluate((element) => {
    element.style.height = '190px'
  })
  await expect.poll(async () => (await geometry()).row).toBe(56)
  const minimum = await geometry()
  expect(minimum.extent).toBe(4 * 56)
  expect(minimum.extent).toBeGreaterThan(minimum.height)
  await page.locator('#overview .pr-scroll').evaluate((element) => {
    element.scrollTop = 1000
  })
  const last = page.locator('#overview .pr-track[data-track-id="3"] .pr-track-select')
  await expect(last).toBeVisible()
  await last.click()
  expect(await page.evaluate(() => window.fixture.selections.at(-1))).toBe('3')
  await page.locator('#overview').evaluate((element) => {
    element.style.height = '500px'
  })
  await expect.poll(async () => (await geometry()).row).toBe(expanded.row)
  await expect
    .poll(() => page.evaluate(() => window.fixture.overview.getViewport().scrollTop))
    .toBe(0)
  expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(true)
})

test('pointercancel and blur cancel drag without seeking', async ({ page }) => {
  for (const cancel of ['pointercancel', 'blur']) {
    await page.evaluate(() => window.fixture.setTime(2))
    await waitForPaint(page)
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
  await waitForPaint(page)
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
  const sizes = await page.locator('#overview canvas').evaluateAll((nodes) =>
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

test('fit, programmatic zoom and trackpad pinch share the exact one-screen minimum', async ({
  page,
}) => {
  for (const id of ['overview', 'editor'] as const) {
    await page.evaluate((id) => window.fixture[id].fitToSong(), id)
    const fit = await page.evaluate((id) => {
      const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
      const duration = Number(
        document.querySelector(`#${id} .pr-handle`)!.getAttribute('aria-valuemax')
      )
      return {
        ...window.fixture[id].getViewport(),
        width: scroll.clientWidth,
        extent: scroll.scrollWidth,
        duration,
      }
    }, id)
    expect(fit.timeZoom).toBeCloseTo(fit.width / fit.duration, 10)
    expect(fit.minTimeZoom).toBe(fit.timeZoom)
    expect(fit.extent).toBe(fit.width)
    expect(fit.scrollLeft).toBe(0)
    await page.evaluate((id) => window.fixture[id].setTimeZoom(1e-12), id)
    for (const selector of ['.pr-scroll', '.pr-gutter', '.pr-ruler']) {
      await page
        .locator(`#${id} ${selector}`)
        .dispatchEvent('wheel', { ctrlKey: true, deltaY: 2000, bubbles: true, cancelable: true })
      await page
        .locator(`#${id} ${selector}`)
        .dispatchEvent('wheel', { metaKey: true, deltaY: 2000, bubbles: true, cancelable: true })
      const current = await page.evaluate((id) => window.fixture[id].getViewport(), id)
      expect(current.timeZoom).toBe(fit.timeZoom)
      expect(current.follow).toBe(true)
    }
    await page.locator(`#${id} .pr-scroll`).evaluate((el) => {
      el.scrollLeft = 100
    })
    expect(await page.evaluate((id) => window.fixture[id].getViewport().scrollLeft, id)).toBe(0)
  }
})

test('container-only resize and hide/show retain fit and leave the other view unchanged', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture.overview.fitToSong())
  await page.waitForTimeout(220)
  const editor = await page.evaluate(() => window.fixture.editor.getViewport())
  const original = await page.evaluate(() => window.fixture.overview.getViewport())
  await page.locator('#overview').evaluate((el) => {
    el.style.width = '700px'
  })
  await expect
    .poll(() => page.evaluate(() => window.fixture.overview.getViewport().minTimeZoom))
    .toBeLessThan(original.minTimeZoom)
  const smaller = await page.evaluate(() => window.fixture.overview.getViewport())
  expect(smaller.timeZoom).toBe(smaller.minTimeZoom)
  expect(smaller.follow).toBe(true)
  await page.locator('#overview').evaluate((el) => {
    el.style.display = 'none'
  })
  await page.waitForTimeout(220)
  expect(await page.evaluate(() => window.fixture.overview.getViewport())).toEqual(smaller)
  await page.locator('#overview').evaluate((el) => {
    el.style.width = '1000px'
    el.style.display = ''
  })
  await expect
    .poll(() => page.evaluate(() => window.fixture.overview.getViewport().minTimeZoom))
    .toBeGreaterThan(smaller.minTimeZoom)
  const result = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    return {
      state: window.fixture.overview.getViewport(),
      width: scroll.clientWidth,
      extent: scroll.scrollWidth,
    }
  })
  expect(result.state.timeZoom).toBe(result.state.minTimeZoom)
  expect(result.width).toBe(result.extent)
  expect(result.state.follow).toBe(true)
  expect(await page.evaluate(() => window.fixture.editor.getViewport())).toEqual(editor)
})

test('manual zoom preserves center time on resize and clamps when a wider container needs fit', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.fixture.overview.setFollow(false)
    window.fixture.overview.setTimeZoom(20)
    document.querySelector<HTMLElement>('#overview .pr-scroll')!.scrollLeft = 600
  })
  const before = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    return (el.scrollLeft + el.clientWidth / 2) / window.fixture.overview.getViewport().timeZoom
  })
  await page.locator('#overview').evaluate((el) => {
    el.style.width = '700px'
  })
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    return (el.scrollLeft + el.clientWidth / 2) / window.fixture.overview.getViewport().timeZoom
  })
  expect(after).toBeCloseTo(before, 1)
  expect(await page.evaluate(() => window.fixture.overview.getViewport().follow)).toBe(false)
  await page.evaluate(() => {
    window.fixture.overview.setTimeZoom(window.fixture.overview.getViewport().minTimeZoom * 1.1)
    document.querySelector<HTMLElement>('#overview')!.style.width = '1050px'
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.fixture.overview.getViewport()
        return state.timeZoom === state.minTimeZoom && state.scrollLeft === 0
      })
    )
    .toBe(true)
})

test('fit survives document duration changes, zero duration and short clips', async ({ page }) => {
  await page.evaluate(() => window.fixture.overview.fitToSong())
  for (const durationTicks of [480, 1, 0, 96000]) {
    await page.evaluate(
      (durationTicks) =>
        window.fixture.overview.setDocument({
          durationTicks,
          ticksPerBeat: 480,
          tempoMap: [],
          timeSignatureMap: [],
          tracks: [],
          notes: [],
        }),
      durationTicks
    )
    await page.waitForTimeout(220)
    const result = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('#overview .pr-scroll')!
      return {
        state: window.fixture.overview.getViewport(),
        width: el.clientWidth,
        extent: el.scrollWidth,
      }
    })
    expect(Number.isFinite(result.state.timeZoom)).toBe(true)
    expect(result.state.timeZoom).toBe(result.state.minTimeZoom)
    expect(result.state.maxTimeZoom).toBeGreaterThanOrEqual(result.state.minTimeZoom)
    expect(result.width).toBe(result.extent)
    expect(result.state.follow).toBe(true)
  }
})

test('zoomed scroll extent ends exactly at the MIDI duration', async ({ page }) => {
  await page.evaluate(() => window.fixture.overview.setTimeZoom(100))
  const result = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    const duration = Number(
      document.querySelector('#overview .pr-handle')!.getAttribute('aria-valuemax')
    )
    scroll.scrollLeft = Number.MAX_SAFE_INTEGER
    return {
      right: scroll.scrollLeft + scroll.clientWidth,
      duration,
      zoom: window.fixture.overview.getViewport().timeZoom,
    }
  })
  expect(Math.abs(result.right - result.duration * result.zoom)).toBeLessThan(1)
})

test('double-click carries selection before the first click from labels and track canvas', async ({
  page,
}) => {
  await page.locator('#overview .pr-track-select').nth(1).dblclick()
  expect(await page.evaluate(() => window.fixture.openContexts.at(-1))).toEqual({
    trackId: '1',
    selectedTrackIdAtGestureStart: '0',
  })
  await page.locator('#overview .pr-track-select').nth(1).dblclick()
  expect(await page.evaluate(() => window.fixture.openContexts.at(-1))).toEqual({
    trackId: '1',
    selectedTrackIdAtGestureStart: '1',
  })
  const thirdRowCenter = await page
    .locator('#overview .pr-track[data-track-id="2"]')
    .evaluate((row) => (row as HTMLElement).offsetTop + (row as HTMLElement).offsetHeight / 2)
  await page.locator('#overview .pr-scroll').dblclick({ position: { x: 100, y: thirdRowCenter } })
  expect(await page.evaluate(() => window.fixture.openContexts.at(-1))).toEqual({
    trackId: '2',
    selectedTrackIdAtGestureStart: '1',
  })
  expect(await page.evaluate(() => window.fixture.selections.slice(-2))).toEqual(['2', '2'])
  expect(await page.evaluate(() => window.fixture.seeks)).toEqual([])
  await page.evaluate(() => window.fixture.overview.setSelectedTrack(null))
  await page.locator('#overview .pr-track-select').first().dblclick()
  expect(await page.evaluate(() => window.fixture.openContexts.at(-1))).toEqual({
    trackId: '0',
    selectedTrackIdAtGestureStart: null,
  })
})

test('a view mounted hidden can request fit before its first measurable layout', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.fixture.overview.destroy()
    window.fixture.editor.destroy()
    document.querySelector<HTMLElement>('#overview')!.style.display = 'none'
    document.querySelector<HTMLElement>('#editor')!.style.display = 'none'
  })
  await page.addScriptTag({ content: bundle })
  await page.evaluate(() => {
    window.fixture.overview.fitToSong()
    window.fixture.editor.fitToSong()
    window.fixture.overview.setDocument({
      durationTicks: 480,
      ticksPerBeat: 480,
      tempoMap: [],
      timeSignatureMap: [],
      tracks: [],
      notes: [],
    })
    document.querySelector<HTMLElement>('#overview')!.style.display = ''
    document.querySelector<HTMLElement>('#editor')!.style.display = ''
  })
  await expect
    .poll(() => page.evaluate(() => window.fixture.overview.getViewport().minTimeZoom))
    .toBeGreaterThan(0.001)
  const overviewAfterHiddenReplace = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    return {
      state: window.fixture.overview.getViewport(),
      width: scroll.clientWidth,
      extent: scroll.scrollWidth,
    }
  })
  expect(overviewAfterHiddenReplace.state.minTimeZoom).toBeCloseTo(
    overviewAfterHiddenReplace.width / 0.5,
    5
  )
  expect(overviewAfterHiddenReplace.extent).toBe(overviewAfterHiddenReplace.width)
  for (const id of ['overview', 'editor'] as const) {
    const result = await page.evaluate((id) => {
      const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
      return {
        state: window.fixture[id].getViewport(),
        extent: scroll.scrollWidth,
        width: scroll.clientWidth,
      }
    }, id)
    expect(result.state.timeZoom).toBe(result.state.minTimeZoom)
    expect(result.extent).toBe(result.width)
    expect(result.state.follow).toBe(true)
  }
})

test('WebKit gesture pinch uses one controller zoom path and cleans up after end/blur', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#overview .pr-view')!
    const scroll = document.querySelector<HTMLElement>('#overview .pr-scroll')!
    const anchorClientX = scroll.getBoundingClientRect().left + 100
    const emit = (type: string, scale?: number): boolean => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      if (scale !== undefined) Object.defineProperty(event, 'scale', { value: scale })
      Object.defineProperty(event, 'clientX', { value: anchorClientX })
      return root.dispatchEvent(event)
    }
    window.fixture.overview.setTimeZoom(80)
    const sourceAtAnchorBefore = (100 + scroll.scrollLeft) / 80
    const startAllowed = emit('gesturestart', 1)
    const changeAllowed = emit('gesturechange', 2)
    const zoomDuringGesture = window.fixture.overview.getViewport().timeZoom
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -500,
    })
    const wheelAllowed = root.dispatchEvent(wheel)
    const zoomAfterWheel = window.fixture.overview.getViewport().timeZoom
    const sourceAtAnchorAfter = (100 + scroll.scrollLeft) / zoomAfterWheel
    const endAllowed = emit('gestureend', 2)
    const afterEnd = window.fixture.overview.getViewport().timeZoom
    emit('gesturestart', 1)
    window.dispatchEvent(new Event('blur'))
    emit('gesturechange', 2)
    return {
      startAllowed,
      changeAllowed,
      endAllowed,
      wheelAllowed,
      wheelDefaultPrevented: wheel.defaultPrevented,
      zoomDuringGesture,
      zoomAfterWheel,
      afterEnd,
      afterBlur: window.fixture.overview.getViewport().timeZoom,
      sourceAtAnchorBefore,
      sourceAtAnchorAfter,
    }
  })
  expect(result.startAllowed).toBe(false)
  expect(result.changeAllowed).toBe(false)
  expect(result.endAllowed).toBe(false)
  expect(result.wheelAllowed).toBe(false)
  expect(result.wheelDefaultPrevented).toBe(true)
  expect(result.zoomDuringGesture).toBe(320)
  expect(result.zoomAfterWheel).toBe(320)
  expect(result.afterEnd).toBe(320)
  expect(result.sourceAtAnchorAfter).toBeCloseTo(result.sourceAtAnchorBefore, 8)
  // blur 取消手势；后续 change 不能再缩放。
  expect(result.afterBlur).toBe(320)
})

test('gesture change after a mid-pinch resize is clamped to the new viewport bounds', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#overview .pr-view')!
    const emit = (type: string, scale?: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      if (scale !== undefined) Object.defineProperty(event, 'scale', { value: scale })
      root.dispatchEvent(event)
    }
    window.fixture.overview.setTimeZoom(80)
    emit('gesturestart', 1)
    document.querySelector<HTMLElement>('#overview')!.style.width = '700px'
    emit('gesturechange', 1e9)
    const state = window.fixture.overview.getViewport()
    emit('gestureend', 1e9)
    return state
  })
  expect(result.timeZoom).toBeLessThanOrEqual(result.maxTimeZoom)
  expect(result.timeZoom).toBeGreaterThanOrEqual(result.minTimeZoom)
})
