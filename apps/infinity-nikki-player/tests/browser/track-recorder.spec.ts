import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** 在真实框架弹层中打开独立录制会话，宿主仅模拟平台边界。 */
async function openRecorder(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/tests/browser/track-recorder.html${query}`)
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).toBeEnabled()
  await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -1)).toBe(0)
  return dialog
}

async function chooseMode(
  page: Page,
  dialog: Locator,
  mode: string,
  keepOpen = false
): Promise<Locator> {
  const popup = await openPanel(page, dialog, '录制方式')
  await popup.locator('.ant-select[aria-label="录制方式"]').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: mode })
    .click()
  if (!keepOpen) await closePanel(page)
  return popup
}

/** 通过真实悬停打开设置，避免同时使用点击和悬停造成弹层锁定。 */
async function openPanel(page: Page, dialog: Locator, name: string): Promise<Locator> {
  const trigger = dialog.getByRole('button', { name, exact: true })
  await trigger.hover()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const popup = page.locator('.ant-popover:visible')
  await expect(popup).toHaveCount(1)
  return popup
}

async function closePanel(page: Page): Promise<void> {
  await page.mouse.move(4, 48)
  await page.mouse.click(4, 48)
  await expect(page.locator('.ant-popover:visible')).toHaveCount(0)
}

async function waitHelpReady(help: Locator): Promise<void> {
  await expect(help).toBeVisible()
  await expect
    .poll(() =>
      help.evaluate(
        (element) =>
          element.getAnimations().filter((animation) => animation.playState === 'running').length
      )
    )
    .toBe(0)
}

async function recordKey(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key)
  await page.waitForTimeout(80)
  await page.keyboard.up(key)
}

test('独立工作区首键录制、停止后应用以及一次撤销', async ({ page }) => {
  const dialog = await openRecorder(page)
  await expect(dialog.getByText('按下第一个映射键开始')).not.toBeVisible()
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await expect(dialog.getByText('按下第一个映射键开始')).toBeVisible()
  await page.keyboard.down('a')
  await page.waitForTimeout(150)
  await page.keyboard.up('a')
  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('0')
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('1')
  await page.getByRole('button', { name: '主项目撤销' }).click()
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('0')
})

test('取消隔离、输入控件不录音、窄窗口保持键盘可读', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 650 })
  const dialog = await openRecorder(page)
  const applyBounds = await dialog
    .getByRole('button', { name: '应用到音轨', exact: true })
    .boundingBox()
  expect(applyBounds!.y + applyBounds!.height).toBeLessThanOrEqual(650)
  const key = dialog.locator('.key.clickable').first()
  expect(
    await key.locator('.pitch-label').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  ).toBeGreaterThanOrEqual(12)
  const template = await openPanel(page, dialog, '键位映射')
  await template.getByRole('combobox').focus()
  await page.keyboard.press('a')
  await page.keyboard.press('Escape')
  await closePanel(page)
  await expect(dialog.getByRole('button', { name: '应用到音轨', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await page.keyboard.down('a')
  await page.waitForTimeout(80)
  await page.keyboard.up('a')
  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('0')
})

test('首键后失焦暂停，映射的 Tab 与 Space 可录制且不触发页面导航', async ({ page }) => {
  const dialog = await openRecorder(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await page.keyboard.down('Tab')
  await page.waitForTimeout(80)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('Tab')
  await expect(dialog.getByRole('button', { name: '继续录制', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '继续录制', exact: true }).click()
  await page.keyboard.down('Space')
  await page.waitForTimeout(80)
  await page.keyboard.up('Space')
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('2')
  expect(
    await page.evaluate(() =>
      window.recorderFixture
        .hostNotes()
        .map((note) => note.pitch)
        .sort()
    )
  ).toEqual([60, 62])
})

test('恢复独立录制草稿；应用后删除失败只重试清理且不再次提交', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => window.recorderFixture.seedDraft(false))
  await page.getByRole('button', { name: '键盘录制' }).click()
  const dialog = page.getByRole('dialog').first()
  await dialog.getByRole('button', { name: '继续录制草稿', exact: true }).click()
  await page.evaluate(() => window.recorderFixture.failDelete(true))
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('disk-delete')
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('1')
  await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).not.toBeEnabled()
  await page.evaluate(() => window.recorderFixture.failDelete(false))
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => window.recorderFixture.applyCount())).toBe(1)
})

test('放弃期间不再排入周期草稿，慢保存完成后不会复活已删除的草稿', async ({ page }) => {
  const dialog = await openRecorder(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await page.keyboard.down('a')
  await page.waitForTimeout(80)
  await page.keyboard.up('a')
  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await page.evaluate(() => window.recorderFixture.deferDrafts(true))
  await expect.poll(() => page.evaluate(() => window.recorderFixture.pendingDrafts())).toBe(1)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.waitForTimeout(1100)
  await page.evaluate(() => window.recorderFixture.finishDraft())
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => window.recorderFixture.pendingDrafts())).toBe(0)
  expect(await page.evaluate(() => window.recorderFixture.draftCount())).toBe(0)
})

test('暂停追加后改重录选段不会使用新录制方式提交旧音符', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => window.recorderFixture.seedExisting())
  await page.getByRole('button', { name: '键盘录制' }).click()
  const dialog = page.getByRole('dialog').first()
  await chooseMode(page, dialog, '重录选段')
  await openPanel(page, dialog, '录制方式')
  await expect(page.getByRole('spinbutton', { name: '起始小节', exact: true })).toHaveValue('1')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).fill('2')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).blur()
  await closePanel(page)
  await chooseMode(page, dialog, '接着录')
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await page.keyboard.down('a')
  await page.waitForTimeout(80)
  await page.keyboard.up('a')
  await dialog.getByRole('button', { name: '暂停录制', exact: true }).click()
  await chooseMode(page, dialog, '重录选段')
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(page.locator('[data-testid="host-note-count"]')).toHaveText('2')
  expect(
    await page.evaluate(() =>
      window.recorderFixture
        .hostNotes()
        .map((note) => note.pitch)
        .sort()
    )
  ).toEqual([60, 61])
})

test('鼠标按住后移出映射键立即释放，不等到鼠标抬起', async ({ page }) => {
  const dialog = await openRecorder(page)
  const key = dialog.locator('.key.clickable').first()
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await key.hover()
  const box = (await key.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(key).toHaveClass(/active/)
  await page.mouse.move(box.x + box.width + 80, box.y + box.height + 40)
  await expect(key).not.toHaveClass(/active/)
  await page.mouse.up()
})

test('重录小节范围决定首键位置，区间外既有音符保持原样', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => window.recorderFixture.seedExisting())
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await chooseMode(page, dialog, '重录选段')
  await openPanel(page, dialog, '录制方式')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).fill('3')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).blur()
  await page.getByRole('spinbutton', { name: '起始小节', exact: true }).fill('2')
  await page.getByRole('spinbutton', { name: '起始小节', exact: true }).blur()
  await closePanel(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'a')
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  const notes = await page.evaluate(() => window.recorderFixture.hostNotes())
  expect(notes.find((note) => note.pitch === 60)).toEqual({ pitch: 60, startTick: 0, endTick: 480 })
  const recorded = notes.find((note) => note.pitch === 61)!
  expect(recorded.startTick).toBeGreaterThanOrEqual(1920)
  expect(recorded.endTick).toBeLessThan(3840)
})

test('宿主半小节选区在重录时按设置展示的整小节替换，接着录不显示旧范围', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => {
    window.recorderFixture.seedExisting()
    window.recorderFixture.seedPartialSelection()
  })
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog.getByText(/^重录小节：/)).toHaveCount(0)
  await chooseMode(page, dialog, '重录选段')
  await openPanel(page, dialog, '录制方式')
  await expect(page.getByRole('spinbutton', { name: '起始小节', exact: true })).toHaveValue('1')
  await expect(page.getByRole('spinbutton', { name: '结束小节', exact: true })).toHaveValue('2')
  await closePanel(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'a')
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  const notes = await page.evaluate(() => window.recorderFixture.hostNotes())
  expect(notes.map((note) => note.pitch)).toEqual([61])
  expect(notes[0]!.startTick).toBeLessThan(240)
})

for (const viewport of [
  { width: 640, height: 500 },
  { width: 720, height: 500 },
  { width: 760, height: 650 },
  { width: 1440, height: 900 },
]) {
  test(`内容区抽屉铺满窗口且仅内容滚动：${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    const dialog = await openRecorder(page, '?main')
    await expect(page.getByTestId('host-menu')).toBeVisible()
    await expect
      .poll(async () => {
        const bounds = await dialog.boundingBox()
        return bounds ? Math.round(bounds.width) : 0
      })
      .toBe(viewport.width)
    await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -1)).toBe(0)
    const bounds = (await dialog.boundingBox())!
    expect(Math.round(bounds.x)).toBe(0)
    expect(Math.round(bounds.y)).toBe(46)
    expect(Math.round(bounds.height)).toBe(viewport.height - 46)

    const controls = [
      dialog.getByRole('button', { name: '开始录制', exact: true }),
      dialog.getByRole('button', { name: '停止录制', exact: true }),
      dialog.getByRole('button', { name: '试听', exact: true }),
      dialog.getByRole('button', { name: '回到开头', exact: true }),
      dialog.getByRole('button', { name: /^撤销/ }),
      dialog.getByRole('button', { name: /^重做/ }),
      dialog.getByRole('button', { name: '键位映射', exact: true }),
      dialog.getByRole('button', { name: '录制方式', exact: true }),
      dialog.getByRole('button', { name: '录制帮助', exact: true }),
      dialog.getByRole('button', { name: '取消', exact: true }),
      dialog.getByRole('button', { name: '应用到音轨', exact: true }),
    ]
    for (const control of controls) {
      await expect(control).toBeVisible()
      const rect = (await control.boundingBox())!
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width)
      expect(rect.y).toBeGreaterThanOrEqual(46)
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height)
    }
    await expect(dialog.locator('.ant-drawer-header .ant-select')).toHaveCount(0)
    await expect(dialog.locator('.ant-drawer-body .recorder-transport')).toHaveCount(0)
    await expect(dialog.locator('.ant-drawer-header .recorder-transport')).toHaveCount(1)
    await expect(dialog.locator('.recorder-transport .recorder-settings')).toHaveCount(1)
    const settings = (await dialog.locator('.recorder-settings').boundingBox())!
    const header = (await dialog.locator('.ant-drawer-header').boundingBox())!
    const transport = (await dialog.locator('.recorder-transport').boundingBox())!
    expect(settings.y).toBeGreaterThanOrEqual(header.y)
    expect(settings.y + settings.height).toBeLessThanOrEqual(header.y + header.height)
    expect(transport.y).toBeGreaterThanOrEqual(header.y)
    expect(transport.y + transport.height).toBeLessThanOrEqual(header.y + header.height)
    await expect(dialog.locator('.recorder-settings button')).toHaveCount(2)
    const centers = await dialog.locator('.ant-drawer-header button').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return rect.y + rect.height / 2
      })
    )
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(4)
    const transportControls = dialog.locator('.recorder-transport button')
    await expect(transportControls).toHaveCount(8)
    await expect(transportControls.nth(0)).toHaveText('开始录制')
    for (const [index, name] of [
      '停止录制',
      '试听',
      '回到开头',
      /^撤销 \(/,
      /^重做 \(/,
      '键位映射',
      '录制方式',
    ].entries()) {
      await expect(transportControls.nth(index + 1)).toHaveAttribute('aria-label', name)
    }
    await expect(transportControls.nth(7).locator('.lucide-wrench-icon')).toHaveCount(1)
    await expect(transportControls.nth(7).locator('.lucide-list-music-icon')).toHaveCount(0)
    const gaps = await transportControls.evaluateAll((elements) => {
      const rects = elements.map((element) => element.getBoundingClientRect())
      return rects.slice(1).map((rect, index) => rect.x - rects[index]!.right)
    })
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(0)
      expect(gap).toBeLessThanOrEqual(8)
    }
    expect(gaps[5]).toBeCloseTo(gaps[4]!, 1)
    expect(gaps[6]).toBeCloseTo(gaps[4]!, 1)
    const status = (await dialog.locator('.recorder-transport [role="status"]').boundingBox())!
    expect(settings.x + settings.width).toBeLessThanOrEqual(status.x)
    const rows = await transportControls.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().y))
    )
    expect(new Set(rows).size).toBe(1)
    for (let index = 1; index < (await transportControls.count()); index++) {
      await expect(transportControls.nth(index)).toHaveText('')
    }
    await expect(
      dialog.getByText('点击键盘后按映射键演奏，按住决定音符时长。', { exact: true })
    ).toHaveCount(0)
    await expect(dialog.getByText('应用后回到 MIDI 编辑器继续完善。', { exact: true })).toHaveCount(
      0
    )
    await expect(dialog.locator('.note-inspector')).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: /选择音符|添加音符|量化|重录选中片段/ })
    ).toHaveCount(0)
    await expect(dialog.getByRole('combobox', { name: '编辑网格', exact: true })).toHaveCount(0)

    const scroller = dialog.locator('.recorder-content-scroll')
    await expect(scroller).toBeVisible()
    expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    )
    const apply = dialog.getByRole('button', { name: '应用到音轨', exact: true })
    const start = dialog.getByRole('button', { name: '开始录制', exact: true })
    const before = { apply: (await apply.boundingBox())!.y, start: (await start.boundingBox())!.y }
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    if (viewport.height === 500) {
      expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    }
    expect((await apply.boundingBox())!.y).toBeCloseTo(before.apply, 1)
    expect((await start.boundingBox())!.y).toBeCloseTo(before.start, 1)
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath(`recorder-${viewport.width}x${viewport.height}.png`),
    })
    await start.click()
    await expect(dialog.getByText('按下第一个映射键开始', { exact: true })).toBeVisible()
    async function expectStateFitsHeader(): Promise<void> {
      const title = (await dialog.locator('.recorder-track-name').boundingBox())!
      expect(title.width).toBeGreaterThan(0)
      const helpBounds = (await dialog
        .getByRole('button', { name: '录制帮助', exact: true })
        .boundingBox())!
      const closeBounds = (await dialog
        .getByRole('button', { name: '关闭', exact: true })
        .boundingBox())!
      expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(closeBounds.x)
      expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(viewport.width)
      const stateCenters = await dialog
        .locator('.ant-drawer-header button')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect()
            return rect.y + rect.height / 2
          })
        )
      expect(Math.max(...stateCenters) - Math.min(...stateCenters)).toBeLessThanOrEqual(4)
    }
    await expectStateFitsHeader()
    await recordKey(page, 'a')
    await expect(dialog.locator('.recorder-transport [role="status"]')).toHaveText('正在录制')
    await expectStateFitsHeader()
    await dialog.getByRole('button', { name: '暂停录制', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '继续录制', exact: true })).toBeVisible()
    await expectStateFitsHeader()
    await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).toBeVisible()
    await expectStateFitsHeader()
  })
}

