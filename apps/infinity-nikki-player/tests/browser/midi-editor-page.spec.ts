import { expect, test, type Page } from '@playwright/test'

test('歌曲详情进入编辑后刷新，会等待曲库载入并保留来源名称', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?source&cold')
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '布局验收'
  )
  await expect(page.locator('.midi-editor-missing')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
  await expect(page.locator('.midi-editor-missing')).toHaveCount(0)
})

test('来源确实不存在时，错误信息支持原生选择复制', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?source&cold')
  await expect(page.locator('.detail-piano-roll')).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.navigate('/midi-editor/new?from=missing.mid'))
  const error = page.locator('.midi-editor-missing [role="alert"]')
  await expect(error).toContainText('找不到来源 MIDI 文件')
  await expect(error).toHaveCSS('user-select', 'text')
  expect(
    await error.evaluate((element) => {
      const selection = getSelection()!
      const range = document.createRange()
      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)
      return selection.toString()
    })
  ).toContain('找不到来源 MIDI 文件')
})

test('总览曲长随音轨区域缩短、撤销和禁用实时更新', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1')
  const duration = page.locator('.piano-song-duration')
  await expect(duration).toHaveText('时长 0:07')
  const handle = page.locator('.detail-piano-roll .pr-region-resize').first()
  const rect = (await handle.boundingBox())!
  await page.mouse.move(rect.x + 6, rect.y + 10)
  await page.mouse.down()
  await page.mouse.move(rect.x - 90, rect.y + 10, { steps: 8 })
  await page.mouse.up()
  await expect(duration).not.toHaveText('时长 0:07')
  await page.getByRole('button', { name: /^撤销/ }).click()
  await expect(duration).toHaveText('时长 0:07')
  await page.locator('.detail-piano-roll').getByRole('switch').click()
  await expect(duration).toHaveText('时长 0:00')
})

for (const populated of [false, true]) {
  test(`区域连续延长跨多个小节，主窗口及独立窗口松手不闪回：${populated ? '已有歌曲' : '空白项目'}`, async ({
    page,
  }) => {
    if (populated) {
      await page.goto('/tests/browser/midi-editor-page.html?populated=1')
      await page.locator('.pr-track-select').first().dblclick()
    }
    for (const detached of [false, true]) {
      let target = page
      if (detached) {
        const opening = page.waitForEvent('popup')
        await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
        target = await opening
      }
      await expect(target.locator('.detail-piano-editor')).toBeVisible()
      for (const selector of ['.detail-piano-roll', '.detail-piano-editor']) {
        const area = target.locator(selector)
        const handle = area.locator('.pr-region-resize').first()
        const scroll = area.locator('.pr-scroll')
        // 外侧把手可能随曲尾位于视口之外，先滚动到末尾的留白再抓取。
        await scroll.evaluate(async (element) => {
          element.scrollLeft = element.scrollWidth - element.clientWidth
          // Canvas 和外侧句柄在动画帧更新，不能用滚动前的按钮坐标抓取。
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
        })
        await expect(handle).toBeVisible()
        const box = (await handle.boundingBox())!
        const pane = (await scroll.boundingBox())!
        const before = Number(await handle.getAttribute('data-end-tick'))
        await target.mouse.move(box.x + 6, box.y + 10)
        await target.mouse.down()
        await target.mouse.move(pane.x + pane.width - 2, box.y + 10, { steps: 8 })
        await expect
          .poll(async () => Number(await handle.getAttribute('data-end-tick')))
          .toBeGreaterThan(before + 1920 * 3)
        const leftBeforeUp = await scroll.evaluate((element) => element.scrollLeft)
        // 每帧记录跨窗口回传期间的显示值，最终值正确不足以证明中间没有闪回。
        const samples = handle.evaluate(async (element) => {
          const frames: { end: number; left: number }[] = []
          const scroll =
            element.parentElement!.parentElement!.querySelector<HTMLElement>('.pr-scroll')!
          const stop = performance.now() + 350
          while (performance.now() < stop) {
            await new Promise(requestAnimationFrame)
            frames.push({
              end: Number((element as HTMLElement).dataset.endTick),
              left: scroll.scrollLeft,
            })
          }
          return frames
        })
        await target.mouse.up()
        const frames = await samples
        expect(Math.min(...frames.map((frame) => frame.end))).toBeGreaterThan(before + 1920 * 3)
        expect(Math.min(...frames.map((frame) => frame.left))).toBeGreaterThanOrEqual(
          leftBeforeUp - 1
        )
        const after = await handle.getAttribute('data-end-tick')
        await target.getByRole('button', { name: /^撤销/ }).click()
        await expect(handle).toHaveAttribute('data-end-tick', String(before))
        await target.getByRole('button', { name: /^重做/ }).click()
        await expect(handle).toHaveAttribute('data-end-tick', after!)
      }
    }
  })
}

/** 依据淡色参考填充定位真实 Canvas 音符，不依赖页面私有调试接口。 */
async function referenceNotePoint(page: Page): Promise<{ x: number; y: number }> {
  return page.locator('.detail-piano-editor .pr-notes').evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const rect = canvas.getBoundingClientRect()
    const pixels: { x: number; y: number }[] = []
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4
        if (data[i + 3]! >= 80 && data[i + 3]! <= 84) pixels.push({ x, y })
      }
    if (!pixels.length) throw new Error('参考音符没有绘制')
    return {
      x:
        rect.x +
        ((pixels.reduce((sum, p) => sum + p.x, 0) / pixels.length) * rect.width) / canvas.width,
      y:
        rect.y +
        ((pixels.reduce((sum, p) => sum + p.y, 0) / pixels.length) * rect.height) / canvas.height,
    }
  })
}

test('参考音轨默认开启，图标开关和跨轨拖动编辑一致，独立窗口还原保留偏好', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&single=1&reference=1')
  await page.locator('.pr-track[data-track-id="piano"] .pr-track-select').dblclick()
  const toggle = page.getByRole('button', { name: '显示其他音轨', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.hover()
  await expect(page.getByRole('tooltip')).toContainText('点击参考音符')
  const point = await referenceNotePoint(page)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 20, point.y - 16, { steps: 4 })
  await page.mouse.up()
  await expect(page.locator('.detail-piano-editor .piano-roll-slot-title')).toHaveText('参考旋律')
  await expect(page.locator('.note-inspector')).toContainText('F#4')
  await page.getByRole('button', { name: /^撤销/ }).click()
  await expect(page.locator('.note-inspector')).toContainText('F4')
  await expect(page.getByRole('button', { name: /^撤销/ })).toBeDisabled()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  const popupToggle = popup.getByRole('button', { name: '显示其他音轨', exact: true })
  await expect(popupToggle).toHaveAttribute('aria-pressed', 'false')
  await popupToggle.click()
  await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
})

test('点击参考音符后，总览将远处选中的音轨平滑滚动到视口中心', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated&single&reference&referenceFar')
  await page.locator('.pr-track[data-track-id="piano"] .pr-track-select').dblclick()
  const overview = page.locator('.detail-piano-roll')
  const scroll = overview.locator('.pr-scroll')
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0)
  const point = await referenceNotePoint(page)
  await page.mouse.click(point.x, point.y)
  await expect(page.locator('.detail-piano-editor .piano-roll-slot-title')).toHaveText('参考旋律')
  const track = overview.locator('.pr-track[data-track-id="reference"]')
  await expect(track).toHaveAttribute('data-selected', 'true')
  await expect
    .poll(async () => {
      const row = await track.boundingBox()
      const viewport = await scroll.boundingBox()
      return Math.abs(row!.y + row!.height / 2 - viewport!.y - viewport!.height / 2)
    })
    .toBeLessThan(2)
})

/** 检查实际 Canvas 像素，避免只验证菜单状态而遗漏总览的颜色绘制。 */
async function noteColorPixels(page: Page, pane: string, rgb: number[]): Promise<number> {
  return page.locator(`${pane} .pr-notes`).evaluate((element, color) => {
    const canvas = element as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 0; index < data.length; index += 4) {
      if (
        data[index] === color[0] &&
        data[index + 1] === color[1] &&
        data[index + 2] === color[2] &&
        data[index + 3] === 255
      )
        count += 1
    }
    return count
  }, rgb)
}

