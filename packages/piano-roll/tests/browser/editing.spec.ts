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
  const guide = page.locator('#editor .pr-drag-guide[data-gesture="notes"]')
  await expect(guide).toBeVisible()
  await expect(guide).toHaveAttribute('data-tick', '960')
  await expect(page.locator('#editor .pr-drag-position[data-gesture="notes"]')).toHaveText(
    '1.3.000'
  )
  const freeTick = await page.evaluate(() =>
    Math.round(480 + (55 / window.editing.editor.getViewport().timeZoom) * 960)
  )
  await page.keyboard.down('Alt')
  await expect(guide).toHaveAttribute('data-tick', String(freeTick))
  await page.keyboard.up('Alt')
  await expect(guide).toHaveAttribute('data-tick', '960')
  await page.mouse.up()
  await expect(guide).toBeHidden()
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

test('1/256 的最短音符预览和提交都使用整数 tick', async ({ page }) => {
  await page.evaluate(() =>
    window.editing.editor.setEditing({
      enabled: true,
      tool: 'select',
      selectedNoteIds: new Set(),
      defaultDurationTicks: 7.5,
      snapTicks: (tick, mode) =>
        (mode === 'floor' ? Math.floor(tick / 7.5) : Math.round(tick / 7.5)) * 7.5,
      onIntent: (intent) => window.editing.intents.push(intent),
    })
  )
  const end = await pointFor(page, 960, 60)
  const start = await pointFor(page, 480, 60)
  await page.mouse.move(end.x - 2, end.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 5, end.y, { steps: 5 })
  await expect(page.locator('#editor .pr-drag-guide[data-gesture="notes"]')).toHaveAttribute(
    'data-tick',
    '488'
  )
  await page.mouse.up()
  expect((await intents(page)).find((intent) => intent.type === 'resize')).toMatchObject({
    deltaTick: -472,
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
  await expect(page.locator('#overview .pr-drag-guide').last()).toBeHidden()
  await page.mouse.up()
  expect((await intents(page)).filter((i) => i.type === 'resize-track-region')).toHaveLength(1)
  expect((await intents(page)).some((i) => i.type === 'add-note')).toBe(false)
})

test('详情仅显示当前轨区域手柄，滚动音高后仍可拖拽，与总览使用相同边界', async ({ page }) => {
  await page.evaluate(() => window.editing.configure({ tool: 'draw' }))
  const handles = page.locator('#editor .pr-region-resize')
  await expect(handles).toHaveCount(1)
  await expect(handles).toHaveAttribute('data-track-id', 't1')
  const box = (await handles.boundingBox())!
  await page.mouse.move(box.x + 6, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 56, box.y + 10, { steps: 5 })
  await expect(page.locator('#editor .pr-drag-guide:visible')).toBeVisible()
  expect((await intents(page)).some((i) => i.type === 'resize-track-region')).toBe(false)
  await page.mouse.up()
  const resize = (await intents(page)).filter((i) => i.type === 'resize-track-region')
  expect(resize).toHaveLength(1)
  expect((await intents(page)).some((i) => i.type === 'add-note')).toBe(false)
  const end = resize[0]!.type === 'resize-track-region' ? resize[0].endTick : 0
  await page.evaluate((endTick) => {
    const next = {
      ...window.editing.document,
      tracks: window.editing.document.tracks.map((t) => (t.id === 't1' ? { ...t, endTick } : t)),
    }
    window.editing.editor.setDocument(next)
    window.editing.overview.setDocument(next)
  }, end)
  await expect(handles).toHaveAttribute('data-end-tick', String(end))
  await expect(page.locator('#overview .pr-region-resize[data-track-id="t1"]')).toHaveAttribute(
    'data-end-tick',
    String(end)
  )
  await page.evaluate(() => window.editing.editor.setSelectedTrack('t2'))
  await expect(handles).toHaveAttribute('data-track-id', 't2')
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
  const left = await page.evaluate(() => window.editing.overview.getViewport().scrollLeft)
  const endTick = list[0]!.type === 'resize-track-region' ? list[0].endTick : 0
  await page.evaluate((endTick) => {
    const source = window.editing.document
    window.editing.overview.setDocument({
      ...source,
      durationTicks: endTick + 1920,
      tracks: source.tracks.map(t => t.id === 't1' ? { ...t, endTick } : t),
    })
  }, endTick)
  await expect.poll(() => page.evaluate(() => window.editing.overview.getViewport().scrollLeft)).toBe(left)
})

test('缩短句柄越过音符尾部，受限音符不可命中，拉长后恢复命中', async ({ page }) => {
  await page.evaluate(() => {
    const next = {
      ...window.editing.document,
      tracks: window.editing.document.tracks.map((t) =>
        t.id === 't1' ? { ...t, startTick: 0, endTick: 2880 } : t
      ),
    }
    window.editing.editor.setDocument(next)
    window.editing.overview.setDocument(next)
    window.editing.configure({ tool: 'select' })
  })
  const handle = page.locator('#overview .pr-region-resize[data-track-id="t1"]')
  const r = (await handle.boundingBox())!
  const zoom = await page.evaluate(() => window.editing.overview.getViewport().timeZoom)
  await page.mouse.move(r.x + 6, r.y + 10)
  await page.mouse.down()
  await page.mouse.move(r.x + 6 - (960 / 960) * zoom, r.y + 10, { steps: 5 })
  await page.mouse.up()
  const result = (await intents(page)).find((i) => i.type === 'resize-track-region')
  expect(result).toMatchObject({ trackId: 't1', endTick: 1920 })
  await page.evaluate(() => {
    const next = {
      ...window.editing.document,
      tracks: window.editing.document.tracks.map((t) =>
        t.id === 't1' ? { ...t, startTick: 0, endTick: 1920 } : t
      ),
    }
    window.editing.editor.setDocument(next)
    window.editing.overview.setDocument(next)
    window.editing.intents.length = 0
  })
  await expect(handle).toHaveAttribute('data-end-tick', '1920')
  const hidden = await pointFor(page, 2600, 67)
  await page.mouse.click(hidden.x, hidden.y)
  expect((await intents(page)).some((i) => i.type === 'audition')).toBe(false)
  await page.evaluate(() => {
    window.editing.editor.setDocument(window.editing.document)
    window.editing.intents.length = 0
  })
  await page.mouse.click(hidden.x, hidden.y)
  expect((await intents(page)).some((i) => i.type === 'select' && i.noteIds.includes('c'))).toBe(
    true
  )
})

for (const [smart, alt, expected] of [
  [true, false, 2777],
  [true, true, 2810],
  [false, false, 2760],
] as const) {
  test(`区域边缘吸附音符结尾 smart=${smart} Alt=${alt}`, async ({ page }) => {
    await page.evaluate((smart) => {
      const doc = {
        ...window.editing.document,
        tracks: window.editing.document.tracks.map((t) => ({ ...t, startTick: 0, endTick: 3600 })),
        notes: window.editing.document.notes.map((n) =>
          n.id === 'c' ? { ...n, endTick: 2777 } : n
        ),
      }
      window.editing.overview.setDocument(doc)
      window.editing.overview.setTimeZoom(100)
      window.editing.configure({ snapToNoteEnds: smart })
    }, smart)
    const handle = page.locator('#overview .pr-region-resize[data-track-id="t1"]')
    const r = (await handle.boundingBox())!
    if (alt) await page.keyboard.down('Alt')
    await page.mouse.move(r.x + 6, r.y + 10)
    await page.mouse.down()
    await page.mouse.move(r.x + 6 + ((2810 - 3600) / 960) * 100, r.y + 10, { steps: 5 })
    await page.mouse.up()
    if (alt) await page.keyboard.up('Alt')
    expect((await intents(page)).find((i) => i.type === 'resize-track-region')).toMatchObject({
      endTick: expected,
    })
  })
}

test('小节吸附区域边缘，点击被截短音符仅试听有效时长', async ({ page }) => {
  await page.evaluate(() => {
    const source = window.editing.document
    window.editing.overview.setDocument({
      ...source,
      tracks: source.tracks.map((t) => ({ ...t, startTick: 0, endTick: 4800 })),
    })
    window.editing.overview.setTimeZoom(100)
    window.editing.overview.setEditing({
      enabled: true,
      tool: 'select',
      selectedNoteIds: new Set(),
      defaultDurationTicks: 1920,
      snapToNoteEnds: true,
      snapTicks: (tick) => Math.round(tick / 1920) * 1920,
      onIntent: (intent) => window.editing.intents.push(intent),
    })
  })
  const handle = page.locator('#overview .pr-region-resize[data-track-id="t1"]')
  const r = (await handle.boundingBox())!
  await page.mouse.move(r.x + 6, r.y + 10)
  await page.mouse.down()
  await page.mouse.move(r.x + 6 + ((3400 - 4800) / 960) * 100, r.y + 10, { steps: 5 })
  const guide = page.locator('#overview .pr-drag-guide').last()
  await expect(guide).toBeVisible()
  await expect(guide).toHaveAttribute('data-tick', '3840')
  await expect(page.locator('#overview .pr-drag-position').last()).toHaveText('3.1.000')
  expect((await intents(page)).some((i) => i.type === 'resize-track-region')).toBe(false)
  await page.keyboard.down('Alt')
  await expect(guide).toHaveAttribute('data-tick', '3400')
  await page.keyboard.up('Alt')
  await expect(guide).toHaveAttribute('data-tick', '3840')
  await page.mouse.up()
  await expect(guide).toBeHidden()
  expect((await intents(page)).find((i) => i.type === 'resize-track-region')).toMatchObject({
    endTick: 3840,
  })
  await page.evaluate(() => {
    window.editing.editor.setDocument({
      ...window.editing.document,
      tracks: window.editing.document.tracks.map((t) => ({ ...t, endTick: 720 })),
    })
    window.editing.intents.length = 0
  })
  const note = await pointFor(page, 600, 60)
  await page.mouse.click(note.x, note.y)
  expect((await intents(page)).find((i) => i.type === 'audition')).toMatchObject({
    durationSeconds: 0.25,
  })
})

test('点击琴键只试听，黑键和相邻白键肩部按真实形状命中', async ({ page }) => {
  await page.evaluate(() => window.editing.editor.setPitchZoom(24.5))
  const point = await pointFor(page, 0, 61)
  const gutter = (await page.locator('#editor .pr-gutter').boundingBox())!
  await page.mouse.click(gutter.x + 20, point.y)
  await page.mouse.click(gutter.x + 54, point.y - 6)
  await page.mouse.click(gutter.x + 54, point.y + 6)
  expect(await intents(page)).toEqual([
    { type: 'audition', pitch: 61, velocity: 100 },
    { type: 'audition', pitch: 62, velocity: 100 },
    { type: 'audition', pitch: 60, velocity: 100 },
  ])
})

test('参考音符点击自动换轨，同一次拖动可编辑，重叠时当前轨优先', async ({ page }) => {
  await page.evaluate(() => {
    const source = window.editing.document
    window.editing.editor.setDocument({
      ...source,
      notes: [
        ...source.notes,
        { id: 'ghost', trackId: 't2', pitch: 65, velocity: 90, startTick: 480, endTick: 960 },
        { id: 'overlap', trackId: 't2', pitch: 60, velocity: 90, startTick: 480, endTick: 960 },
      ],
    })
    window.editing.editor.setShowOtherTracks(true)
  })
  const current = await pointFor(page, 700, 60)
  await page.mouse.click(current.x, current.y)
  expect(await page.evaluate(() => window.editing.actions)).toEqual([])
  const ghost = await pointFor(page, 700, 65)
  const before = await page.evaluate(() => window.editing.editor.getViewport())
  await page.mouse.move(ghost.x, ghost.y)
  await page.mouse.down()
  await page.mouse.move(ghost.x + 50, ghost.y - 16, { steps: 5 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.editing.actions)).toEqual(['select:t2'])
  expect((await intents(page)).find((i) => i.type === 'move')).toEqual({
    type: 'move',
    noteIds: ['ghost'],
    deltaTick: 480,
    deltaPitch: 1,
  })
  expect(await page.evaluate(() => window.editing.editor.getViewport().scrollTop)).toBe(
    before.scrollTop
  )
  await expect(page.locator('#editor .pr-region-resize')).toHaveAttribute('data-track-id', 't2')
})

test('关闭参考音符后不可选中，缩短区域外的参考音符也不可命中，右键可换轨', async ({ page }) => {
  await page.evaluate(() => {
    const source = window.editing.document
    window.editing.editor.setDocument({
      ...source,
      tracks: source.tracks.map((t) => (t.id === 't2' ? { ...t, endTick: 720 } : t)),
      notes: [
        ...source.notes,
        { id: 'ghost', trackId: 't2', pitch: 65, velocity: 90, startTick: 480, endTick: 960 },
      ],
    })
  })
  const ghost = await pointFor(page, 600, 65)
  await page.mouse.click(ghost.x, ghost.y)
  expect(await page.evaluate(() => window.editing.actions)).toEqual([])
  await page.evaluate(() => window.editing.editor.setShowOtherTracks(true))
  const clipped = await pointFor(page, 850, 65)
  await page.mouse.click(clipped.x, clipped.y)
  expect(await page.evaluate(() => window.editing.actions)).toEqual([])
  await page.evaluate(() => window.editing.select(['a', 'ghost']))
  await page.mouse.click(ghost.x, ghost.y, { button: 'right' })
  expect(await page.evaluate(() => window.editing.actions)).toEqual(['select:t2'])
  expect((await intents(page)).at(-2)).toEqual({
    type: 'select',
    noteIds: ['ghost'],
    mode: 'replace',
  })
  expect((await intents(page)).at(-1)).toMatchObject({ type: 'context-menu', noteId: 'ghost' })
})

test('实际发音状态同时更新琴键和整行高光，单独发音帧不重绘网格或音符', async ({ page }) => {
  const counts = await page.evaluate(async () => {
    const roll = window.editing.editor
    const keyboard = document.querySelector<HTMLCanvasElement>('#editor .pr-gutter canvas')!
    const grid = document.querySelector<HTMLCanvasElement>('#editor .pr-pane > canvas')!
    const notes = document.querySelector<HTMLCanvasElement>('#editor .pr-notes')!
    const activity = document.querySelector<HTMLCanvasElement>('#editor .pr-pitch-activity')!
    const counts = { grid: 0, notes: 0, keyboard: 0, activity: 0 }
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas === grid) counts.grid++
      if (this.canvas === notes) counts.notes++
      if (this.canvas === keyboard) counts.keyboard++
      if (this.canvas === activity) counts.activity++
      return clear.apply(this, args)
    }
    try {
      roll.setTransport({
        positionSeconds: 0,
        isPlaying: false,
        playbackRate: 1,
        activePitches: [60, 61],
      })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const y = window.editing.point(0, 60).y * devicePixelRatio
      const activeKey = Array.from(
        keyboard.getContext('2d')!.getImageData(10 * devicePixelRatio, y, 1, 1).data
      )
      const activeRow = Array.from(
        activity.getContext('2d')!.getImageData(100 * devicePixelRatio, y, 1, 1).data
      )
      const blackY = window.editing.point(0, 61).y
      const keyPixel = (x: number, y: number) => Array.from(keyboard.getContext('2d')!
        .getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data)
      const blackFace = keyPixel(20, blackY)
      const blackTail = keyPixel(54, blackY - 6)
      const whiteShoulder = keyPixel(54, blackY + 6)
      const whiteSeam = keyPixel(54, blackY + roll.getViewport().pitchZoom / 2)
      roll.setTransport({
        positionSeconds: 0,
        isPlaying: false,
        playbackRate: 1,
        activePitches: [],
      })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const cleared = Array.from(
        activity.getContext('2d')!.getImageData(100 * devicePixelRatio, y, 1, 1).data
      )
      return { counts, activeKey, activeRow, cleared, blackFace, blackTail, whiteShoulder, whiteSeam }
    } finally {
      CanvasRenderingContext2D.prototype.clearRect = clear
    }
  })
  expect(counts.counts).toEqual({ grid: 0, notes: 0, keyboard: 2, activity: 2 })
  expect(counts.activeKey).toEqual([227, 111, 134, 255])
  expect(counts.blackFace).toEqual([227, 111, 134, 255])
  expect(counts.blackTail).toEqual([255, 255, 255, 255])
  expect(counts.whiteShoulder).toEqual([227, 111, 134, 255])
  expect(counts.whiteSeam).toEqual([227, 111, 134, 255])
  // 半透明颜色回读会经过浏览器预乘 alpha，允许单个色阶的舍入差异。
  for (const [index, value] of [226, 250, 255].entries())
    expect(Math.abs(counts.activeRow[index]! - value)).toBeLessThanOrEqual(4)
  expect(counts.activeRow[3]).toBeGreaterThan(0)
  expect(counts.cleared).toEqual([0, 0, 0, 0])
  await page.evaluate(() => {
    window.editing.editor.setPitchZoom(28)
    window.editing.editor.setTransport({
      positionSeconds: 0,
      isPlaying: false,
      playbackRate: 1,
      activePitches: [60, 64, 67],
    })
  })
  await page.waitForTimeout(50)
  await page.locator('#editor').screenshot({ path: test.info().outputPath('sounding-pitches.png') })
})