test('录制快捷键优先于映射 Enter，键盘焦点内支持撤销重做且不误录 Z', async ({ page }) => {
  const dialog = await openRecorder(page)
  const keyboard = dialog.locator('[aria-label="演奏键盘"]')
  await keyboard.focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog.getByText('按下第一个映射键开始')).toBeVisible()
  await recordKey(page, 'Enter')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog.getByRole('button', { name: '继续录制', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog.getByText('按下第一个映射键开始')).toBeVisible()
  await recordKey(page, 'Space')
  await page.keyboard.press('Escape')
  await expect(dialog.getByRole('button', { name: /^撤销/ })).toBeEnabled()
  await keyboard.focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(dialog.getByRole('button', { name: /^重做/ })).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(dialog.getByRole('button', { name: /^重做/ })).toBeDisabled()
  expect(await page.evaluate(() => window.recorderFixture.playedPitches())).toEqual([63, 60])
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(page.getByTestId('host-note-count')).toHaveText('2')
})

test('录制方式与重录数字输入保持原生键盘交互，不触发录制快捷键或映射发音', async ({ page }) => {
  const dialog = await openRecorder(page)
  await chooseMode(page, dialog, '重录选段')
  await openPanel(page, dialog, '录制方式')
  const start = page.getByRole('spinbutton', { name: '起始小节', exact: true })
  await start.focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.press('a')
  await page.keyboard.press('Space')
  await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.recorderFixture.playedPitches())).toEqual([])
  await closePanel(page)
  const popup = await openPanel(page, dialog, '录制方式')
  await popup.locator('[aria-label="录制方式"] input[role="combobox"]').focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.press('a')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => window.recorderFixture.playedPitches())).toEqual([])
})