async function openSettings(page: Page): Promise<void> {
  if (
    (await page
      .getByRole('button', { name: '乐曲设置', exact: true })
      .getAttribute('aria-expanded')) !== 'true'
  ) {
    await page.getByRole('button', { name: '乐曲设置', exact: true }).click()
    await expect(page.locator('.toolbar-meter').first()).toBeVisible()
  }
}

async function openSnapSettings(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: '吸附', exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(page.getByRole('switch', { name: '启用吸附', exact: true })).toBeVisible()
}

async function openTemplateSettings(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: '映射模板', exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(page.locator('.editor-template-select:visible')).toBeVisible()
}

async function openEditorMoreActions(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: '更多操作', exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(page.getByRole('menu')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  await expect(page.locator('.editor-toolbar')).toBeVisible()
})

test('歌曲 A 的旧共用草稿只在 A 恢复，不会提示给 B 或空白新建', async ({ page }) => {
  await page.evaluate(() => {
    window.midiEditorFixture.setSongs(['A.mid', 'B.mid'])
    window.midiEditorFixture.seedDraft('create', 'A 的改编草稿', 'A.mid')
    return window.midiEditorFixture.navigate('/midi-editor/new?from=B.mid')
  })
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await expect(name).toHaveValue('B')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => window.midiEditorFixture.navigate('/midi-editor/new'))
  await expect(name).toHaveValue('未命名项目')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => window.midiEditorFixture.navigate('/midi-editor/new?from=A.mid'))
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.midi-editor-loading .ant-skeleton-active')).toHaveCount(3)
  await expect(page.locator('.editor-project-actions')).toHaveCount(0)
  await expect(page.locator('.editor-toolbar')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('draft-loading-skeleton.png') })
  await page.getByRole('button', { name: '加载草稿', exact: true }).click()
  await expect(name).toHaveValue('A 的改编草稿')
  await expect(page.locator('.midi-editor-loading')).toHaveCount(0)
  await expect(page.locator('.editor-save-trigger')).toHaveClass(/ant-btn-variant-text/)
})

test('歌曲 A 尚在解析时切到 B，A 的迟到结果和草稿不会覆盖 B', async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window.midiEditorFixture
    fixture.setSongs(['A.mid', 'B.mid'])
    fixture.seedDraft('create', 'A 旧草稿', 'A.mid')
    fixture.deferParse('A.mid')
    void fixture.navigate('/midi-editor/new?from=A.mid')
  })
  await expect.poll(() => page.evaluate(() => window.midiEditorFixture.isParsePending())).toBe(true)
  await page.evaluate(() => window.midiEditorFixture.navigate('/midi-editor/new?from=B.mid'))
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await expect(name).toHaveValue('B')
  await page.evaluate(async () => {
    window.midiEditorFixture.finishParse()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await expect(name).toHaveValue('B')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('空白创作、歌曲 A/B 和已有项目分别恢复草稿，直接关闭保留各自草稿', async ({ page }) => {
  const keys = await page.evaluate(async () => {
    const fixture = window.midiEditorFixture
    fixture.setSongs(['A.mid', 'B.mid'])
    return Promise.all([
      fixture.seedEntryDraft({ kind: 'song', filename: 'A.mid' }, 'A 专属草稿'),
      fixture.seedEntryDraft({ kind: 'song', filename: 'B.mid' }, 'B 专属草稿'),
      fixture.seedEntryDraft({ kind: 'create' }, '空白创作草稿'),
      fixture.seedEntryDraft({ kind: 'edit', id: 'saved-A' }, '已保存项目草稿'),
    ])
  })
  const cases = [
    ['/midi-editor/new?from=A.mid', 'A 专属草稿'],
    ['/midi-editor/new?from=B.mid', 'B 专属草稿'],
    ['/midi-editor/new', '空白创作草稿'],
    ['/midi-editor/saved-A', '已保存项目草稿'],
  ]
  for (let index = 0; index < cases.length; index++) {
    await page.evaluate((path) => {
      void window.midiEditorFixture.navigate(path)
    }, cases[index]![0]!)
    if (index > 0) await page.getByRole('button', { name: '直接关闭', exact: true }).click()
    await page.getByRole('button', { name: '加载草稿', exact: true }).click()
    await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
      cases[index]![1]!
    )
    expect((await page.evaluate(() => window.midiEditorFixture.draftKeys())).sort()).toEqual(
      keys.sort()
    )
  }
})

test('直接关闭立即写入最新改动，再进入同一项目可加载草稿', async ({ page }) => {
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('直接关闭前的最新修改')
  await page.evaluate(() => {
    void window.midiEditorFixture.navigate('/navigation-away')
  })
  await page.getByRole('button', { name: '直接关闭', exact: true }).click()
  await expect(page.locator('.navigation-away')).toBeVisible()
  await page.evaluate(() => {
    void window.midiEditorFixture.navigate('/midi-editor/new')
  })
  await page.getByRole('button', { name: '加载草稿', exact: true }).click()
  await expect(name).toHaveValue('直接关闭前的最新修改')
})

test('独立窗口直接关闭后，同一入口仍可加载最新草稿', async ({ page }) => {
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  await popup
    .locator('.midi-editor-name input, input.midi-editor-name')
    .fill('独立窗口关闭的最新草稿')
  await popup.getByRole('button', { name: '更多操作', exact: true }).click()
  await popup.getByRole('menuitem', { name: '关闭', exact: true }).click()
  await popup.getByRole('button', { name: '直接关闭', exact: true }).click()
  await expect.poll(() => popup.isClosed()).toBe(true)
  await page.evaluate(() => {
    void window.midiEditorFixture.navigate('/midi-editor/new')
  })
  await page.getByRole('button', { name: '加载草稿', exact: true }).click()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '独立窗口关闭的最新草稿'
  )
})

test('只有明确丢弃草稿才删除当前入口，其他歌曲草稿保留', async ({ page }) => {
  const songKey = await page.evaluate(async () => {
    await window.midiEditorFixture.seedEntryDraft({ kind: 'create' }, '待丢弃的新建草稿')
    return window.midiEditorFixture.seedEntryDraft({ kind: 'song', filename: 'A.mid' }, 'A 的草稿')
  })
  await page.evaluate(() => window.midiEditorFixture.navigate('/navigation-away'))
  await page.evaluate(() => {
    void window.midiEditorFixture.navigate('/midi-editor/new')
  })
  await page.getByRole('button', { name: '丢弃草稿', exact: true }).click()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).not.toHaveValue(
    '待丢弃的新建草稿'
  )
  expect(await page.evaluate(() => window.midiEditorFixture.draftKeys())).toEqual([songKey])
})

test('直接关闭时草稿写入失败则保留编辑器，重试可以恢复最新草稿', async ({ page }) => {
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('关闭写入失败仍保留')
  await page.evaluate(() => {
    window.midiEditorFixture.failDraft(true)
    void window.midiEditorFixture.navigate('/navigation-away')
  })
  await page.getByRole('button', { name: '直接关闭', exact: true }).click()
  await expect(page.getByText('草稿保存失败', { exact: true })).toBeVisible()
  await expect(name).toHaveValue('关闭写入失败仍保留')
  await page.evaluate(() => {
    window.midiEditorFixture.failDraft(false)
    void window.midiEditorFixture.navigate('/navigation-away')
  })
  await page.getByRole('button', { name: '直接关闭', exact: true }).click()
  await expect(page.locator('.navigation-away')).toBeVisible()
})

test('区域延长只产生一次撤销，历史按钮禁用状态清晰', async ({ page }) => {
  const undo = page.getByRole('button', { name: /^撤销/ })
  const redo = page.getByRole('button', { name: /^重做/ })
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  await expect(undo).toHaveCSS('opacity', '0.45')
  // 外侧把手不侵入音符区；新建项目右边界恰在视口外缘时先横向滚到曲尾留白。
  await page.locator('.detail-piano-roll .pr-scroll').evaluate((element) => {
    element.scrollLeft = element.scrollWidth - element.clientWidth
  })
  const handle = page.locator('.pr-region-resize').first()
  await expect(handle).toBeVisible()
  await expect
    .poll(() =>
      handle.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return document.elementFromPoint(rect.x + 6, rect.y + 10) === element
      })
    )
    .toBe(true)
  const original = Number(await handle.getAttribute('data-end-tick'))
  const rect = (await handle.boundingBox())!
  // 详情自动展开时会裁切总览行，抓取句柄顶部可见部分，不能使用被裁切的包围盒中心。
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 10)
  await page.mouse.down()
  await page.mouse.move(rect.x + 55, rect.y + 10, { steps: 8 })
  await expect(undo).toBeDisabled()
  await page.mouse.up()
  await expect(undo).toBeEnabled()
  await expect(undo).toHaveCSS('opacity', '1')
  const extended = Number(await handle.getAttribute('data-end-tick'))
  expect(extended).toBeGreaterThan(original)
  await undo.click()
  await expect(handle).toHaveAttribute('data-end-tick', String(original))
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(handle).toHaveAttribute('data-end-tick', String(extended))
})

