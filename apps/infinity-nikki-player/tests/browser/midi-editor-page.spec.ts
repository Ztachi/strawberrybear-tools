import { expect, test, type Page } from '@playwright/test'

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

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  await expect(page.locator('.editor-toolbar')).toBeVisible()
})

test('拍号下拉可以点击、滚动，并将更改写入编辑会话', async ({ page }) => {
  await openSettings(page)
  const numerator = page.locator('.toolbar-meter').first()
  await expect.poll(() => numerator.evaluate((el) => el.getBoundingClientRect().width)).toBe(80)
  const initialWidth = await numerator.evaluate((el) => el.getBoundingClientRect().width)
  await openSettings(page)
  await numerator.click()
  const popup = page.locator('.ant-select-dropdown:visible')
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
  await page.locator('.toolbar-snap').click()
  await popup
    .locator('.ant-select-item-option')
    .filter({ hasText: /^1\/8$/ })
    .click()
  await expect(page.locator('.toolbar-snap')).toContainText('1/8')
})

test('全屏编辑填满窗口，切换保留项目，退出编辑恢复全局播放条', async ({ page }) => {
  await expect(page.locator('.global-music-player')).toBeAttached()
  await expect(page.locator('.global-music-player')).toBeHidden()
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  const originalName = await name.inputValue()
  await name.fill('全屏测试项目')
  await name.blur()
  const before = await page.locator('.midi-editor-body').boundingBox()
  await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
  await expect(page.locator('.window-title-bar')).toBeHidden()
  const bounds = await page.locator('.midi-editor-page').boundingBox()
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 1100, height: 850 })
  expect((await page.locator('.midi-editor-body').boundingBox())!.height).toBeGreaterThan(
    before!.height
  )
  await expect(name).toHaveValue('全屏测试项目')
  await openSettings(page)
  await page.locator('.toolbar-meter').first().click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^3$/ })
    .click()
  await page.getByRole('button', { name: '退出全屏编辑', exact: true }).click()
  await expect(page.locator('.window-title-bar')).toBeVisible()
  await expect(name).toHaveValue('全屏测试项目')
  await expect(page.locator('.toolbar-meter').first()).toContainText('3')
  await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.window-title-bar')).toBeVisible()
  await page.getByRole('button', { name: /撤销/ }).click()
  // 项目名称不进入音符历史，恢复名称后直接退出无改动项目。
  await name.fill(originalName)
  await name.blur()
  await expect(page.getByRole('button', { name: /撤销/ })).toBeDisabled()
  await page.getByRole('button', { name: /取\s*消/ }).click()
  await expect(page.locator('.global-music-player')).toBeVisible()
})

for (const width of [900, 1100, 1440]) {
  test(`布局在 ${width}px 下不溢出，密度切换保留音符选择`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/tests/browser/midi-editor-page.html?populated=1')
    await page.locator('.detail-piano-roll .pr-scroll').dblclick({ position: { x: 200, y: 150 } })
    await page.locator('.detail-piano-editor .pr-scroll').click({ position: { x: 150, y: 130 } })
    await page.keyboard.press('ControlOrMeta+a')
    await expect(page.locator('.inspector-count')).toContainText('32')
    await expect(page.locator('.inspector-details')).toHaveCount(0)
    for (const selector of ['.midi-editor-header', '.editor-toolbar', '.inspector-main']) {
      expect(await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true
      )
    }
    await page.getByRole('button', { name: '详细', exact: true }).click()
    await expect(page.locator('.inspector-details')).toBeVisible()
    expect(
      await page.locator('.inspector-details').evaluate((el) => el.scrollWidth <= el.clientWidth)
    ).toBe(true)
    await page.getByRole('button', { name: '简约', exact: true }).click()
    await expect(page.locator('.inspector-count')).toContainText('32')
    await page.locator('.toolbar-snap').click()
    const popup = page.locator('.ant-select-dropdown:visible')
    await expect(popup).toBeVisible()
    await expect.poll(() => popup.evaluate((el) => el.getBoundingClientRect().width)).toBe(160)
    await popup.hover()
    await page.mouse.wheel(0, 500)
    await popup
      .locator('.ant-select-item-option')
      .filter({ hasText: /^1\/16t$/ })
      .click()
    await expect(page.locator('.toolbar-snap')).toContainText('1/16t')
    expect(
      await page.locator('.toolbar-snap').evaluate((el) => el.getBoundingClientRect().width)
    ).toBe(104)
    await expect(page.getByRole('button', { name: '添加到播放器', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '导出 .mid', exact: true }).hover()
    await expect(page.getByRole('tooltip').filter({ hasText: '导出 .mid' })).toBeVisible()
  })
}

test('窄窗口中单音符属性完整显示，切换详细模式不产生历史记录', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 })
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&single=1')
  await page.locator('.detail-piano-roll .pr-scroll').dblclick({ position: { x: 100, y: 150 } })
  await page.locator('.detail-piano-editor .pr-scroll').click({ position: { x: 150, y: 130 } })
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.locator('.inspector-count')).toContainText('1')
  await expect(page.getByRole('spinbutton', { name: '音高', exact: true })).toHaveValue('60')
  await expect(page.getByRole('spinbutton', { name: '长度', exact: true })).toHaveValue('0.375')
  expect(
    await page.locator('.inspector-main').evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
  await page.getByRole('button', { name: '详细', exact: true }).click()
  expect(
    await page.locator('.inspector-details').evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
  await expect(page.getByRole('button', { name: /撤销/ })).toBeDisabled()
  await page.getByRole('button', { name: /量化起点/, exact: true }).hover()
  await expect(page.getByRole('button', { name: /量化起点/, exact: true })).toHaveClass(
    /ant-btn-variant-outlined/
  )
  await expect(page.getByRole('button', { name: /-八度/, exact: true })).toHaveClass(
    /ant-btn-variant-outlined/
  )
  await expect(page.getByRole('tooltip').filter({ hasText: '对齐到当前吸附网格' })).toBeVisible()
})