test('第二次录入和撤销后试听更新真实调度音高，失焦暂停试听', async ({ page }) => {
  const dialog = await openRecorder(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'a')
  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await dialog.getByRole('button', { name: '回到开头', exact: true }).click()
  await dialog.getByRole('button', { name: '试听', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewPitches()))
    .toContain(61)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewState()?.isPlaying))
    .toBe(false)

  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 's')
  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await dialog.getByRole('button', { name: '回到开头', exact: true }).click()
  await page.evaluate(() => window.recorderFixture.clearPreviewPitches())
  await dialog.getByRole('button', { name: '试听', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewPitches()))
    .toContain(108)
  expect(await page.evaluate(() => window.recorderFixture.previewPitches())).toContain(61)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))

  await dialog.getByRole('button', { name: /^撤销/ }).click()
  await dialog.getByRole('button', { name: '回到开头', exact: true }).click()
  await page.evaluate(() => window.recorderFixture.clearPreviewPitches())
  await dialog.getByRole('button', { name: '试听', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewPitches()))
    .toContain(61)
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => window.recorderFixture.previewPitches())).not.toContain(108)
})

test('试听循环随重录小节范围更新，接着录取消旧循环且暂停保持位置', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => window.recorderFixture.seedExisting(5760))
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await chooseMode(page, dialog, '重录选段')
  await openPanel(page, dialog, '录制方式')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).fill('2')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).blur()
  await closePanel(page)
  await dialog.getByRole('button', { name: '试听', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewState()?.loop))
    .toEqual({ startSeconds: 0, endSeconds: 2 })
  await page.waitForTimeout(100)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  const paused = await page.evaluate(() => window.recorderFixture.previewState())
  expect(paused?.isPlaying).toBe(false)
  expect(paused?.positionSeconds).toBeGreaterThan(0)
  await page.waitForTimeout(100)
  expect((await page.evaluate(() => window.recorderFixture.previewState()))?.positionSeconds).toBe(
    paused!.positionSeconds
  )
  await openPanel(page, dialog, '录制方式')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).fill('3')
  await page.getByRole('spinbutton', { name: '结束小节', exact: true }).blur()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewState()?.loop))
    .toEqual({ startSeconds: 0, endSeconds: 4 })
  await closePanel(page)
  await chooseMode(page, dialog, '接着录')
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewState()?.loop))
    .toBe(null)
})