test('节拍网格支持 1/64、1/128 和 1/256，选择后保持固定宽度', async ({ page }) => {
  await openSnapSettings(page)
  const select = page.locator('.toolbar-snap:visible')
  const width = await select.evaluate((element) => getComputedStyle(element).width)
  for (const resolution of ['1/64', '1/128', '1/256']) {
    await select.click()
    const option = page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: resolution })
    await option.scrollIntoViewIfNeeded()
    await option.click()
    await expect(select).toContainText(resolution)
    expect(await select.evaluate((element) => getComputedStyle(element).width)).toBe(width)
  }
})

test('详情放大后，1/256 网格实际绘制出比 1/16 更细的刻度', async ({ page }) => {
  const detail = page.locator('.detail-piano-editor')
  if (!(await detail.isVisible())) await page.locator('.pr-track-select').first().dblclick()
  await detail.getByRole('slider', { name: '时间缩放', exact: true }).press('End')
  await openSnapSettings(page)
  const select = page.locator('.toolbar-snap:visible')
  /** 标尺第 28 行没有文字，读取实际竖线的位置，覆盖 Vue 配置到 Canvas 的完整链路。 */
  const linePositions = () =>
    detail
      .locator('.pr-ruler-grid canvas')
      .first()
      .evaluate((element) => {
        const canvas = element as HTMLCanvasElement
        const dpr = canvas.width / canvas.getBoundingClientRect().width
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, Math.round(28 * dpr), canvas.width, 1).data
        const background = [...pixels.slice(8, 11)]
        const positions: number[] = []
        let previous = false
        for (let x = 0; x < canvas.width; x++) {
          const index = x * 4
          const line =
            pixels[index] !== background[0] ||
            pixels[index + 1] !== background[1] ||
            pixels[index + 2] !== background[2]
          if (line && !previous) positions.push(x / dpr)
          previous = line
        }
        return positions
      })
  await select.click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^1\/16$/ })
    .click()
  const coarse = (await linePositions()).length
  await select.click()
  const fineOption = page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^1\/256$/ })
  await fineOption.scrollIntoViewIfNeeded()
  await fineOption.click()
  await expect.poll(async () => (await linePositions()).length).toBeGreaterThan(coarse + 5)
  const positions = await linePositions()
  const gaps = positions.slice(2).map((x, i) => x - positions[i + 1]!)
  // 像素栅格允许一像素舍入差；不能出现原先 7/8 tick 交替形成的明显大小格。
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
})

test('已有曲子可缩短到音符内部，撤销恢复区域且不丢失原音符', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1')
  const handle = page.locator('.pr-region-resize').first()
  await expect(handle).toBeVisible()
  const original = Number(await handle.getAttribute('data-end-tick'))
  const rect = (await handle.boundingBox())!
  await page.mouse.move(rect.x + 6, rect.y + 10)
  await page.mouse.down()
  await page.mouse.move(rect.x - 90, rect.y + 10, { steps: 8 })
  const guide = page.locator('.detail-piano-roll .pr-drag-guide:visible')
  await expect(guide).toBeVisible()
  await expect(guide).toHaveAttribute('data-tick', (await handle.getAttribute('data-end-tick'))!)
  await expect(page.locator('.detail-piano-roll .pr-drag-position:visible')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('track-region-drag-preview.png') })
  await page.mouse.up()
  await expect(guide).toHaveCount(0)
  const shorter = Number(await handle.getAttribute('data-end-tick'))
  expect(shorter).toBeLessThan(original)
  const undo = page.getByRole('button', { name: /^撤销/ })
  await undo.click()
  await expect(handle).toHaveAttribute('data-end-tick', String(original))
  await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: /^重做/ }).click()
  await expect(handle).toHaveAttribute('data-end-tick', String(shorter))
})

test('直接拖动未选音符时，选区更新不会中断手势，落点提示与撤销正常', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&single=1')
  await page.locator('.pr-track-select').first().dblclick()
  const notes = page.locator('.detail-piano-editor .pr-notes')
  const notePoint = () =>
    notes.evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let minX = Infinity,
        minY = Infinity,
        maxX = 0,
        maxY = 0
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4
          if (data[i] !== 227 || data[i + 1] !== 111 || data[i + 2] !== 134) continue
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      const rect = canvas.getBoundingClientRect()
      return {
        x: rect.x + (((minX + maxX) / 2) * rect.width) / canvas.width,
        y: rect.y + (((minY + maxY) / 2) * rect.height) / canvas.height,
      }
    })
  await expect.poll(async () => Number.isFinite((await notePoint()).x)).toBe(true)
  const point = await notePoint()
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await expect(page.locator('.note-inspector')).toBeVisible()
  await page.mouse.move(point.x + 50, point.y, { steps: 6 })
  await expect(page.locator('.detail-piano-editor .pr-drag-guide:visible')).toBeVisible()
  const undo = page.getByRole('button', { name: /^撤销/ })
  await expect(undo).toBeDisabled()
  await page.mouse.up()
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(undo).toBeDisabled()
})

test('更新安装前等待真实 MIDI 页面保存草稿', async ({ page }) => {
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('安装前的编辑草稿')
  await name.blur()
  const result = await page.evaluate(() => window.midiEditorFixture.runUpdate())
  expect(result.installs).toBe(1)
  expect(result.drafts.at(-1)?.name).toBe('安装前的编辑草稿')
  await expect(page.locator('.midi-editor-page')).toHaveAttribute('inert', '')
})

test('更新草稿保存失败后仍能编辑，重试安装保存最新内容', async ({ page }) => {
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('第一次保存')
  await name.blur()
  await page.evaluate(() => window.midiEditorFixture.failDraft(true))
  const failed = await page.evaluate(() => window.midiEditorFixture.runUpdate())
  expect(failed.installs).toBe(0)
  expect(failed.phase).toBe('ready')
  await expect(page.locator('.midi-editor-page')).not.toHaveAttribute('inert', '')
  await name.fill('失败后继续修改')
  await name.blur()
  await page.evaluate(() => window.midiEditorFixture.failDraft(false))
  const retried = await page.evaluate(() => window.midiEditorFixture.runUpdate())
  expect(retried.installs).toBe(1)
  expect(retried.drafts.at(-1)?.name).toBe('失败后继续修改')
})

test('主窗口导航离开后，更新仍保存独立编辑窗口的草稿', async ({ page }) => {
  const opening = page.waitForEvent('popup')
  await page
    .getByRole('region', { name: '音轨总览', exact: true })
    .getByRole('button', { name: '在独立窗口中打开', exact: true })
    .click()
  const popup = await opening
  const name = popup.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('独立窗口的最新修改')
  await name.blur()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '独立窗口的最新修改'
  )
  await page.evaluate(() => window.midiEditorFixture.navigate('/navigation-away'))
  const result = await page.evaluate(() => window.midiEditorFixture.runUpdate())
  expect(result.installs).toBe(1)
  expect(result.drafts.at(-1)?.name).toBe('独立窗口的最新修改')
  await expect(popup.locator('.detached-midi-editor')).toHaveAttribute('inert', '')
})

