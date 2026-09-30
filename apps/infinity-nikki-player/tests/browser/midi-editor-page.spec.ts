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
  await expect(help.getByRole('heading', { name: '音符编辑', exact: true })).toBeVisible()
  await expect(help.getByRole('heading', { name: '音轨管理', exact: true })).toBeVisible()
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

test('保存并关闭会先保存工程，再直接离开编辑器', async ({ page }) => {
  const name = page.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('保存并关闭测试项目')
  await name.blur()
  await openEditorMoreActions(page)
  await page.getByRole('menuitem', { name: '保存并关闭', exact: true }).click()

  await expect(page.getByText('项目已保存', { exact: true })).toBeVisible()
  await expect(page.getByText('有未保存的项目改动', { exact: true })).toHaveCount(0)
  await expect(page.locator('.global-music-player')).toBeVisible()
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

  await openSettings(page)
  await page.getByRole('switch', { name: '不可演奏音符置灰', exact: true }).click()
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
  await templateSelect.click()
  await popup
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '高音演奏键' })
    .click()
  await expect(templateSelect).toContainText('高音演奏键')

  await page.getByRole('button', { name: '还原到主窗口', exact: true }).click()
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(page.locator('.editor-toolbar')).toBeVisible()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '独立窗口中的项目名'
  )
  await expect(page.locator('.editor-window-error')).toHaveCount(0)
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

test('歌曲列表进入详情再返回时保留原滚动位置', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  const songList = page.locator('.song-scroll')
  await expect(page.locator('.song-row').first()).toBeVisible()
  await songList.evaluate((element) => {
    element.scrollTop = 1800
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => songList.evaluate((element) => element.scrollTop)).toBeGreaterThan(1500)
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
  await search.fill('布局')
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
  await expect(search).toHaveValue('布局')
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

  await page.getByRole('button', { name: '不保存并关闭', exact: true }).click()
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

test('乐曲设置使用语义正确的开关，并保持显示选项不进入历史记录', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?populated=1&single=1')
  await openSettings(page)
  const velocityLane = page.getByRole('switch', { name: '力度条', exact: true })
  const dimUnplayable = page.getByRole('switch', { name: '不可演奏音符置灰', exact: true })
  await expect(velocityLane).not.toBeChecked()
  await expect(dimUnplayable).not.toBeChecked()
  await velocityLane.click()
  await dimUnplayable.click()
  await expect(velocityLane).toBeChecked()
  await expect(dimUnplayable).toBeChecked()
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