test('录制中锁定方式，首段暂停允许撤销整次录入并重做', async ({ page }) => {
  const dialog = await openRecorder(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'a')
  const popup = await openPanel(page, dialog, '录制方式')
  const mode = popup.locator('[aria-label="录制方式"] input[role="combobox"]')
  await expect(mode).toBeDisabled()
  await closePanel(page)
  await dialog.getByRole('button', { name: '暂停录制', exact: true }).click()
  await openPanel(page, dialog, '录制方式')
  await expect(mode).toBeEnabled()
  await closePanel(page)
  await expect(dialog.getByRole('button', { name: /^撤销/ })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: /^重做/ })).toBeDisabled()
  await dialog.getByRole('button', { name: /^撤销/ }).click()
  await expect(dialog.getByText(/\d+\.\d+ · 0 个音符/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^重做/ })).toBeEnabled()
  await dialog.getByRole('button', { name: /^重做/ }).click()
  await expect(dialog.getByText(/\d+\.\d+ · 1 个音符/)).toBeVisible()
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(page.getByTestId('host-note-count')).toHaveText('1')
})

test('已删除模板的录制草稿恢复后仍显示模板快照并可继续录入', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => window.recorderFixture.seedDraft(false, true))
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await dialog.getByRole('button', { name: '继续录制草稿', exact: true }).click()
  const template = await openPanel(page, dialog, '键位映射')
  await expect(template.getByText('已删除的录制模板', { exact: true })).toBeVisible()
  await template.getByRole('combobox').click()
  await expect(
    page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: '已删除的录制模板' })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await closePanel(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'a')
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  await expect(page.getByTestId('host-note-count')).toHaveText('2')
})