test('编辑操作合并到单层标题栏，次要操作通过悬浮菜单收纳', async ({ page }) => {
  await expect(page.locator('.midi-editor-header > .editor-toolbar')).toBeVisible()
  await expect(page.locator('.midi-editor-page > .editor-toolbar')).toHaveCount(0)
  await expect(page.locator('.editor-project-actions').getByRole('button')).toHaveCount(2)
  await expect
    .poll(() =>
      page
        .locator('.midi-editor-name input, input.midi-editor-name')
        .evaluate((element) => element.getBoundingClientRect().width)
    )
    .toBeLessThanOrEqual(240)

  const save = page.getByRole('button', { name: '保存', exact: true })
  await expect(save).toHaveText('')
  await save.hover()
  await expect(page.getByRole('tooltip').filter({ hasText: '保存' })).toBeVisible()

  await page.getByRole('button', { name: '更多操作', exact: true }).hover()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveText(['导出 .mid', '帮助', '保存并关闭', '关闭'])
  await expect(menu.getByRole('menuitem', { name: '关闭', exact: true })).toHaveClass(
    /ant-btn-dangerous/
  )
  await expect
    .poll(() => page.locator('.ant-popover:visible').evaluate((element) => element.clientWidth))
    .toBeLessThan(160)
  await menu.getByRole('menuitem', { name: '帮助', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'MIDI 编辑器帮助', exact: true })
  await expect(help).toBeVisible()
  await expect(page.locator('.editor-more-menu:visible')).toHaveCount(0)
  await expect(help.getByRole('heading', { name: '快速开始', exact: true })).toBeVisible()
  await expect(help.getByText('双击音轨，打开编辑详情', { exact: true })).toHaveCSS(
    'color',
    'rgb(239, 68, 68)'
  )
  await page.screenshot({ path: test.info().outputPath('midi-editor-help.png') })
  await expect(help.getByRole('heading', { name: '音符编辑', exact: true })).toBeVisible()
  await expect(help.getByRole('heading', { name: '音轨管理', exact: true })).toBeVisible()
  await expect(help).toContainText('延长与缩短音轨区域')
  await expect(help).toContainText('在总览或下方音符详情中')
  await expect(help).toContainText('Esc 取消本次拖拽')
  await expect(help).toContainText('边界吸附与位置预览')
  await expect(help).toContainText('选择按小节吸附可对齐小节边界')
  await expect(help.getByText(/Mac 开启“三指拖移”后请从把手开始/)).toBeVisible()
  await expect(help.getByRole('heading', { name: '试听与循环', exact: true })).toBeVisible()
  await expect(help.getByRole('heading', { name: '吸附与显示', exact: true })).toBeVisible()
  await expect(help.getByRole('heading', { name: '保存与导出', exact: true })).toBeVisible()
  await expect(help.getByRole('heading', { name: '键盘快捷键', exact: true })).toBeVisible()
  await expect(help.getByText('Command/Ctrl + S', { exact: true })).toBeVisible()
  await expect(help.getByText('Option / Alt', { exact: true })).toBeVisible()
  const helpContents = help.getByRole('navigation', { name: '帮助目录', exact: true })
  const helpScroller = help.locator('.midi-editor-help-content')
  await expect(helpContents).toBeVisible()
  await helpContents.getByRole('link', { name: '键盘快捷键', exact: true }).click()
  await expect
    .poll(() => helpScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100)
  await help.getByRole('button', { name: '知道了', exact: true }).click()
  await expect(help).toBeHidden()
})

test('首次保存并关闭会先保存工程，再直接离开编辑器', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('保存并关闭测试项目')
  await name.blur()
  await openEditorMoreActions(page)
  await page.getByRole('menuitem', { name: '保存并关闭', exact: true }).click()

  await expect(page.getByText('项目已保存', { exact: true })).toBeVisible()
  await expect(page.getByText('有未保存的项目改动', { exact: true })).toHaveCount(0)
  await expect(page.locator('.global-music-player')).toBeVisible()
})

test('从详情导入的新项目在离开确认中保存后继续原目标导航', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?source')
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('详情导入修改')
  await name.blur()
  // 不等待导航完成，否则测试自身也会卡在离开确认上。
  await page.evaluate(() => {
    void window.midiEditorFixture.navigate('/navigation-away')
  })
  await page.getByRole('dialog').getByRole('button', { name: '保存并关闭', exact: true }).click()
  await expect(page.locator('.navigation-away')).toBeVisible()
  await expect(page.getByText('项目已保存', { exact: true })).toBeVisible()
})

test('隐藏空音轨后新增会解除筛选并显示新音轨', async ({ page }) => {
  const tracks = page.locator('.pr-track')
  // 新建项目有一条空轨；先等待初始绘制，再等待筛选生效，避免读取上一帧数量。
  await expect(tracks).toHaveCount(1)
  const before = await tracks.count()
  const filter = page.getByRole('button', { name: '隐藏没有音符的音轨', exact: true })
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
  await expect(tracks).toHaveCount(0)
  await page.getByRole('button', { name: '新增音轨', exact: true }).click()
  await expect(filter).toHaveAttribute('aria-pressed', 'false')
  await expect(tracks).toHaveCount(before + 1)
})

test('工具提示可移入、选中文字并复制，音轨把手不展示提示', async ({ page }) => {
  await openSnapSettings(page)
  await page.locator('.snap-settings .property-help-icon').hover()
  const tooltip = page
    .locator('.ant-tooltip:visible')
    .filter({ hasText: '设置添加、移动和拉伸音符时' })
  await expect(tooltip).toBeVisible()
  await tooltip.hover()
  await page.waitForTimeout(250)
  await expect(tooltip).toBeVisible()
  expect(
    await tooltip
      .locator('.ant-tooltip-container')
      .evaluate((el) => getComputedStyle(el).userSelect)
  ).toBe('text')
  await tooltip.locator('.ant-tooltip-container').evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const recordCopy = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'c') return
      document.body.dataset.copyIntercepted = String(event.defaultPrevented)
      window.removeEventListener('keydown', recordCopy)
    }
    window.addEventListener('keydown', recordCopy)
  })
  await page.keyboard.press('ControlOrMeta+c')
  await expect(page.locator('body')).toHaveAttribute('data-copy-intercepted', 'false')
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  await page.keyboard.press('Escape')
  const handle = page.locator('.track-drag-handle').first()
  await handle.hover()
  await expect(page.getByRole('tooltip').filter({ hasText: '拖动排序' })).toHaveCount(0)
  expect(
    await page
      .locator('.pr-track')
      .first()
      .evaluate((el) => getComputedStyle(el).cursor)
  ).toBe('default')
  expect(await handle.evaluate((el) => getComputedStyle(el).cursor)).toBe('grab')
})

test('音轨菜单可打开详情、选择预设和自定义颜色，属性栏跟随详情与选区', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1')
  await expect(page.locator('.note-inspector')).toHaveCount(0)
  const menuButton = page.locator('.track-actions-button').first()
  await menuButton.click()
  await expect(page.getByRole('menuitem').first()).toContainText('编辑音轨')
  const editIcon = await page
    .getByRole('menuitem', { name: '编辑音轨', exact: true })
    .locator('svg')
    .getAttribute('class')
  const renameIcon = await page
    .getByRole('menuitem', { name: '重命名音轨', exact: true })
    .locator('svg')
    .getAttribute('class')
  expect(editIcon).not.toBe(renameIcon)
  await page.getByRole('menuitem', { name: '编辑音轨', exact: true }).click()
  await expect(page.locator('.detail-piano-editor')).toBeVisible()
  await expect(page.locator('.note-inspector')).toHaveCount(0)
  await page.locator('.detail-piano-editor .pr-scroll').click({ position: { x: 150, y: 130 } })
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.locator('.note-inspector')).toBeVisible()
  await page.getByRole('button', { name: '关闭钢琴卷帘', exact: true }).click()
  await expect(page.locator('.note-inspector')).toHaveCount(0)
  await menuButton.click()
  await page.getByRole('menuitem', { name: '音轨颜色', exact: true }).click()
  const picker = page.locator('.ant-color-picker:visible')
  await expect(picker).toBeVisible()
  await expect(picker.getByText('预设颜色', { exact: true })).toBeVisible()
  await picker.locator('.ant-color-picker-presets-color').nth(1).click()
  await expect(picker.locator('.ant-color-picker-presets-color').nth(1)).toHaveClass(
    /color-checked/
  )
  await expect(page.getByRole('button', { name: /撤销/ })).toBeEnabled()
  await page.screenshot({ path: test.info().outputPath('track-color-picker.png') })
  await page.mouse.click(500, 90)
  await menuButton.click()
  const swatch = page
    .getByRole('menuitem', { name: '音轨颜色', exact: true })
    .locator('span[style*="background"]')
  await expect(swatch).toHaveAttribute('style', /91, 155, 213|#5b9bd5/i)
  await page.getByRole('menuitem', { name: '音轨颜色', exact: true }).click()
  const hex = picker.locator('.ant-color-picker-hex-input input')
  await hex.fill('123456')
  await hex.press('Enter')
  await page.mouse.click(500, 90)
  await menuButton.click()
  await expect(swatch).toHaveAttribute('style', /18, 52, 86|#123456/)
  await page.screenshot({ path: test.info().outputPath('track-menu.png') })
})

