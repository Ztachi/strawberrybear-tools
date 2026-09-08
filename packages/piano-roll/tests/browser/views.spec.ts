import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './fixture'

let bundle: string
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
    .toBe(false)
  expect(await page.evaluate(() => window.fixture.editor.getViewport())).toEqual(initial)
  await page.evaluate(() => window.fixture.editor.setTimeZoom(320))
  expect(await page.evaluate(() => window.fixture.overview.getViewport().timeZoom)).toBe(200)
  expect(await page.evaluate(() => window.fixture.overview.getViewport().scrollLeft)).toBe(620)
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

test('pointercancel and blur cancel drag without seeking', async ({ page }) => {
  for (const cancel of ['pointercancel', 'blur']) {
    await page.evaluate(() => window.fixture.setTime(2))
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
  await page.locator('#overview .pr-scroll').dblclick({ position: { x: 100, y: 240 } })
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
  expect(result.zoomDuringGesture).toBe(160)
  expect(result.zoomAfterWheel).toBe(160)
  expect(result.afterEnd).toBe(160)
  expect(result.sourceAtAnchorAfter).toBeCloseTo(result.sourceAtAnchorBefore, 8)
  // blur 取消手势；后续 change 不能再缩放。
  expect(result.afterBlur).toBe(160)
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