test('短窗口录制方式和帮助浮层完整可滚动，不被抽屉内容裁剪', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 500 })
  const dialog = await openRecorder(page, '?main')
  await chooseMode(page, dialog, '重录选段')
  const popup = await openPanel(page, dialog, '录制方式')
  await expect(popup).toHaveCount(1)
  await expect(popup.getByRole('spinbutton', { name: '起始小节', exact: true })).toBeVisible()
  const accompaniment = popup.getByRole('checkbox', { name: '播放伴奏', exact: true })
  await accompaniment.scrollIntoViewIfNeeded()
  const rect = (await accompaniment.boundingBox())!
  expect(rect.y).toBeGreaterThanOrEqual(46)
  expect(rect.y + rect.height).toBeLessThanOrEqual(500)
  expect(await popup.evaluate((element) => !!element.closest('#main-window-portal-root'))).toBe(
    true
  )
  await closePanel(page)
  await expect(popup).toHaveCount(0)
  await dialog.getByRole('button', { name: '录制帮助', exact: true }).click()
  const help = page.getByRole('dialog', { name: '录制帮助', exact: true })
  await waitHelpReady(help)
  await expect(help).toContainText('用键盘录下旋律与和弦')
  await help.getByRole('link', { name: '快捷键', exact: true }).click()
  const shortcuts = help.locator('#recorder-help-shortcuts-title')
  await expect
    .poll(async () => (await shortcuts.boundingBox())!.y + (await shortcuts.boundingBox())!.height)
    .toBeLessThanOrEqual(500)
  const helpRect = (await shortcuts.boundingBox())!
  expect(helpRect.y).toBeGreaterThanOrEqual(0)
  expect(helpRect.y + helpRect.height).toBeLessThanOrEqual(500)
  for (const control of [
    help.locator('.ant-modal-close'),
    help.getByRole('button', { name: '知道了', exact: true }),
  ]) {
    const bounds = (await control.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(500)
  }
  expect(
    await page
      .locator('.ant-modal-wrap:visible')
      .evaluate((element) => element.scrollHeight <= element.clientHeight)
  ).toBe(true)
})