test('音轨缺省颜色一致，自定义颜色同时呈现在菜单、总览区域与详情，支持撤销重做', async ({
  page,
}) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&colors=1')
  const menus = page.locator('.track-actions-button')
  await expect(menus).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    await menus.nth(index).click()
    await expect(
      page
        .getByRole('menuitem', { name: '音轨颜色', exact: true })
        .locator('span[style*="background"]')
    ).toHaveCSS('background-color', 'rgb(227, 111, 134)')
    await page.mouse.click(700, 90)
    await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
  }
  await page.locator('.pr-track-select').first().dblclick()
  await expect
    .poll(() => noteColorPixels(page, '.detail-piano-editor', [227, 111, 134]))
    .toBeGreaterThan(20)
  await page.getByRole('button', { name: '关闭钢琴卷帘', exact: true }).click()
  for (const [index, hex] of [
    [0, '5b9bd5'],
    [1, '6cbf84'],
  ] as const) {
    await menus.nth(index).click()
    await page.getByRole('menuitem', { name: '音轨颜色', exact: true }).click()
    const input = page.locator('.ant-color-picker:visible .ant-color-picker-hex-input input')
    await input.fill(hex)
    await input.press('Enter')
    await page.mouse.click(700, 90)
    await expect(page.locator('.ant-color-picker:visible')).toHaveCount(0)
    await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0)
  }
  for (const rgb of [
    [91, 155, 213],
    [108, 191, 132],
    [227, 111, 134],
  ]) {
    await expect.poll(() => noteColorPixels(page, '.detail-piano-roll', rgb)).toBeGreaterThan(20)
  }
  const regions = await page
    .locator('.detail-piano-roll .pr-pane > canvas')
    .first()
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      const handles = [...canvas.parentElement!.querySelectorAll('.pr-region-resize')]
      // 工作区现在有曲尾留白，按每轨右边界定位区域内部，不能固定取整幅 Canvas 的 90%。
      return [0, 1, 2].map((index) => [
        ...canvas
          .getContext('2d')!
          .getImageData(
            Math.max(
              0,
              Math.floor(
                ((handles[index]!.getBoundingClientRect().left - rect.left - 20) * canvas.width) /
                  rect.width
              )
            ),
            Math.floor((canvas.height * (index + 0.5)) / 3),
            1,
            1
          ).data,
      ])
    })
  expect(regions[0]![2]).toBeGreaterThan(regions[0]![0]!)
  expect(regions[1]![1]).toBeGreaterThan(regions[1]![0]!)
  expect(regions[2]![0]).toBeGreaterThan(regions[2]![1]!)
  await page.screenshot({ path: test.info().outputPath('track-colors-overview.png') })
  await page.locator('.pr-track-select').first().dblclick()
  await expect
    .poll(() => noteColorPixels(page, '.detail-piano-editor', [91, 155, 213]))
    .toBeGreaterThan(20)
  await menus.first().click()
  await expect(
    page
      .getByRole('menuitem', { name: '音轨颜色', exact: true })
      .locator('span[style*="background"]')
  ).toHaveCSS('background-color', 'rgb(91, 155, 213)')
  await page.keyboard.press('Escape')
  await page.locator('.pr-track-select').nth(1).click()
  await expect
    .poll(() => noteColorPixels(page, '.detail-piano-editor', [108, 191, 132]))
    .toBeGreaterThan(20)
  await page.getByRole('button', { name: /撤销/ }).click()
  await expect.poll(() => noteColorPixels(page, '.detail-piano-roll', [108, 191, 132])).toBe(0)
  await expect
    .poll(() => noteColorPixels(page, '.detail-piano-editor', [227, 111, 134]))
    .toBeGreaterThan(20)
  await page.getByRole('button', { name: /重做/ }).click()
  await expect
    .poll(() => noteColorPixels(page, '.detail-piano-editor', [108, 191, 132]))
    .toBeGreaterThan(20)
})

test('首次引导介绍音轨编辑与排序，完成后再次进入不重复展示', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('nikki:midi-editor-tour-seen'))
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&tour=1')
  const tour = page.locator('.ant-tour:visible')
  await expect(tour).toContainText('从音轨总览开始')
  await expect(page.locator('.ant-tour-mask mask rect[fill="black"]')).toHaveCount(1)
  await page.screenshot({ path: test.info().outputPath('midi-editor-tour.png') })
  await tour.getByRole('button', { name: '下一步' }).click()
  await expect(tour).toContainText('双击音轨，打开编辑详情')
  await tour.getByRole('button', { name: '下一步' }).click()
  await expect(tour).toContainText('拖动把手，调整音轨顺序')
  const spotlight = page.locator('.ant-tour-mask mask rect[fill="black"]')
  await expect(spotlight).toHaveCount(1)
  await expect(spotlight).toHaveAttribute('width', '34')
  await expect(spotlight).toHaveAttribute('height', '40')
  await page.screenshot({ path: test.info().outputPath('midi-editor-tour-sort.png') })
  await tour.getByRole('button', { name: '下一步' }).click()
  await expect(tour).toContainText('编辑、试听并保存')
  await tour.getByRole('button', { name: '结束导览' }).click()
  await expect(tour).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.editor-toolbar')).toBeVisible()
  await expect(tour).toHaveCount(0)
})

test('吸附设置将总开关、小节模式和节拍选项分开表达', async ({ page }) => {
  await openSnapSettings(page)
  const enabled = page.getByRole('switch', { name: '启用吸附', exact: true })
  const snapToBar = page.getByRole('checkbox', { name: '按小节吸附', exact: true })
  const resolution = page.locator('.toolbar-snap:visible')

  await expect(enabled).toBeChecked()
  await expect(snapToBar).not.toBeChecked()
  await expect(resolution).not.toHaveClass(/ant-select-disabled/)

  await snapToBar.click()
  await expect(snapToBar).toBeChecked()
  await expect(resolution).toHaveClass(/ant-select-disabled/)
  await snapToBar.click()
  await expect(snapToBar).not.toBeChecked()
  await expect(resolution).not.toHaveClass(/ant-select-disabled/)

  await resolution.click()
  const popup = page.locator('.ant-select-dropdown:visible')
  await expect(popup).toBeVisible()
  await expect(popup.locator('.ant-select-item-option')).toHaveCount(9)
  await expect(popup.getByText('关闭', { exact: true })).toHaveCount(0)
  await expect(popup.getByText('小节', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await enabled.click()
  await expect(enabled).not.toBeChecked()
  await expect(snapToBar).toHaveCount(0)
  await expect(resolution).toHaveCount(0)
  await enabled.click()
  await expect(enabled).toBeChecked()
  await expect(page.getByRole('checkbox', { name: '按小节吸附', exact: true })).not.toBeChecked()
  await expect(page.locator('.toolbar-snap:visible')).not.toHaveClass(/ant-select-disabled/)
})

test('映射模板复用虚拟键盘选择器，切换后立即更新不可演奏提示', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1')

  const trigger = page.getByRole('button', { name: '映射模板', exact: true })
  await expect(trigger).toHaveText('')
  await openTemplateSettings(page)
  const templateSelect = page.locator('.editor-template-select:visible')
  await expect(templateSelect).toContainText('钢琴常用键')

  await page.getByRole('switch', { name: '按模板试听', exact: true }).click()
  await page.locator('.detail-piano-roll .pr-scroll').dblclick({ position: { x: 200, y: 150 } })
  await page.locator('.detail-piano-editor .pr-scroll').click({ position: { x: 150, y: 130 } })
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.getByText('20 个音符不可演奏', { exact: true })).toBeVisible()

  await openTemplateSettings(page)
  await page.locator('.editor-template-select:visible').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '高音演奏键' })
    .click()
  await expect(page.getByText('24 个音符不可演奏', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /撤销/ })).toBeDisabled()
})

