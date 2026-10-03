import { expect, test, type Locator, type Page } from '@playwright/test'

/** 在真实页面上核对同类操作，防止局部颜色覆盖框架或主题变量。 */
async function expectActionStates(page: Page, button: Locator): Promise<void> {
  await page.mouse.move(0, 0)
  await expect(button).toHaveCSS('color', 'rgb(247, 183, 190)')
  await button.hover()
  await expect(button).toHaveCSS('color', 'rgb(238, 143, 161)')
  await page.mouse.down()
  try {
    await expect(button).toHaveCSS('color', 'rgb(227, 111, 134)')
  } finally {
    // 移出再松手，不执行导出、播放或导航操作。
    await page.mouse.move(0, 0)
    await page.mouse.up()
  }
}

test('歌单导出、顶部导航和全局播放器共用默认、悬浮及按下颜色', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1&playlist=1')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.switchMainWindowSong())
  for (const button of [
    page.locator('.header-action-btn').nth(1),
    page.locator('.header-nav-refresh'),
    page.locator('.global-music-player .transport-btn.prev'),
    page.locator('.global-music-player .mode-trigger'),
    page.locator('.global-music-player .queue-btn'),
    page.locator('.global-music-player .preview-queue-button'),
    page.locator('.song-menu-trigger').first(),
  ])
    await expectActionStates(page, button)
})

test('禁用操作使用灰色，悬浮时不恢复可用状态；选中开关保留主题底色', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  const undo = page.locator('.toolbar-history-button').first()
  await expect(undo).toBeDisabled()
  await expect(undo).toHaveCSS('color', 'rgb(168, 154, 154)')
  await expect(undo).toHaveCSS('opacity', '1')
  await undo.hover({ force: true })
  await expect(undo).toHaveCSS('color', 'rgb(168, 154, 154)')
  const follow = page.locator('.detail-piano-roll .piano-follow-button')
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await expect(follow).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(follow).toHaveCSS('background-color', 'rgb(247, 183, 190)')
})

test('替换主题变量组即可同时更新框架和原生操作按钮', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1&playlist=1')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.switchMainWindowSong())
  await page.evaluate(() => {
    const group = {
      '--color-primary': '#5891d1',
      '--color-primary-hover': '#3673b6',
      '--color-primary-active': '#23558c',
      '--color-primary-light': '#edf5ff',
      '--color-disabled': '#8d949c',
    }
    for (const [name, value] of Object.entries(group))
      document.documentElement.style.setProperty(name, value)
  })
  for (const button of [
    page.locator('.header-action-btn').nth(1),
    page.locator('.header-nav-refresh'),
    page.locator('.global-music-player .transport-btn.prev'),
    page.locator('.global-music-player .preview-queue-button'),
    page.locator('.song-menu-trigger').first(),
  ]) {
    await page.mouse.move(0, 0)
    await expect(button).toHaveCSS('color', 'rgb(88, 145, 209)')
    await button.hover()
    await expect(button).toHaveCSS('color', 'rgb(54, 115, 182)')
  }
  const play = page.locator('.global-music-player .transport-btn.play')
  await page.mouse.move(0, 0)
  await expect(play).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(play).toHaveCSS('background-color', 'rgb(88, 145, 209)')
  // 覆盖 solid 的原生 disabled 状态，图标必须继承禁用色，不能被白色 SVG 局部规则盖住。
  await play.evaluate((element) => ((element as HTMLButtonElement).disabled = true))
  await play.hover({ force: true })
  await expect(play).toHaveCSS('color', 'rgb(141, 148, 156)')
  await expect(play.locator('svg')).toHaveCSS('color', 'rgb(141, 148, 156)')
  await page.screenshot({ path: test.info().outputPath('theme-controls-blue.png') })
})

test('悬浮条采用反白变量组，弹出的操作菜单保持普通主题', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1&playlist=1')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.switchMainWindowSong())
  await page.getByRole('button', { name: '进入悬浮模式', exact: true }).click()
  await expect(page.locator('.overlay-view')).toBeVisible()
  const previous = page.locator('.overlay-view .transport-btn.prev')
  await page.mouse.move(0, 0)
  await expect(previous).toHaveCSS('color', 'rgba(255, 255, 255, 0.9)')
  await previous.hover()
  await expect(previous).toHaveCSS('color', 'rgb(255, 255, 255)')
  const mode = page.locator('.overlay-view .mode-trigger')
  await mode.click()
  const options = page.locator('.mode-option')
  await expect(options.first()).toBeVisible()
  const selected = page.locator('.mode-option.active')
  await expect(selected).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(selected).toHaveCSS('background-color', 'rgb(247, 183, 190)')
  await expectActionStates(page, options.nth(1))
})

test('操作菜单的图标使用主题状态，危险和禁用项保持各自语义', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?list=1')
  await page
    .locator('.project-table-row')
    .first()
    .getByRole('button', { name: '更多操作', exact: true })
    .click()
  const exportIcon = page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: '导出 .mid', exact: true })
    .locator('.nikki-menu-action-icon')
  await expectActionStates(page, exportIcon)
  const danger = page.locator(
    '.ant-dropdown:visible .ant-dropdown-menu-item-danger .nikki-menu-action-icon'
  )
  await expect(danger).toHaveCSS('color', 'rgb(239, 68, 68)')
  await danger.hover()
  await expect(danger).not.toHaveCSS('color', 'rgb(239, 68, 68)')
  await expect(danger).not.toHaveCSS('color', 'rgb(238, 143, 161)')
  await page.goto('/tests/browser/midi-editor-page.html')
  await page.locator('.track-actions-button').first().click()
  const disabledIcon = page
    .locator('.ant-dropdown:visible .ant-dropdown-menu-item-disabled .nikki-menu-action-icon')
    .first()
  await expect(disabledIcon).toHaveCSS('color', 'rgb(168, 154, 154)')
  await disabledIcon.hover({ force: true })
  await expect(disabledIcon).toHaveCSS('color', 'rgb(168, 154, 154)')
  const disabledDanger = page.locator(
    '.ant-dropdown:visible .ant-dropdown-menu-item-danger.ant-dropdown-menu-item-disabled .nikki-menu-action-icon'
  )
  await disabledDanger.hover({ force: true })
  await expect(disabledDanger).toHaveCSS('color', 'rgb(168, 154, 154)')
})