test('录制工作区只展示当前轨，不把已有千音符伴奏作为全曲警告', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html')
  await page.evaluate(() => window.recorderFixture.seedOtherTrack())
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).toBeEnabled()
  await expect(dialog.getByText(/\d+\.\d+ · 0 个音符/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: /演奏检查/ })).toHaveCount(0)
  await expect(dialog.getByText(/1000|不可演奏|超出音域/)).toHaveCount(0)
  await expect(page.getByTestId('host-note-count')).toHaveText('1000')
})

test('分割条可扩大卷帘区域，键盘映射行保持完整布局', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const dialog = await openRecorder(page, '?main')
  const splitter = dialog.locator('.ant-splitter')
  const panels = splitter.locator(':scope > .ant-splitter-panel')
  await expect(panels).toHaveCount(2)
  const before = (await panels.nth(1).boundingBox())!
  const dragger = splitter.getByRole('separator')
  const rect = (await dragger.boundingBox())!
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 - 50, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () => (await panels.nth(1).boundingBox())!.height)
    .toBeGreaterThan(before.height + 35)
  expect((await panels.first().boundingBox())!.height).toBeGreaterThanOrEqual(119)
  await expect(dialog.locator('.keyboard-preview')).toHaveClass(/mapped-rows-only/)
  await expect(dialog.locator('.keyboard-row')).toHaveCount(4)
  await expect(dialog.locator('.key-label').filter({ hasText: /^F1$/ })).toHaveCount(0)
  await expect(dialog.locator('.key-label').filter({ hasText: /^1$/ })).toHaveCount(0)
  await expect(dialog.locator('.key-label').filter({ hasText: /^D$/ })).toBeVisible()
})

