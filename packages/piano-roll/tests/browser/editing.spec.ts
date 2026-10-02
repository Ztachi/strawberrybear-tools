import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type {} from './editing-fixture'

let bundle: string
test.beforeAll(async () => {
  bundle = (
    await build({
      entryPoints: [fileURLToPath(new URL('./editing-fixture.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    })
  ).outputFiles[0]!.text
})

test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<style>body{margin:0}#editor{width:900px;height:500px}#overview{width:900px;height:200px}</style><div id="editor"></div><div id="overview"></div>'
  )
  await page.addScriptTag({ content: bundle })
  await expect.poll(() => page.locator('#editor .pr-scroll').count()).toBe(1)
  // 让 C4 (60) 附近位于视口中央，避免命中坐标落在滚动区外。
  await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('#editor .pr-scroll')!
    scroll.scrollTop = (127 - 72) * 16
  })
  await page.waitForTimeout(50)
})

/** 滚动层左上角的页面坐标。 */
async function origin(page: Page): Promise<{ left: number; top: number }> {
  return page.locator('#editor .pr-scroll').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  })
}
async function pointFor(
  page: Page,
  tick: number,
  pitch: number
): Promise<{ x: number; y: number }> {
  const [base, local] = await Promise.all([
    origin(page),
    page.evaluate(({ tick, pitch }) => window.editing.point(tick, pitch), { tick, pitch }),
  ])
  return { x: base.left + local.x, y: base.top + local.y }
}
async function intents(page: Page) {
  return page.evaluate(() => window.editing.intents)
}

test('click selects and auditions, shift toggles', async ({ page }) => {
  const a = await pointFor(page, 700, 60)
  await page.mouse.click(a.x, a.y)
  let list = await intents(page)
  expect(list[0]).toEqual({ type: 'select', noteIds: ['a'], mode: 'replace' })
  expect(list[1]).toEqual({ type: 'audition', pitch: 60, velocity: 100, durationSeconds: 0.5 })
  await page.mouse.click(a.x, a.y)
  expect((await intents(page)).filter((intent) => intent.type === 'audition')).toHaveLength(2)
  const b = await pointFor(page, 1700, 64)
  await page.keyboard.down('Shift')
  await page.mouse.click(b.x, b.y)
  await page.keyboard.up('Shift')
  list = await intents(page)
  expect(list.at(-2)).toEqual({ type: 'select', noteIds: ['b'], mode: 'add' })
})

test('dragging a note body emits a snapped move for the whole selection', async ({ page }) => {
  await page.evaluate(() => window.editing.select(['a', 'b']))
  const from = await pointFor(page, 700, 60)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // 100px/s，480tick = 0.5s = 50px；向右 55px ≈ 528 tick → 吸附到 480 + ... 以按住音符起点为基准
  await page.mouse.move(from.x + 30, from.y - 16, { steps: 5 })
  await page.mouse.move(from.x + 55, from.y - 32, { steps: 5 })
  await page.mouse.up()
  const list = await intents(page)
  const move = list.find((intent) => intent.type === 'move')
  expect(move).toEqual({ type: 'move', noteIds: ['a', 'b'], deltaTick: 480, deltaPitch: 2 })
  // 拖动期间音高变化会发出试听
  expect(list.some((intent) => intent.type === 'audition' && intent.pitch === 62)).toBe(true)
})

test('跨速度变化的音符试听时长使用分段时间轴', async ({ page }) => {
  await page.evaluate(() => {
    const next = {
      ...window.editing.document,
      tempoMap: [
        { tick: 0, microsecondsPerQuarter: 500000 },
        { tick: 720, microsecondsPerQuarter: 1000000 },
      ],
    }
    window.editing.editor.setDocument(next)
  })
  const a = await pointFor(page, 700, 60)
  await page.mouse.click(a.x, a.y)
  expect((await intents(page)).find((intent) => intent.type === 'audition')).toEqual({
    type: 'audition',
    pitch: 60,
    velocity: 100,
    durationSeconds: 0.75,
  })
})

test('dragging the right edge resizes', async ({ page }) => {
  const end = await pointFor(page, 960, 60)
  await page.mouse.move(end.x - 2, end.y)
  await page.mouse.down()
  await page.mouse.move(end.x + 25, end.y, { steps: 4 })
  await page.mouse.move(end.x + 50, end.y, { steps: 4 })
  await page.mouse.up()
  const list = await intents(page)
  expect(list.find((intent) => intent.type === 'resize')).toEqual({
    type: 'resize',
    noteIds: ['a'],
    edge: 'end',
    deltaTick: 480,
  })
})

test('box selection picks intersecting notes; double click adds a note', async ({ page }) => {
  const start = await pointFor(page, 200, 70)
  const end = await pointFor(page, 2000, 58)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 6 })
  await page.mouse.up()
  let list = await intents(page)
  const box = list.filter((intent) => intent.type === 'select').at(-1)
  expect(box).toEqual({ type: 'select', noteIds: ['a', 'b'], mode: 'replace' })

  const blank = await pointFor(page, 3100, 72)
  await page.mouse.dblclick(blank.x, blank.y)
  list = await intents(page)
  expect(list.at(-1)).toEqual({
    type: 'add-note',
    trackId: 't1',
    pitch: 72,
    startTick: 3000,
    durationTicks: 240,
    velocity: undefined,
  })
})

test('draw tool paints a note whose length follows the drag', async ({ page }) => {
  await page.evaluate(() => window.editing.configure({ tool: 'draw' }))
  const start = await pointFor(page, 3400, 65)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 100, start.y, { steps: 5 })
  await page.mouse.up()
  const list = await intents(page)
  expect(list.at(-1)).toEqual({
    type: 'add-note',
    trackId: 't1',
    pitch: 65,
    startTick: 3360,
    durationTicks: 960,
    velocity: undefined,
  })
})