test('浏览态可显示和点击参考轨，切换轨道不产生编辑意图', async ({ page }) => {
  await page.evaluate(() => {
    const source = window.editing.document
    window.editing.editor.setDocument({
      ...source,
      // 浏览兼容提前结束的 EOT，参考音符仍按实际音符范围展示并可点击。
      tracks: source.tracks.map(track => track.id === 't2' ? { ...track, endTick: 600 } : track),
      notes: [
        ...source.notes,
        { id: 'reference', trackId: 't2', pitch: 65, velocity: 90, startTick: 480, endTick: 960 },
      ],
    })
    window.editing.editor.setEditing(undefined)
    window.editing.editor.setShowOtherTracks(true)
  })
  const point = await pointFor(page, 700, 65)
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#editor .pr-scroll')).toHaveCSS('cursor', 'pointer')
  await page.mouse.click(point.x, point.y)
  expect(await page.evaluate(() => window.editing.actions)).toEqual(['select:t2'])
  expect(await intents(page)).toEqual([])
  await page.evaluate(() => window.editing.editor.setSelectedTrack('t1'))
  await page.evaluate(() => window.editing.editor.setShowOtherTracks(false))
  await page.mouse.click(point.x, point.y)
  expect(await page.evaluate(() => window.editing.actions)).toEqual(['select:t2'])
})

