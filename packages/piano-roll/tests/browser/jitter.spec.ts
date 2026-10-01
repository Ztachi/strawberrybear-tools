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
test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<style>body{margin:12px}#overview{height:350px}#editor{height:400px;margin-top:12px}</style><div id="overview"></div><div id="editor"></div>'
  )
  await page.addScriptTag({ content: bundle })
  await expect(page.locator('#editor .pr-empty')).toBeHidden()
  await page.evaluate(async () => {
    window.fixture.overview.setTimeZoom(1200)
    window.fixture.editor.setTimeZoom(1200)
    window.fixture.setTime(50, true)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
})

for (const id of ['overview', 'editor'] as const) {
  test(`${id}: vertical trackpad tails do not freeze and snap the playhead at maximum zoom`, async ({
    page,
  }) => {
    await page.locator(`#${id} .pr-scroll`).hover()
    const samples = page.evaluate(async (id) => {
      const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
      const handle = document.querySelector<HTMLElement>(`#${id} .pr-handle`)!
      const line = document.querySelector<HTMLElement>(`#${id} .pr-line`)!
      const start = performance.now()
      const result: { error: number; aligned: boolean; follow: boolean }[] = []
      for (let frame = 0; frame < 54; frame += 1) {
        window.fixture.setTime(50 + (performance.now() - start) / 1000, true)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const x = new DOMMatrixReadOnly(handle.style.transform).m41
        result.push({
          error: Math.abs(x - scroll.clientWidth / 2),
          aligned: handle.style.transform === line.style.transform,
          follow: window.fixture[id].getViewport().follow,
        })
      }
      return result
    }, id)
    // 原生双轴 wheel 覆盖触控板纵向手势及单独送达的小横向尾帧；不替换导航逻辑。
    await page.mouse.wheel(1, 80)
    await page.mouse.wheel(6, 0)
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 120)))
    await page.mouse.wheel(-1, -80)
    await page.mouse.wheel(-6, 0)
    const result = await samples
    expect(result.every((sample) => sample.follow && sample.aligned)).toBe(true)
    // 未确认的横向尾帧不能改变自动居中的画面；原生 scrollLeft 的整数舍入也不能移动中线。
    expect(Math.max(...result.map((sample) => sample.error))).toBeLessThanOrEqual(0.01)
  })

  test(`${id}: ruler seek uses the drawn fractional timeline rather than rounded native scroll`, async ({
    page,
  }) => {
    const seconds = 50.1234567
    await page.evaluate(async (seconds) => {
      window.fixture.setTime(seconds, true)
      window.fixture.seeks.length = 0
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
    }, seconds)
    const ruler = (await page.locator(`#${id} .pr-ruler`).boundingBox())!
    const width = await page.locator(`#${id} .pr-scroll`).evaluate((element) => element.clientWidth)
    // 标尺顶部避开播放头手柄本体，直接点击画面中的当前时间中线。
    await page.mouse.click(ruler.x + width / 2, ruler.y + 1)
    expect(await page.evaluate(() => window.fixture.seeks.at(-1))).toBeCloseTo(seconds, 8)
  })
}

test('horizontal Follow leaves the vertical scroll axis and keyboard raster untouched', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const scroll = document.querySelector<HTMLElement>('#editor .pr-scroll')!
    const keyboard = document.querySelector<HTMLCanvasElement>('#editor .pr-gutter canvas')!
    const clearRect = CanvasRenderingContext2D.prototype.clearRect
    const scrollTo = scroll.scrollTo
    let keyboardPaints = 0
    let verticalWrites = 0
    const startTop = scroll.scrollTop
    const startLeft = scroll.scrollLeft
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas === keyboard) keyboardPaints += 1
      return clearRect.apply(this, args)
    }
    scroll.scrollTo = function (...args: [number, number] | [ScrollToOptions?]) {
      const first = args[0]
      if (typeof first === 'number' || (first && first.top !== undefined)) verticalWrites += 1
      if (typeof first === 'number') scrollTo.call(this, first, args[1] as number)
      else Reflect.apply(scrollTo, this, [first])
    }
    try {
      for (let frame = 1; frame <= 24; frame += 1) {
        window.fixture.setTime(50 + frame / 60, true)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
      }
      return {
        keyboardPaints,
        verticalWrites,
        startTop,
        finalTop: scroll.scrollTop,
        moved: scroll.scrollLeft > startLeft,
      }
    } finally {
      CanvasRenderingContext2D.prototype.clearRect = clearRect
      scroll.scrollTo = scrollTo
    }
  })
  expect(result.moved).toBe(true)
  expect(result.finalTop).toBe(result.startTop)
  expect.soft(result.verticalWrites, '自动横向跟随不能反复重设正在原生滚动的纵轴').toBe(0)
  expect.soft(result.keyboardPaints, '纯横向播放不改变琴键图像，不能每帧清空重绘').toBe(0)
})