test('音轨信息区可长按排序，拖拽把手可立即排序，并且每次只产生一次可撤销操作', async ({ page }) => {
  const overview = page.locator('.detail-piano-roll')
  const addTrack = page.getByRole('button', { name: '新增音轨', exact: true })
  await addTrack.click()
  await addTrack.click()
  await expect(overview.locator('.pr-track')).toHaveCount(3)

  // 新增轨道会打开详情；关闭后给总览留出稳定的拖拽空间。
  await page.getByRole('button', { name: '关闭钢琴卷帘', exact: true }).click()
  await expect(page.locator('.detail-piano-editor')).toHaveCount(0)
  await expect
    .poll(() =>
      overview
        .locator('.pr-track')
        .first()
        .evaluate((row) => row.getBoundingClientRect().height)
    )
    .toBeGreaterThan(100)

  const visualOrder = () =>
    overview.locator('.pr-track').evaluateAll((rows) =>
      rows
        .map((row) => ({
          id: (row as HTMLElement).dataset.trackId ?? '',
          top: row.getBoundingClientRect().top,
        }))
        .sort((a, b) => a.top - b.top)
        .map((row) => row.id)
    )
  const initialOrder = await visualOrder()
  const source = overview.locator(`.pr-track[data-track-id="${initialOrder[0]}"] .pr-track-select`)
  const target = overview.locator(`.pr-track[data-track-id="${initialOrder[2]}"]`)
  const sourceBox = await source.boundingBox()
  expect(sourceBox).not.toBeNull()

  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(320)
  await expect(overview.locator('.midi-track-drag-ghost')).toBeVisible()
  const targetBox = await target.boundingBox()
  expect(targetBox).not.toBeNull()
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height * 0.8,
    {
      steps: 5,
    }
  )
  await expect(overview.locator('.midi-track-drop-indicator')).toBeVisible()
  await page.mouse.up()

  await expect(overview.locator('.midi-track-drag-ghost')).toHaveCount(0)
  await expect.poll(visualOrder).toEqual([initialOrder[1], initialOrder[2], initialOrder[0]])

  await page.getByRole('button', { name: /撤销/ }).click()
  await expect.poll(visualOrder).toEqual(initialOrder)

  const handle = overview
    .locator(`.pr-track[data-track-id="${initialOrder[0]}"]`)
    .getByRole('button', { name: /拖动排序/ })
  const handleBox = await handle.boundingBox()
  expect(handleBox).not.toBeNull()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height * 0.8,
    { steps: 5 }
  )
  await page.mouse.up()
  await expect.poll(visualOrder).toEqual([initialOrder[1], initialOrder[2], initialOrder[0]])

  await page.getByRole('button', { name: /撤销/ }).click()
  await expect.poll(visualOrder).toEqual(initialOrder)
})

test('拍号下拉可以点击、滚动，并将更改写入编辑会话', async ({ page }) => {
  await openSettings(page)
  const numerator = page.locator('.toolbar-meter').first()
  await expect.poll(() => numerator.evaluate((el) => el.getBoundingClientRect().width)).toBe(80)
  const initialWidth = await numerator.evaluate((el) => el.getBoundingClientRect().width)
  await openSettings(page)
  await numerator.click()
  const popup = page.locator('.ant-select-dropdown:visible')
  await expect(page.locator('.midi-editor-page [title]:not([title=""])')).toHaveCount(0)
  await expect(popup.locator('[title]:not([title=""])')).toHaveCount(0)
  await popup.locator('.ant-select-item-option').filter({ hasText: /^3$/ }).click({ timeout: 3000 })
  await expect(numerator).toContainText('3')
  await page.getByRole('button', { name: /撤销/ }).click()
  await expect(numerator).toContainText('4')
  await openSettings(page)
  await numerator.click()
  await popup.hover()
  await page.mouse.wheel(0, 500)
  await expect(popup.locator('.ant-select-item-option').filter({ hasText: /^16$/ })).toBeVisible()
  const sixteen = popup.locator('.ant-select-item-option').filter({ hasText: /^16$/ })
  expect(
    await sixteen
      .locator('.ant-select-item-option-content')
      .evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
  await sixteen.click()
  await expect(numerator).toContainText('16')
  expect(await numerator.evaluate((el) => el.getBoundingClientRect().width)).toBe(initialWidth)
  expect(initialWidth).toBe(80)
  await page.locator('.toolbar-meter').nth(1).click()
  await popup.locator('.ant-select-item-option').filter({ hasText: /^8$/ }).click()
  await expect(page.locator('.toolbar-meter').nth(1)).toContainText('8')
  await openSnapSettings(page)
  await page.locator('.toolbar-snap').click()
  await expect(popup.locator('.ant-select-item-option').first()).toContainText('1/1')
  await popup
    .locator('.ant-select-item-option')
    .filter({ hasText: /^1\/8$/ })
    .click()
  await expect(page.locator('.toolbar-snap')).toContainText('1/8')
})

test('编辑页使用与播放详情一致的独立窗口入口，退出后恢复全局播放条', async ({ page }) => {
  await expect(page.locator('.global-music-player')).toBeAttached()
  await expect(page.locator('.global-music-player')).toBeHidden()
  await expect(page.getByRole('button', { name: '全屏编辑', exact: true })).toHaveCount(0)
  const detach = page
    .getByRole('region', { name: '音轨总览', exact: true })
    .getByRole('button', { name: '在独立窗口中打开', exact: true })
  await expect(detach).toBeVisible()

  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  const originalName = await name.inputValue()
  await name.fill('独立窗口测试项目')
  await name.blur()
  await expect(name).toHaveValue('独立窗口测试项目')
  await openSettings(page)
  await page.locator('.toolbar-meter').first().click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^3$/ })
    .click()
  await expect(name).toHaveValue('独立窗口测试项目')
  await expect(page.locator('.toolbar-meter').first()).toContainText('3')
  await page.getByRole('button', { name: /撤销/ }).click()
  // 项目名称不进入音符历史，恢复名称后直接退出无改动项目。
  await name.fill(originalName)
  await name.blur()
  await expect(page.getByRole('button', { name: /撤销/ })).toBeDisabled()
  await openEditorMoreActions(page)
  await page.getByRole('menuitem', { name: '关闭', exact: true }).click()
  await expect(page.locator('.global-music-player')).toBeVisible()
})

test('独立编辑窗口复用沉浸式标题栏，并在还原时保留编辑状态', async ({ page }) => {
  const opening = page.waitForEvent('popup')
  await page
    .getByRole('region', { name: '音轨总览', exact: true })
    .getByRole('button', { name: '在独立窗口中打开', exact: true })
    .click()
  const popup = await opening

  await expect(popup.locator('.window-title-bar')).toHaveCount(1)
  await expect(popup.locator('.midi-editor-header')).toHaveCount(0)
  await expect(popup.locator('.window-title-bar .editor-toolbar')).toBeVisible()
  await expect(page.getByText('此项目正在独立窗口中编辑', { exact: true })).toBeVisible()
  await expect(popup.locator('.detached-error')).toHaveCount(0)

  const name = popup.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('独立窗口中的项目名')
  await name.blur()
  await expect(name).toHaveValue('独立窗口中的项目名')

  await popup.getByRole('button', { name: '映射模板', exact: true }).click()
  const templateSelect = popup.locator('.editor-template-select:visible')
  await expect(templateSelect).toContainText('钢琴常用键')
  await expect(templateSelect).toHaveClass(/ant-select-disabled/)
  await popup.getByRole('switch', { name: '按模板试听', exact: true }).click()
  await expect(templateSelect).not.toHaveClass(/ant-select-disabled/)
  await templateSelect.click()
  await popup
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '高音演奏键' })
    .click()
  await expect(templateSelect).toContainText('高音演奏键')
  await expect(popup.getByRole('switch', { name: '按模板试听', exact: true })).toBeChecked()

  await page.getByRole('button', { name: '还原到主窗口', exact: true }).click()
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(page.locator('.editor-toolbar')).toBeVisible()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '独立窗口中的项目名'
  )
  await expect(page.locator('.editor-window-error')).toHaveCount(0)
  await openTemplateSettings(page)
  await expect(page.getByRole('switch', { name: '按模板试听', exact: true })).toBeChecked()
  await expect(page.locator('.editor-template-select:visible')).toContainText('高音演奏键')
})