test('区域把手位于有效边界外，不覆盖当前音符区域', async ({ page }) => {
  await page.evaluate(() => window.editing.configure({ enabled: true }))
  const handle = page.locator('#editor .pr-region-resize')
  await expect(handle).toBeVisible()
  const expected = await pointFor(page, Number(await handle.getAttribute('data-end-tick')), 60)
  const rect = (await handle.boundingBox())!
  expect(rect.x).toBeCloseTo(expected.x, 1)
})


test('区域松手后等待异步宿主回传，不闪回旧边界；回传后撤销仍能恢复', async ({ page }) => {
  await page.evaluate(() => window.editing.configure({ tool: 'select' }))
  const handle = page.locator('#overview .pr-region-resize[data-track-id="t1"]')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 6, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 126, box.y + 10, { steps: 6 })
  // WebKit 的指针移动与 Canvas 绘制分帧，等待预览真正绘制后再记录松手位置。
  await expect(handle).not.toHaveAttribute('data-end-tick', '2880')
  const preview = await handle.getAttribute('data-end-tick')
  await page.mouse.up()
  // 独立窗口经 IPC 回传文档前也要保持松手位置，不允许用微任务或固定延时清掉预览。
  await page.waitForTimeout(350)
  await expect(handle).toHaveAttribute('data-end-tick', preview!)
  await page.evaluate((endTick) => {
    window.editing.overview.setDocument({
      ...window.editing.document,
      tracks: window.editing.document.tracks.map(t => t.id === 't1' ? { ...t, endTick: Number(endTick) } : t),
    })
  }, preview)
  await expect(handle).toHaveAttribute('data-end-tick', preview!)
  await page.evaluate(() => window.editing.overview.setDocument(window.editing.document))
  await expect(handle).toHaveAttribute('data-end-tick', '2880')
})


