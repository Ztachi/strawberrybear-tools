import { test, expect } from '@playwright/test'

test('独立窗口录制按钮排在编辑工具后面，录制标题避开 macOS 系统按钮', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const child = await opening
  const record = child.getByRole('button', { name: '键盘录制', exact: true })
  const toolbar = child.locator('.editor-toolbar')
  await expect(toolbar).toBeVisible()
  const order = await record.evaluate(
    (button) =>
      !!(
        button.compareDocumentPosition(document.querySelector('.editor-toolbar')!) &
        Node.DOCUMENT_POSITION_PRECEDING
      )
  )
  expect(order).toBe(true)
  await record.click()
  await expect(child.locator('.recorder-track-name')).toBeVisible()
  expect((await child.locator('.recorder-track-name').boundingBox())!.x).toBeGreaterThanOrEqual(90)
})

test('设置分类包含关闭行为、语言和关于，倍速范围与标记符合要求', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(settings.getByRole('radio', { name: '最小化到系统托盘', exact: true })).toBeChecked()
  await expect(settings.getByRole('combobox', { name: '显示语言', exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('settings-general.png'),
    animations: 'disabled',
  })
  await settings.getByRole('menuitem', { name: '关于', exact: true }).click()
  await expect(settings).toContainText('更新日志')
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  const speed = page.getByRole('button', { name: '倍速播放', exact: true }).first()
  await expect(speed).toHaveText('1.0x')
  await speed.click()
  const slider = page.getByRole('slider', { name: '倍速播放', exact: true })
  await expect(slider).toHaveAttribute('aria-valuemin', '0.5')
  await expect(slider).toHaveAttribute('aria-valuemax', '3')
  await slider.press('End')
  await expect(speed).toHaveText('3.0x')
  await slider.press('ArrowLeft')
  await expect(speed).toHaveText('2.9x')
  for (const mark of ['0.5x', '1.0x', '1.5x', '2.0x', '2.5x', '3.0x'])
    await expect(
      page.locator('.playback-speed-popover .ant-slider-mark').getByText(mark, { exact: true })
    ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('playback-speed.png'), animations: 'disabled' })
  await page
    .locator('.playback-speed-popover .ant-slider-mark')
    .getByText('1.5x', { exact: true })
    .click()
  await expect(speed).toHaveText('1.5x')
  await page.getByRole('button', { name: '恢复原速', exact: true }).click()
  await expect(speed).toHaveText('1.0x')
})

test('窄窗口设置可切换英文，分类与倍速控件仍可操作', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 540, height: 640 })
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('combobox', { name: '显示语言', exact: true }).click()
  // Select 的虚拟列表另有隐藏的 option 节点；用真实键盘交互选择下一项。
  await page.getByRole('combobox', { name: '显示语言', exact: true }).press('ArrowDown')
  await page.getByRole('combobox', { name: '显示语言', exact: true }).press('Enter')
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(
    settings.getByRole('radio', { name: 'Minimize to system tray', exact: true })
  ).toBeChecked()
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.closeState().settings.locale))
    .toBe('en-US')
  const firstCategory = (await settings
    .getByRole('menuitem', { name: 'General', exact: true })
    .boundingBox())!
  const lastCategory = (await settings
    .getByRole('menuitem', { name: 'About', exact: true })
    .boundingBox())!
  expect(Math.abs(firstCategory.y - lastCategory.y)).toBeLessThan(2)
  await settings.getByRole('menuitem', { name: 'Playback', exact: true }).click()
  await expect(settings).toContainText('Game frame rate')
  await page.screenshot({
    path: testInfo.outputPath('settings-narrow-en.png'),
    animations: 'disabled',
  })
  const bounds = (await settings.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(540)
  await settings.getByRole('menuitem', { name: 'About', exact: true }).click()
  await expect(settings).toContainText('Release Notes')
})