test('restoring a detached viewport keeps manual browsing and clamps it to the new host', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const view = window.fixture.editor
    window.fixture.setTime(50, false)
    view.restoreViewport({
      scrollLeft: 321.25,
      scrollTop: 400,
      timeZoom: 123.456789,
      pitchZoom: 22,
      follow: false,
    })
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
    const restored = view.getViewport()
    view.restoreViewport({ ...restored, scrollLeft: Number.MAX_VALUE, scrollTop: Number.MAX_VALUE })
    const bounded = view.getViewport()
    const scroll = document.querySelector<HTMLElement>('#editor .pr-scroll')!
    return {
      restored,
      bounded,
      maxLeft: scroll.scrollWidth - scroll.clientWidth,
      maxTop: scroll.scrollHeight - scroll.clientHeight,
    }
  })
  expect(result.restored).toMatchObject({
    scrollTop: 400,
    timeZoom: 123.456789,
    pitchZoom: 22,
    follow: false,
  })
  expect(Math.abs(result.restored.scrollLeft - 321.25)).toBeLessThan(1)
  expect(result.bounded.scrollLeft).toBeLessThanOrEqual(result.maxLeft)
  expect(result.bounded.scrollTop).toBeLessThanOrEqual(result.maxTop)
})

test('playhead and note canvas present the same viewport snapshot in each animation frame', async ({
  page,
}) => {
  const maximumMismatch = await page.evaluate(async () => {
    const scroll = document.querySelector<HTMLElement>('#editor .pr-scroll')!
    const notes = document.querySelectorAll<HTMLCanvasElement>('#editor .pr-pane canvas')[1]!
    const handle = document.querySelector<HTMLElement>('#editor .pr-handle')!
    const clearRect = CanvasRenderingContext2D.prototype.clearRect
    let paintedLeft = scroll.scrollLeft
    let mismatch = 0
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas === notes) paintedLeft = scroll.scrollLeft
      return clearRect.apply(this, args)
    }
    try {
      for (let frame = 1; frame <= 24; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        // 宿主在自己的 RAF 中送达transport：当前帧可以保留旧快照，也可以完整提交新快照，
        // 但不能只更新播放头而让已经绘制的音符仍处于上一帧的视口。
        window.fixture.setTime(50 + frame / 60, true)
        const presentedSeconds = Number(handle.getAttribute('aria-valuenow'))
        const presentedX = new DOMMatrixReadOnly(handle.style.transform).m41
        mismatch = Math.max(
          mismatch,
          Math.abs(presentedX - (presentedSeconds * 1200 - paintedLeft))
        )
      }
      return mismatch
    } finally {
      CanvasRenderingContext2D.prototype.clearRect = clearRect
    }
  })
  expect(maximumMismatch, '播放头与音符层必须使用同一次提交的视口坐标').toBeLessThanOrEqual(1)
})

for (const id of ['overview', 'editor'] as const) {
  test(`${id}: disabling Follow allows offscreen browsing until explicitly enabled again`, async ({
    page,
  }) => {
    const other: 'overview' | 'editor' = id === 'overview' ? 'editor' : 'overview'
    const scroll = page.locator(`#${id} .pr-scroll`)
    await page.evaluate((id) => window.fixture[id].setFollow(false), id)
    const before = await scroll.evaluate((element) => element.scrollLeft)
    const width = await scroll.evaluate((element) => element.clientWidth)
    await scroll.hover()
    await page.mouse.wheel(width * 2, 0)
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollLeft))
      .toBe(before + width * 2)
    const states = await page.evaluate(
      async ({ id, other }) => {
        const scroll = document.querySelector<HTMLElement>(`#${id} .pr-scroll`)!
        const handle = document.querySelector<HTMLElement>(`#${id} .pr-handle`)!
        const otherHandle = document.querySelector<HTMLElement>(`#${other} .pr-handle`)!
        const otherScroll = document.querySelector<HTMLElement>(`#${other} .pr-scroll`)!
        const initialLeft = scroll.scrollLeft
        const result: boolean[] = []
        for (let frame = 1; frame <= 18; frame += 1) {
          window.fixture.setTime(50 + frame / 60, true)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
          result.push(
            scroll.scrollLeft === initialLeft &&
              handle.hidden &&
              !window.fixture[id].getViewport().follow &&
              window.fixture[other].getViewport().follow &&
              Math.abs(
                new DOMMatrixReadOnly(otherHandle.style.transform).m41 - otherScroll.clientWidth / 2
              ) < 0.01
          )
        }
        window.fixture[id].setFollow(true)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
        return {
          preserved: result.every(Boolean),
          restored: !handle.hidden && window.fixture[id].getViewport().follow,
          restoredX: new DOMMatrixReadOnly(handle.style.transform).m41,
          center: scroll.clientWidth / 2,
        }
      },
      { id, other }
    )
    expect(states.preserved).toBe(true)
    expect(states.restored).toBe(true)
    expect(Math.abs(states.restoredX - states.center)).toBeLessThan(0.01)
  })
}