test('音符占满可见行时发音高光仍可见，光晕向行外柔和扩散且不遮盖音轨颜色', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const roll = window.editing.editor
    const source = window.editing.document
    roll.setDocument({
      ...source,
      durationTicks: 19200,
      tracks: source.tracks.map(t => ({ ...t, color: '#4ab97b', startTick: 0, endTick: 19200 })),
      notes: [{ id: 'long', trackId: 't1', pitch: 60, velocity: 100, startTick: 0, endTick: 19200 }],
    })
    roll.setPitchZoom(28)
    const pane = document.querySelector<HTMLElement>('#editor .pr-pane')!
    const notes = pane.querySelector<HTMLCanvasElement>('.pr-notes')!
    const activity = pane.querySelector<HTMLCanvasElement>('.pr-pitch-activity')!
    const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await settle()
    const viewport = roll.getViewport()
    const y = window.editing.point(0, 60).y
    const combinedPixel = () => {
      const sample = document.createElement('canvas')
      sample.width = notes.width
      sample.height = notes.height
      const context = sample.getContext('2d')!
      // 同一个 stacking context 内按真实 DOM 顺序合成，检查屏幕上最终可见的颜色。
      for (const layer of pane.querySelectorAll<HTMLCanvasElement>(':scope > canvas')) context.drawImage(layer, 0, 0)
      return Array.from(context.getImageData(200 * devicePixelRatio, y * devicePixelRatio, 1, 1).data)
    }
    const before = combinedPixel()
    roll.setTransport({ positionSeconds: 0, isPlaying: false, playbackRate: 1, activePitches: [60] })
    await settle()
    const after = combinedPixel()
    const top = y - viewport.pitchZoom / 2
    const pixel = (offset: number) => Array.from(activity.getContext('2d')!
      .getImageData(200 * devicePixelRatio, (top - offset) * devicePixelRatio, 1, 1).data)
    return {
      before, after,
      near: pixel(3), far: pixel(12),
      overNotes: !!(notes.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING),
    }
  })
  expect(result.overNotes).toBe(true)
  expect(result.near[3]).toBeGreaterThan(0)
  expect(result.near[3]).toBeGreaterThan(result.far[3]!)
  expect(result.after[0]! - result.before[0]!).toBeGreaterThan(15)
  expect(result.after[1]).toBeGreaterThan(result.after[0]!)
  expect(result.after[1]).toBeGreaterThan(result.after[2]!)
  await page.locator('#editor').screenshot({ path: test.info().outputPath('connected-keys-note-glow.png') })
})