test('功能键和数字键映射显示对应整行，并通过真实键盘录入', async ({ page }) => {
  const dialog = await openRecorder(page)
  const template = await openPanel(page, dialog, '键位映射')
  await template.getByRole('combobox').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '功能和数字映射' })
    .click()
  await closePanel(page)
  await expect(dialog.locator('.keyboard-row')).toHaveCount(2)
  await expect(dialog.locator('.key-label').filter({ hasText: /^F1$/ })).toBeVisible()
  await expect(dialog.locator('.key-label').filter({ hasText: /^F12$/ })).toBeVisible()
  await expect(dialog.locator('.key-label').filter({ hasText: /^1$/ })).toBeVisible()
  await expect(dialog.locator('.key-label').filter({ hasText: /^9$/ })).toBeVisible()
  await expect(dialog.locator('.key-label').filter({ hasText: /^A$/ })).toHaveCount(0)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'F1')
  await recordKey(page, '1')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.recorderFixture.playedPitches())).toEqual([65, 67])
  await dialog.getByRole('button', { name: '应用到音轨', exact: true }).click()
  expect(
    await page.evaluate(() => window.recorderFixture.hostNotes().map((note) => note.pitch))
  ).toEqual([65, 67])
})

test('帮助目录独立滚动，暂停和释放声音，快捷键不操作背景且 Escape 只关帮助', async ({ page }) => {
  await page.goto('/tests/browser/track-recorder.html?main')
  await page.evaluate(() => window.recorderFixture.seedExisting(4800))
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await page.keyboard.down('a')
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.activeRecordingVoices()))
    .toBe(1)
  await page.waitForTimeout(100)
  await dialog.getByRole('button', { name: '录制帮助', exact: true }).click()
  await page.keyboard.up('a')
  const help = page.getByRole('dialog', { name: '录制帮助', exact: true })
  await waitHelpReady(help)
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.activeRecordingVoices()))
    .toBe(0)
  await expect(dialog.getByRole('button', { name: '继续录制', exact: true })).toBeVisible()
  const contents = help.locator('.section-document aside')
  const before = (await contents.boundingBox())!
  await help.getByRole('link', { name: '快捷键', exact: true }).click()
  const content = help.locator('.section-document-content')
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  const viewport = (await content.boundingBox())!
  await expect
    .poll(async () => (await help.locator('#recorder-help-shortcuts-title').boundingBox())!.y)
    .toBeLessThan(viewport.y + viewport.height)
  expect((await contents.boundingBox())!.y).toBe(before.y)
  expect(new URL(page.url()).hash).toBe('')
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('a')
  expect(await page.evaluate(() => window.recorderFixture.playedPitches())).toEqual([61])
  await expect(dialog.getByText(/\d+\.\d+ · 2 个音符/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: '继续录制', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).not.toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '继续录制', exact: true })).toBeVisible()

  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog.getByText('按下第一个映射键开始')).toBeVisible()
  await dialog.getByRole('button', { name: '暂停录制', exact: true }).click()

  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await dialog.getByRole('button', { name: '回到开头', exact: true }).click()
  await dialog.getByRole('button', { name: '试听', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewState()?.isPlaying))
    .toBe(true)
  await dialog.getByRole('button', { name: '录制帮助', exact: true }).click()
  await expect(help).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.recorderFixture.previewState()?.isPlaying))
    .toBe(false)
  expect(await page.evaluate(() => window.recorderFixture.previewActivePitches())).toEqual([])
  await page.keyboard.press('Escape')
  await expect(help).not.toBeVisible()
  await expect(dialog).toBeVisible()
})

test('退出确认 Escape 只取消退出，不重开确认、不提交也不丢录制', async ({ page }) => {
  const dialog = await openRecorder(page)
  await dialog.getByRole('button', { name: '开始录制', exact: true }).click()
  await recordKey(page, 'a')
  await dialog.getByRole('button', { name: '停止录制', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  const choice = page.getByRole('dialog', { name: '保留这次编曲？', exact: true })
  await waitHelpReady(choice)
  await page.keyboard.press('Escape')
  await expect(choice).not.toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '应用到音轨', exact: true })).toBeEnabled()
  await expect(dialog.getByText(/\d+\.\d+ · 1 个音符/)).toBeVisible()
  await expect(page.getByTestId('host-note-count')).toHaveText('0')
  expect(await page.evaluate(() => window.recorderFixture.applyCount())).toBe(0)
})