test('首次关闭可以取消，记住托盘后直接隐藏，在设置中改为退出即可退出', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.evaluate(() => window.midiEditorFixture.requestClose())
  const close = page.getByRole('dialog', { name: '关闭窗口', exact: true })
  await expect(close.getByRole('radio', { name: '最小化到系统托盘', exact: true })).toBeChecked()
  await close.getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(() => window.midiEditorFixture.closeState())).hides).toBe(0)
  await page.evaluate(() => window.midiEditorFixture.requestClose())
  await close.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.midiEditorFixture.closeState().hides)).toBe(1)
  await page.evaluate(() => window.midiEditorFixture.requestClose())
  await expect.poll(() => page.evaluate(() => window.midiEditorFixture.closeState().hides)).toBe(2)
  await expect(close).not.toBeVisible()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('radio', { name: '退出应用', exact: true }).check()
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.closeState().settings.close_action))
    .toBe('quit')
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  await page.evaluate(() => window.midiEditorFixture.requestClose())
  await expect.poll(() => page.evaluate(() => window.midiEditorFixture.closeState().quits)).toBe(1)
})

test('明确退出仍检查未保存的 MIDI 工程，取消编辑确认不会退出', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  await page.locator('.midi-editor-name input, input.midi-editor-name').fill('退出保护测试')
  await page.locator('.midi-editor-name input, input.midi-editor-name').blur()
  await page.evaluate(() => window.midiEditorFixture.requestClose('quit'))
  const guard = page.getByRole('dialog').filter({ hasText: '保存并关闭' })
  await guard.getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(() => window.midiEditorFixture.closeState())).quits).toBe(0)
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '退出保护测试'
  )
})

test('独立编辑器停留在后台页面时，退出确认仍可见且取消后保留编辑会话', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const child = await opening
  await child.locator('.midi-editor-name input, input.midi-editor-name').fill('后台退出保护')
  await child.locator('.midi-editor-name input, input.midi-editor-name').blur()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '后台退出保护'
  )
  await page.evaluate(() => window.midiEditorFixture.navigate('/files/all'))
  await expect(page.getByRole('heading', { name: '歌曲管理', exact: true })).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.requestClose('quit'))
  const guard = page.getByRole('dialog').filter({ hasText: '保存并关闭' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(() => window.midiEditorFixture.closeState())).quits).toBe(0)
  expect(child.isClosed()).toBe(false)
  await expect(child.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '后台退出保护'
  )
})

test('访问关于后关闭设置，歌曲列表的返回顶部仍可使用', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  const list = page.locator('.song-scroll')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await list.evaluate((element) => {
    element.scrollTop = 1800
    element.dispatchEvent(new Event('scroll'))
  })
  const back = page.getByRole('button', { name: '返回顶部', exact: true })
  await expect(back).toBeVisible()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('menuitem', { name: '关于', exact: true }).click()
  await expect(settings).toContainText('更新日志')
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(back).toBeVisible()
  await back.click()
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0)
})

test('退出应用也复用模板编辑页的未保存保护', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.evaluate(() => window.midiEditorFixture.navigate('/templates/new'))
  const name = page.locator('.template-editor-inline input').first()
  await name.fill('模板退出保护')
  await name.blur()
  await page.evaluate(() => window.midiEditorFixture.requestClose('quit'))
  const guard = page.getByRole('dialog').filter({ hasText: '保存并退出' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: /取\s*消/, exact: true }).click()
  expect((await page.evaluate(() => window.midiEditorFixture.closeState())).quits).toBe(0)
  await expect(name).toHaveValue('模板退出保护')
})

test('悬浮模式退出前恢复正常界面，未保存项目确认可见', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  await page.locator('.midi-editor-name input, input.midi-editor-name').fill('悬浮退出保护')
  await page.locator('.midi-editor-name input, input.midi-editor-name').blur()
  await page.getByRole('button', { name: '进入悬浮模式', exact: true }).click()
  await expect(page.locator('.overlay-view')).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.requestClose('quit'))
  const guard = page.getByRole('dialog').filter({ hasText: '保存并关闭' })
  await expect(guard).toBeVisible()
  await expect(page.locator('.overlay-view')).not.toBeVisible()
  await guard.getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(() => window.midiEditorFixture.closeState())).quits).toBe(0)
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '悬浮退出保护'
  )
})