test('主窗口离开编辑页并切歌后，还原独立窗口仍恢复原编辑会话', async ({ page }) => {
  const opening = page.waitForEvent('popup')
  await page
    .getByRole('region', { name: '音轨总览', exact: true })
    .getByRole('button', { name: '在独立窗口中打开', exact: true })
    .click()
  const popup = await opening
  const detachedName = popup.locator('.midi-editor-name input, input.midi-editor-name')
  await detachedName.fill('切换播放后仍保留的项目')
  await detachedName.blur()

  await page.evaluate(() => window.midiEditorFixture.navigate('/navigation-away'))
  await page.evaluate(() => window.midiEditorFixture.switchMainWindowSong())
  await expect(page.getByText('此项目正在独立窗口中编辑', { exact: true })).toBeVisible()
  await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()

  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(page.locator('.editor-toolbar')).toBeVisible()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '切换播放后仍保留的项目'
  )
  await expect(page.locator('.editor-window-error')).toHaveCount(0)
})

test('从歌曲进入的独立编辑窗口还原时保留来源，草稿仍保存到该歌曲', async ({ page }) => {
  await page.evaluate(() => {
    window.midiEditorFixture.setSongs(['A.mid', 'B.mid'])
    return window.midiEditorFixture.navigate('/midi-editor/new?from=A.mid')
  })
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue('A')
  const overview = page.locator('.detail-piano-roll')
  await overview.getByRole('slider', { name: '时间缩放', exact: true }).press('End')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const popup = await opening
  const name = popup.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('A 独立窗口改编')
  await name.blur()
  await page.evaluate(() => window.midiEditorFixture.navigate('/navigation-away'))
  await popup.getByRole('button', { name: '还原到主窗口', exact: true }).click()
  await expect.poll(() => popup.isClosed()).toBe(true)
  expect(await page.evaluate(() => window.midiEditorFixture.currentRoute())).toBe(
    '/midi-editor/new?from=A.mid'
  )
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    'A 独立窗口改编'
  )
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.draftKeys()))
    .toEqual([expect.stringMatching(/^source-/)])
  await page.evaluate(() => {
    void window.midiEditorFixture.navigate('/midi-editor/new?from=B.mid')
  })
  await page.getByRole('button', { name: '直接关闭', exact: true }).click()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue('B')
  await expect(overview.getByRole('slider', { name: '时间缩放', exact: true })).not.toHaveAttribute(
    'aria-valuenow',
    '100'
  )
})

test('歌曲管理默认按添加时间倒序，图标切换正序并与搜索一致', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await expect(page.locator('.song-title').first()).toHaveText('导航测试歌曲 80')
  const sort = page.getByRole('button', { name: '按添加时间排序：最新在前', exact: true })
  await sort.hover()
  await expect(page.getByRole('tooltip')).toHaveText('按添加时间排序：最新在前')
  await sort.click()
  await expect(page.locator('.song-title').first()).toHaveText('导航测试歌曲 01')
  await page.getByPlaceholder('搜索歌曲', { exact: true }).fill('导航测试歌曲 7')
  await expect(page.locator('.song-title').first()).toHaveText('导航测试歌曲 70')
  await page.getByRole('button', { name: '按添加时间排序：最早在前', exact: true }).click()
  await expect(page.locator('.song-title').first()).toHaveText('导航测试歌曲 79')
})

test('歌曲列表进入详情再返回时保留原滚动位置', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  const songList = page.locator('.song-scroll')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await songList.evaluate((element) => {
    element.scrollTop = 1800
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => songList.evaluate((element) => element.scrollTop)).toBeGreaterThan(1500)
  const backToTop = page.getByRole('button', { name: '返回顶部', exact: true })
  await expect(backToTop).toBeVisible()
  const floatingSize = await backToTop.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(floatingSize).toEqual({ width: 30, height: 30 })
  const scrollTop = await songList.evaluate((element) => element.scrollTop)
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/midi/navigation-40.mid'))
  await page.getByRole('button', { name: '返回歌曲列表', exact: true }).click()

  await expect(songList).toBeVisible()
  await expect
    .poll(() => songList.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollTop - 2)
})

test('MIDI 工程列表进入编辑页再返回时保留搜索条件', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?list=1')
  const search = page.getByPlaceholder('搜索项目名称', { exact: true })
  await search.fill('Counting Stars')
  await expect(page.locator('.project-table-row')).toHaveCount(1)

  await page.evaluate(() => window.midiEditorFixture.navigate('/navigation-away'))
  await page.evaluate(() => window.midiEditorFixture.navigate('/midi-editor'))

  await expect(search).toHaveValue('Counting Stars')
  await expect(page.locator('.project-table-row')).toHaveCount(1)
})

test('从栏目重新进入列表使用全新实例，从编辑页返回恢复原实例', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?list=1')
  const search = page.getByPlaceholder('搜索项目名称', { exact: true })
  await search.fill('Counting Stars')
  await expect(page.locator('.project-table-row')).toHaveCount(1)

  await page.evaluate(() => window.midiEditorFixture.navigate('/navigation-away'))
  await page.getByRole('button', { name: 'MIDI 编辑', exact: true }).click()

  await expect(page.getByPlaceholder('搜索项目名称', { exact: true })).toHaveCount(1)
  await expect(search).toHaveValue('')
  await search.fill('MIDI 工程 20')
  await expect(page.locator('.project-table-row')).toHaveCount(1)

  await page.evaluate(() => window.midiEditorFixture.navigate('/midi-editor/project-20'))
  await page.evaluate(() => window.midiEditorFixture.back())

  await expect(page.getByPlaceholder('搜索项目名称', { exact: true })).toHaveCount(1)
  await expect(search).toHaveValue('MIDI 工程 20')
  await expect(page.locator('.project-table-row')).toHaveCount(1)
})

test('歌单歌曲列表进入详情再返回时保留原滚动位置', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?playlist=1')
  const songList = page.locator('.song-scroll')
  const search = page.getByPlaceholder('搜索歌曲', { exact: true })
  await search.fill('导航测试歌曲')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await songList.evaluate((element) => {
    element.scrollTop = 1800
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => songList.evaluate((element) => element.scrollTop)).toBeGreaterThan(1500)
  const scrollTop = await songList.evaluate((element) => element.scrollTop)
  await page.evaluate(() => {
    ;(window as Window & { playlistScrollElement?: Element | null }).playlistScrollElement =
      document.querySelector('.song-scroll')
  })

  await page.evaluate(() => window.midiEditorFixture.navigate('/files/midi/navigation-40.mid'))
  await page.getByRole('button', { name: '返回歌曲列表', exact: true }).click()

  await expect(songList).toBeVisible()
  await expect(search).toHaveValue('导航测试歌曲')
  expect(
    await page.evaluate(
      () =>
        (window as Window & { playlistScrollElement?: Element | null }).playlistScrollElement ===
        document.querySelector('.song-scroll')
    )
  ).toBe(true)
  await expect
    .poll(() => songList.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollTop - 2)
})

test('模板列表进入编辑页再返回时保留搜索条件和选择', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?templates=1')
  const search = page.getByPlaceholder('搜索模板名称', { exact: true })
  await search.fill('演奏模板 23')
  const row = page.locator('.template-table-row')
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(row).toHaveClass(/template-row-selected/)

  await page.evaluate(() => window.midiEditorFixture.navigate('/templates/template-23/edit'))
  await page.getByRole('button', { name: '返回上一列表', exact: true }).click()

  await expect(search).toHaveValue('演奏模板 23')
  await expect(row).toHaveCount(1)
  await expect(row).toHaveClass(/template-row-selected/)
})

test('在线曲库进入详情再返回时保留筛选与滚动位置', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?online=1')
  const viewport = page.locator('.online-library .virtual-scroll')
  const search = page.getByPlaceholder('搜索曲名、作者、标签', { exact: true })
  await search.fill('验收作者')
  await expect(page.locator('.online-library .song-card').first()).toBeVisible()
  await viewport.evaluate((element) => {
    element.scrollTop = 1800
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(1500)
  const scrollTop = await viewport.evaluate((element) => element.scrollTop)

  await page.evaluate(() => window.midiEditorFixture.navigate('/online-library/song/online-20'))
  await page.getByRole('button', { name: '返回上一列表', exact: true }).click()

  await expect(search).toHaveValue('验收作者')
  await expect(viewport).toBeVisible()
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollTop - 2)
})