test('velocity lane drag previews and commits', async ({ page }) => {
  const lane = page.locator('#editor .pr-lane')
  await expect(lane).toBeVisible()
  const box = (await lane.boundingBox())!
  const local = await page.evaluate(() => window.editing.point(480, 60))
  const x = box.x + local.x + 3
  await page.mouse.move(x, box.y + box.height - 5)
  await page.mouse.down()
  await page.mouse.move(x, box.y + 2, { steps: 4 })
  await page.mouse.up()
  const list = await intents(page)
  const change = list.find((intent) => intent.type === 'set-velocity')
  expect(change?.type).toBe('set-velocity')
  if (change?.type === 'set-velocity') {
    expect(change.changes).toHaveLength(1)
    expect(change.changes[0]!.noteId).toBe('a')
    expect(change.changes[0]!.velocity).toBeGreaterThan(115)
  }
})

test('alt-drag on the ruler sets a loop and double click clears it', async ({ page }) => {
  const ruler = page.locator('#editor .pr-ruler')
  const box = (await ruler.boundingBox())!
  const [from, to] = await page.evaluate(() => [
    window.editing.point(970, 60).x,
    window.editing.point(1910, 60).x,
  ])
  await page.keyboard.down('Alt')
  await page.mouse.move(box.x + from, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + to, box.y + 10, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  let list = await intents(page)
  expect(list.at(-1)).toEqual({ type: 'loop-change', loop: { startTick: 960, endTick: 1920 } })
  await page.evaluate(() => window.editing.configure({ loop: { startTick: 960, endTick: 1920 } }))
  await page.mouse.dblclick(box.x + (from + to) / 2, box.y + 10)
  list = await intents(page)
  expect(list.at(-1)).toEqual({ type: 'loop-change', loop: null })
})

test('right click emits context menu with snapped tick', async ({ page }) => {
  const blank = await pointFor(page, 1250, 50)
  await page.mouse.click(blank.x, blank.y, { button: 'right' })
  const list = await intents(page)
  const menu = list.at(-1)
  expect(menu?.type).toBe('context-menu')
  if (menu?.type === 'context-menu') {
    expect(menu.noteId).toBeNull()
    expect(menu.tick).toBe(1200)
    expect(menu.pitch).toBe(50)
  }
})

test('overview renders host track actions', async ({ page }) => {
  const buttons = page.locator('#overview .track-action')
  await expect(buttons).toHaveCount(2)
  await buttons.nth(1).click()
  expect(await page.evaluate(() => window.editing.actions)).toEqual(['t2'])
})

test('画笔操作滚动条或视口外边界时不新增音符、不清空选择', async ({ page }) => {
  await page.evaluate(() =>
    window.editing.configure({ tool: 'draw', selectedNoteIds: new Set(['a']) })
  )
  await page.mouse.move(4, 4)
  await page.mouse.down()
  // 用 clientHeight/clientWidth 标定原生滚动条边界，兼容覆盖式和经典滚动条。
  await page.locator('#editor .pr-scroll').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    for (const point of [
      { x: rect.left + 100, y: rect.top + node.clientHeight + 1 },
      { x: rect.left + node.clientWidth + 1, y: rect.top + 100 },
    ]) {
      node.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 1,
          clientX: point.x,
          clientY: point.y,
        })
      )
      node.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          button: 0,
          pointerId: 1,
          clientX: point.x,
          clientY: point.y,
        })
      )
    }
  })
  await page.mouse.up()
  expect(await intents(page)).toEqual([])
})

test('音轨区域右侧句柄只在松手提交一次长度，Esc 取消', async ({ page }) => {
  await page.evaluate(() => window.editing.configure({ tool: 'draw' }))
  const handle = page.locator('#overview .pr-region-resize[data-track-id="t1"]')
  await expect(handle).toBeVisible()
  const rect = (await handle.boundingBox())!
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 50, y, { steps: 5 })
  await page.mouse.move(x + 150, y, { steps: 5 })
  expect((await intents(page)).filter((i) => i.type === 'resize-track-region')).toHaveLength(0)
  await page.mouse.up()
  const result = (await intents(page)).filter((i) => i.type === 'resize-track-region')
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ trackId: 't1' })
  expect(result[0]!.type === 'resize-track-region' && result[0].endTick).toBeGreaterThan(2880)
  const next = (await handle.boundingBox())!
  await page.mouse.move(next.x + 6, next.y + next.height / 2)
  await page.mouse.down()
  await page.mouse.move(next.x + 80, next.y + next.height / 2)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect((await intents(page)).filter((i) => i.type === 'resize-track-region')).toHaveLength(1)
  expect((await intents(page)).some((i) => i.type === 'add-note')).toBe(false)
})

test('拖动音轨区域到视口边缘会持续扩展并滚动，越过原曲尾不限一小节', async ({ page }) => {
  await page.evaluate(() => {
    window.editing.configure({ tool: 'select' })
    window.editing.overview.setTimeZoom(120)
  })
  const handle = page.locator('#overview .pr-region-resize[data-track-id="t1"]')
  await expect(handle).toBeVisible()
  const h = (await handle.boundingBox())!,
    pane = (await page.locator('#overview .pr-scroll').boundingBox())!
  await page.mouse.move(h.x + 6, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(pane.x + pane.width - 5, h.y + h.height / 2, { steps: 8 })
  await page.waitForTimeout(1800)
  await page.mouse.up()
  const list = (await intents(page)).filter((i) => i.type === 'resize-track-region')
  expect(list).toHaveLength(1)
  expect(list[0]!.type === 'resize-track-region' && list[0].endTick).toBeGreaterThan(7680 + 1920)
})