for (const name of ['键位映射', '录制方式']) {
  test(`${name}图标焦点中 Escape 只关浮层，关闭后再按 Escape 才离开工作区`, async ({ page }) => {
    const dialog = await openRecorder(page)
    const button = dialog.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.ant-popover:visible')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('.ant-popover:visible')).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })
}

test('长音轨名只展示名称，复用往返跑马灯与完整 Tooltip，不挤压单行操作', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 650 })
  await page.goto('/tests/browser/track-recorder.html?main')
  const name = '为这段旋律保留一个很长很长的音轨名称，回到编辑器后仍然可以继续完善与编排。'.repeat(
    4
  )
  await page.evaluate((value) => window.recorderFixture.renameTrack(value), name)
  await page.getByRole('button', { name: '键盘录制', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -1)).toBe(0)
  const title = dialog.locator('.ant-drawer-header .marquee-text')
  await expect(title).toHaveClass(/is-overflowing/)
  await expect(title.locator('.marquee-text__content')).toHaveText(name)
  await expect(dialog.getByText(/^键盘录制 ·/)).toHaveCount(0)
  const frames = await title.locator('.marquee-text__content').evaluate((element) => {
    const animation = element.getAnimations()[0]
    const effect = animation?.effect
    return {
      name: getComputedStyle(element).animationName,
      iterations: effect?.getTiming().iterations,
      transforms:
        effect instanceof KeyframeEffect
          ? effect.getKeyframes().map((frame) => String(frame.transform))
          : [],
    }
  })
  expect(frames.name).toContain('marquee-text-ping-pong')
  expect(frames.iterations).toBe(Infinity)
  expect(frames.transforms.some((transform) => transform.includes('-'))).toBe(true)
  expect(frames.transforms.at(-1)).toBe(frames.transforms[0])
  const bounds = (await title.boundingBox())!
  const transport = (await dialog.locator('.recorder-transport').boundingBox())!
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(transport.x)
  await title.hover()
  await expect(page.getByRole('tooltip')).toHaveText(name)
  expect(
    await title
      .locator('.marquee-text__content')
      .evaluate((element) => getComputedStyle(element).animationPlayState)
  ).toBe('paused')
  for (const control of await dialog.locator('.ant-drawer-header button').all()) {
    const rect = (await control.boundingBox())!
    expect(rect.x + rect.width).toBeLessThanOrEqual(760)
  }
})

test('同一录制方式浮层即时切换范围，重录出现小节设置、接着录立即隐藏', async ({ page }) => {
  const dialog = await openRecorder(page)
  const popup = await chooseMode(page, dialog, '重录选段', true)
  const button = dialog.getByRole('button', { name: '录制方式', exact: true })
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(popup.getByRole('spinbutton', { name: '起始小节', exact: true })).toBeVisible()
  await expect(popup.getByRole('spinbutton', { name: '结束小节', exact: true })).toBeVisible()
  await expect(
    popup.getByRole('button', { name: '替换设定的小节范围，到结束小节自动停止。', exact: true })
  ).toBeVisible()
  for (const name of ['一小节倒数', '节拍器', '播放伴奏']) {
    await expect(popup.getByRole('checkbox', { name, exact: true })).toBeVisible()
  }
  const metronome = popup.getByRole('checkbox', { name: '节拍器', exact: true })
  await metronome.check()
  await expect(metronome).toBeChecked()
  await popup.locator('.ant-select[aria-label="录制方式"]').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '接着录' })
    .click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(popup.getByRole('spinbutton', { name: '起始小节', exact: true })).toHaveCount(0)
  await expect(popup.getByRole('spinbutton', { name: '结束小节', exact: true })).toHaveCount(0)
  await expect(
    popup.getByRole('button', { name: '从最后一个音符末尾继续录入。', exact: true })
  ).toBeVisible()
  await expect(metronome).toBeChecked()
  await metronome.uncheck()
  await expect(metronome).not.toBeChecked()
  await expect(popup.getByRole('checkbox', { name: '播放伴奏', exact: true })).toBeVisible()
  await closePanel(page)
  await expect(dialog.getByRole('button', { name: '更多设置', exact: true })).toHaveCount(0)
})

test('设置浮层内说明按钮持有焦点时 Escape 只关闭当前浮层', async ({ page }) => {
  for (const name of ['键位映射', '录制方式']) {
    const dialog = await openRecorder(page)
    await dialog.getByRole('button', { name, exact: true }).click()
    const popup = page.locator('.ant-popover:visible')
    await expect(popup).toHaveCount(1)
    const hint = popup.getByRole('button').first()
    await hint.focus()
    await expect(hint).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '开始录制', exact: true })).toBeEnabled()
  }
})