test('未保存项目退出时只确认一次', async ({ page }) => {
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('待退出项目')
  await name.blur()

  await openEditorMoreActions(page)
  await page.getByRole('menuitem', { name: '关闭', exact: true }).click()
  await expect(page.getByText('有未保存的项目改动', { exact: true })).toBeVisible()
  await expect(page.getByText('有未保存的项目改动', { exact: true })).toHaveCount(1)

  await page.getByRole('button', { name: '直接关闭', exact: true }).click()
  await expect(page.locator('.editor-toolbar')).toBeHidden()
  await expect(page.getByText('有未保存的项目改动', { exact: true })).toHaveCount(0)
})

test('MIDI 项目列表的更多按钮和整行右键共用操作菜单', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?list=1')
  const row = page.locator('.project-table-row').first()
  await expect(row).toContainText('Counting Stars · Piano study')

  await row.click({ button: 'right', position: { x: 180, y: 24 } })
  await expect(page.getByText('添加到播放器', { exact: true })).toBeVisible()
  const addTo = page.getByText('添加到', { exact: true })
  await addTo.hover()
  const songListMenuItem = page.getByRole('menuitem', { name: '常用歌单', exact: true })
  await expect(songListMenuItem).toBeVisible()
  await songListMenuItem.click()
  await expect(page.getByText('已添加到歌单', { exact: true })).toBeVisible()

  await row.getByRole('button', { name: '更多操作', exact: true }).click()
  const visibleMenu = page.locator('.ant-dropdown:visible')
  await expect(visibleMenu.getByText('导出 .mid', { exact: true }).last()).toBeVisible()
  await expect(visibleMenu.getByText('添加到播放器', { exact: true }).last()).toBeVisible()
})

for (const width of [900, 1100, 1440]) {
  test(`布局在 ${width}px 下不溢出，属性栏按可用宽度自然换行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/tests/browser/midi-editor-page.html?populated=1')
    await page.locator('.detail-piano-roll .pr-scroll').dblclick({ position: { x: 200, y: 150 } })
    await page.locator('.detail-piano-editor .pr-scroll').click({ position: { x: 150, y: 130 } })
    await page.keyboard.press('ControlOrMeta+a')
    await expect(page.locator('.inspector-count')).toContainText('32')
    await expect(page.getByRole('button', { name: '详细', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '简约', exact: true })).toHaveCount(0)
    for (const selector of ['.midi-editor-header', '.editor-toolbar', '.note-inspector']) {
      expect(await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true
      )
    }
    await openSnapSettings(page)
    await page.locator('.toolbar-snap').click()
    const popup = page.locator('.ant-select-dropdown:visible')
    await expect(popup).toBeVisible()
    await expect.poll(() => popup.evaluate((el) => el.getBoundingClientRect().width)).toBe(148)
    await popup.hover()
    await page.mouse.wheel(0, 500)
    await popup
      .locator('.ant-select-item-option')
      .filter({ hasText: /^1\/16t$/ })
      .click()
    await expect(page.locator('.toolbar-snap')).toContainText('1/16t')
    expect(
      await page.locator('.toolbar-snap').evaluate((el) => el.getBoundingClientRect().width)
    ).toBe(100)
    await expect(page.getByRole('button', { name: '添加到播放器', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '更多操作', exact: true }).hover()
    await expect(page.getByRole('menuitem', { name: '导出 .mid', exact: true })).toBeVisible()
  })
}

test('力度显示与模板试听各归其位，切换不进入编辑历史', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&single=1')
  await openSettings(page)
  const velocityLane = page.getByRole('switch', { name: '力度条', exact: true })
  await expect(velocityLane).not.toBeChecked()
  await expect(page.locator('#midi-song-settings').getByRole('switch')).toHaveCount(1)
  await velocityLane.click()
  await expect(velocityLane).toBeChecked()
  await openTemplateSettings(page)
  const templatePreview = page
    .locator('#midi-template-settings')
    .getByRole('switch', { name: '按模板试听', exact: true })
  const templateSelect = page.locator('.editor-template-select:visible')
  await expect(templatePreview).not.toBeChecked()
  await expect(templateSelect).toHaveClass(/ant-select-disabled/)
  await expect(templateSelect.getByRole('combobox')).toBeDisabled()
  const switchBounds = await templatePreview.boundingBox()
  const selectBounds = await templateSelect.boundingBox()
  expect(switchBounds!.y + switchBounds!.height).toBeLessThan(selectBounds!.y)
  await templateSelect.click({ force: true })
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await templatePreview.click()
  await expect(templatePreview).toBeChecked()
  await expect(templateSelect).not.toHaveClass(/ant-select-disabled/)
  await expect(templateSelect.getByRole('combobox')).toBeEnabled()
  const panel = page.locator('#midi-template-settings')
  const description = '按当前模板试听可演奏音符，并将模板外音符置灰，便于检查演奏效果。'
  await expect(panel).not.toContainText(description)
  const help = panel.getByRole('button', { name: '按模板试听说明', exact: true })
  const title = panel.locator('.toolbar-label-with-help')
  await expect(title).toContainText('按模板试听')
  await expect(title.getByRole('button')).toHaveCount(1)
  await help.hover()
  const tooltip = page.locator('.ant-tooltip:visible').filter({ hasText: description })
  await expect(tooltip).toBeVisible()
  await tooltip.hover()
  await expect(tooltip).toBeVisible()
  expect(
    await tooltip
      .locator('.ant-tooltip-container')
      .evaluate((el) => getComputedStyle(el).userSelect)
  ).toBe('text')
  await help.focus()
  await expect(tooltip).toBeVisible()
  // 说明入口独立于开关，点击查看帮助不应改变试听状态。
  await help.click()
  await expect(templatePreview).toBeChecked()
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('template-preview-popover.png') })
  await templatePreview.click()
  await expect(templatePreview).not.toBeChecked()
  await expect(templateSelect).toHaveClass(/ant-select-disabled/)
  await expect(templateSelect.getByRole('combobox')).toBeDisabled()
  await expect(templateSelect).toContainText('钢琴常用键')
  await page.screenshot({
    path: testInfo.outputPath('template-preview-disabled.png'),
    animations: 'disabled',
  })
  await templatePreview.click()
  await expect(templateSelect).not.toHaveClass(/ant-select-disabled/)
  await expect(templateSelect).toContainText('钢琴常用键')
  await expect(page.getByRole('button', { name: /撤销/ })).toBeDisabled()
})

test('窄窗口中单音符属性完整显示，力度通过悬浮纵向滑杆编辑', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 })
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&single=1')
  await page.locator('.detail-piano-roll .pr-scroll').dblclick({ position: { x: 100, y: 150 } })
  await page.locator('.detail-piano-editor .pr-scroll').click({ position: { x: 150, y: 130 } })
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.locator('.inspector-count')).toContainText('1')
  await expect(page.getByRole('spinbutton', { name: '音高', exact: true })).toHaveValue('60')
  await expect(page.getByRole('spinbutton', { name: '长度', exact: true })).toHaveValue('0.375')
  expect(
    await page.locator('.note-inspector').evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
  await expect(page.getByRole('button', { name: /撤销/ })).toBeDisabled()
  await page.getByRole('button', { name: '力度', exact: true }).hover()
  await expect(page.locator('.velocity-popover')).toBeVisible()
  await expect(page.locator('.velocity-popover .ant-slider-vertical')).toBeVisible()
  await expect(page.getByRole('button', { name: /量化起点/, exact: true })).toHaveClass(
    /ant-btn-variant-outlined/
  )
  await expect(page.getByRole('button', { name: /-八度/, exact: true })).toHaveClass(
    /ant-btn-variant-outlined/
  )
  await page.locator('.inspector-action-group').first().locator('.property-help-icon').hover()
  await expect(
    page.getByRole('tooltip').filter({ hasText: '起点会对齐当前吸附网格' })
  ).toBeVisible()
})
