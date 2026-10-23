import { test, expect, type Locator } from '@playwright/test'

/** 截图等目录动画真正到达目标位置，避免记录到平滑滚动的中间帧。 */
async function expectDataPosition(settings: Locator, title = '数据'): Promise<void> {
  const heading = settings.getByRole('heading', { name: title, exact: true })
  const content = settings.locator('.section-document-content')
  await expect
    .poll(async () => {
      const [headingBox, contentBox] = await Promise.all([
        heading.boundingBox(),
        content.boundingBox(),
      ])
      return headingBox && contentBox ? Math.abs(headingBox.y - contentBox.y - 8) : Infinity
    })
    .toBeLessThanOrEqual(2)
}

test('启动设置即时保存，静默选项随开机启动显示，保存失败恢复原值', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  const launch = settings.getByRole('switch', { name: '开机启动', exact: true })
  const silent = settings.getByRole('switch', { name: '随开机启动时静默启动', exact: true })
  await expect(silent).toHaveCount(0)
  await launch.click()
  await expect(silent).toBeVisible()
  await silent.click()
  await expect
    .poll(() => page.evaluate(() => window.dataManagementFixture.state().preferences.silentStartup))
    .toBe(true)
  const automatic = settings.getByRole('switch', { name: '自动检查更新', exact: true })
  await page.evaluate(() => window.dataManagementFixture.failNext('save_data_preferences'))
  await automatic.click()
  await expect(page.getByText('保存设置失败', { exact: true })).toBeVisible()
  await expect(automatic).toBeChecked()
  await expect
    .poll(() =>
      page.evaluate(() => window.dataManagementFixture.state().preferences.autoCheckUpdates)
    )
    .toBe(true)
})

test('数据页备份可创建重命名删除，恢复前展示摘要且取消不改数据', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await expect(settings.getByText('/fixture/data', { exact: true })).toBeVisible()
  await expectDataPosition(settings)
  await page.screenshot({ path: testInfo.outputPath('settings-data.png'), animations: 'disabled' })
  const interval = settings.getByRole('combobox', { name: '自动备份间隔', exact: true })
  await page.evaluate(() => window.dataManagementFixture.failNext('save_data_preferences'))
  await interval.click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^12 小时$/ })
    .click()
  await expect(page.getByText('保存设置失败', { exact: true })).toBeVisible()
  await expect(
    settings
      .locator('.ant-select')
      .filter({ has: page.getByRole('combobox', { name: '自动备份间隔', exact: true }) })
  ).toContainText('24 小时')
  await settings.getByRole('button', { name: '立即备份', exact: true }).click()
  await expect(settings.getByText('本地备份', { exact: true }).last()).toBeVisible()
  await settings.getByRole('button', { name: '重命名 本地备份', exact: true }).click()
  const rename = page.getByRole('dialog', { name: '重命名备份', exact: true })
  await rename.getByRole('textbox', { name: '名称', exact: true }).fill('演出前的备份')
  await rename.getByRole('button', { name: '保存', exact: true }).click()
  await expect(settings.getByText('演出前的备份', { exact: true })).toBeVisible()
  await settings.getByRole('button', { name: '恢复', exact: true }).click()
  const restore = page.getByRole('dialog', { name: '恢复备份', exact: true })
  await expect(restore).toContainText('验收设备')
  await expect(restore).toContainText('歌曲 4')
  await restore.getByRole('button', { name: '取消', exact: true }).click()
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('commit_data_restore')
    )
  ).toBe(false)
  await settings.getByRole('button', { name: '删除 演出前的备份', exact: true }).click()
  await page
    .getByRole('dialog', { name: '删除备份', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await expect(settings.getByText('还没有本地备份', { exact: true })).toBeVisible()
})

test('云配置保存后清空明文输入，未保存配置阻止同步，服务切换先确认停用', async ({
  page,
}, testInfo) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await settings
    .getByRole('textbox', { name: '服务器地址', exact: true })
    .fill('https://dav.example.com/files/')
  await settings.getByRole('textbox', { name: '用户名', exact: true }).fill('nikki')
  await settings.getByLabel('密码 / 应用密码', { exact: true }).fill('fixture-app-password')
  await settings.getByRole('switch', { name: '启用云同步', exact: true }).click()
  await expect(settings.getByRole('button', { name: '上传到云端', exact: true })).toBeDisabled()
  const automaticUpload = settings.getByRole('switch', { name: '自动上传', exact: true })
  await automaticUpload.click()
  const automaticConfirm = page.getByRole('dialog', { name: '开启自动上传', exact: true })
  await expect(automaticConfirm).toContainText('不会自动下载或合并')
  await automaticConfirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(automaticUpload).not.toBeChecked()
  await automaticUpload.click()
  await automaticConfirm.getByRole('button', { name: '确定', exact: true }).click()
  await expect(automaticUpload).toBeChecked()
  await page.evaluate(() => window.dataManagementFixture.failNext('test_cloud_sync_connection'))
  await settings.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(page.getByText('配置已保存，但连接失败', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.dataManagementFixture.state().cloud.autoUpload)).toBe(
    true
  )
  await expect(settings.getByLabel('密码 / 应用密码', { exact: true })).toHaveValue('')
  await expect(settings.getByLabel('密码 / 应用密码', { exact: true })).toHaveAttribute(
    'placeholder',
    '已保存，留空保持不变'
  )
  await expect(settings.getByRole('button', { name: '上传到云端', exact: true })).toBeEnabled()
  await settings.getByRole('heading', { name: '云同步', exact: true }).scrollIntoViewIfNeeded()
  await settings.locator('.section-document-content').evaluate((node) => {
    const heading = Array.from(node.querySelectorAll('h4')).find(
      (item) => item.textContent === '云同步'
    )
    if (heading)
      node.scrollTop += heading.getBoundingClientRect().top - node.getBoundingClientRect().top - 8
  })
  await page.screenshot({ path: testInfo.outputPath('settings-cloud.png'), animations: 'disabled' })
  await settings.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.getByText('连接成功', { exact: true })).toBeVisible()
  const provider = settings.getByRole('combobox', { name: '同步服务', exact: true })
  await provider.click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^S3$/ })
    .click()
  const switchService = page.getByRole('dialog', { name: '切换同步服务', exact: true })
  await expect(switchService).toBeVisible()
  await switchService.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(() => window.dataManagementFixture.state().cloud.enabled)).toBe(true)
  await expect(
    settings
      .locator('.ant-select')
      .filter({ has: page.getByRole('combobox', { name: '同步服务', exact: true }) })
  ).toContainText('WebDAV')
  await provider.click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^S3$/ })
    .click()
  await switchService.getByRole('button', { name: '确定', exact: true }).click()
  await expect(settings.getByRole('textbox', { name: '存储桶', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.dataManagementFixture.state().cloud.enabled)).toBe(false)
  await expect(settings.getByRole('button', { name: '上传到云端', exact: true })).toBeDisabled()
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  const discard = page.getByRole('dialog', { name: '放弃未保存的配置', exact: true })
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: '取消', exact: true }).click()
  await expect(settings).toBeVisible()
})

test('云上传确认现有快照，云恢复先准备再确认，失败不重启', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.evaluate(() => window.dataManagementFixture.setRemote())
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await settings
    .getByRole('textbox', { name: '服务器地址', exact: true })
    .fill('https://dav.example.com/files/')
  await settings.getByRole('textbox', { name: '用户名', exact: true }).fill('nikki')
  await settings.getByLabel('密码 / 应用密码', { exact: true }).fill('fixture-password')
  await settings.getByRole('switch', { name: '启用云同步', exact: true }).click()
  await settings.getByRole('button', { name: '保存配置', exact: true }).click()
  await settings.getByRole('button', { name: '上传到云端', exact: true }).click()
  const upload = page.getByRole('dialog', { name: '上传数据到云端', exact: true })
  await expect(upload).toContainText('现有云端快照')
  await expect(upload).toContainText('验收设备')
  await upload.getByRole('button', { name: '取消', exact: true }).click()
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('upload_cloud_snapshot')
    )
  ).toBe(false)
  await page.evaluate(() => window.dataManagementFixture.failNext('commit_data_restore'))
  await settings.getByRole('button', { name: '从云端恢复', exact: true }).click()
  const restore = page.getByRole('dialog', { name: '恢复备份', exact: true })
  await expect(restore).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('prepare_cloud_restore')
    )
  ).toBe(true)
  await restore.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('操作未完成', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.dataManagementFixture.state().restarts)).toBe(0)
  await expect(settings.getByRole('button', { name: '从云端恢复', exact: true })).toBeEnabled()
})

test('界面偏好重置保留模板草稿，导入成功提交后重启', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.evaluate(() => {
    localStorage.setItem('infinity-nikki-player.template-draft.create', 'fixture-template-draft')
    localStorage.setItem(
      'infinity-nikki-player:midi-editor-preferences:v1',
      JSON.stringify({ showVelocity: true })
    )
  })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await settings.getByRole('button', { name: '重置界面偏好', exact: true }).click()
  await page
    .getByRole('dialog', { name: '重置界面偏好', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  expect(
    await page.evaluate(() => localStorage.getItem('infinity-nikki-player.template-draft.create'))
  ).toBe('fixture-template-draft')
  await expect(
    settings.getByRole('switch', { name: '显示音符力度', exact: true })
  ).not.toBeChecked()
  await page.evaluate(() =>
    window.dataManagementFixture.setDialogPath('/fixture/backup.nikki-backup.zip')
  )
  await settings.getByRole('button', { name: '导入数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => window.dataManagementFixture.state().restarts))
    .toBe(1)
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('commit_data_restore')
    )
  ).toBe(true)
})

test('恢复提交失败且修复状态不可读取时保持锁定，可重试重启', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.evaluate(() => {
    window.dataManagementFixture.setDialogPath('/fixture/backup.nikki-backup.zip')
    window.dataManagementFixture.failNext('commit_data_restore')
    window.dataManagementFixture.failNext('data_operation_requires_restart')
  })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await settings.getByRole('button', { name: '导入数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await expect(
    settings.getByText('操作未完成，请重新启动以修复资料。', { exact: true })
  ).toBeVisible()
  await expect(settings.getByRole('button', { name: '导出数据', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.dataManagementFixture.state().restarts)).toBe(0)
  await settings.getByRole('button', { name: '重新启动', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.dataManagementFixture.state().restarts))
    .toBe(1)
})

test('恢复先保护独立窗口的未保存编辑，取消不提交，准备期仍能保存后恢复', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const child = await opening
  const name = child.locator('.midi-editor-name input, input.midi-editor-name')
  await name.fill('恢复前保留的工程')
  await name.blur()
  await expect(page.locator('.midi-editor-name input, input.midi-editor-name')).toHaveValue(
    '恢复前保留的工程'
  )
  await page.evaluate(() =>
    window.dataManagementFixture.setDialogPath('/fixture/backup.nikki-backup.zip')
  )
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await settings.getByRole('button', { name: '导入数据', exact: true }).click()
  const summary = page.getByRole('dialog', { name: '恢复备份', exact: true })
  await summary.getByRole('button', { name: '确定', exact: true }).click()
  const guard = page.getByRole('dialog').filter({ hasText: '保存并关闭' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: '取消', exact: true }).click()
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('commit_data_restore')
    )
  ).toBe(false)
  await expect(name).toHaveValue('恢复前保留的工程')
  await page.evaluate(() => window.midiEditorFixture.deferProjectSave(true))
  await settings.getByRole('button', { name: '导入数据', exact: true }).click()
  await summary.getByRole('button', { name: '确定', exact: true }).click()
  await guard.getByRole('button', { name: '保存并关闭', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.midiEditorFixture.projectSavePending()))
    .toBe(true)
  await expect(page.locator('.midi-editor-page')).toHaveAttribute('inert', '')
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('commit_data_restore')
    )
  ).toBe(false)
  await page.evaluate(() => window.midiEditorFixture.finishProjectSave())
  await expect
    .poll(() => page.evaluate(() => window.dataManagementFixture.state().restarts))
    .toBe(1)
})

test('独立窗口有活动录制时恢复不提交数据', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '在独立窗口中打开', exact: true }).click()
  const child = await opening
  await child.getByRole('button', { name: '键盘录制', exact: true }).click()
  await child.getByRole('button', { name: '开始录制', exact: true }).click()
  await child.keyboard.press('a')
  await page.evaluate(() =>
    window.dataManagementFixture.setDialogPath('/fixture/backup.nikki-backup.zip')
  )
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  await settings.getByRole('button', { name: '导入数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await expect(page.getByText(/请先.*应用或放弃.*录制/)).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('commit_data_restore')
    )
  ).toBe(false)
  expect(await page.evaluate(() => window.dataManagementFixture.state().restarts)).toBe(0)
})

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

test('设置按常规、数据和关于连续滚动，倍速使用数字刻度', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(settings.getByRole('radio', { name: '最小化到系统托盘', exact: true })).toBeChecked()
  await expect(settings.getByRole('combobox', { name: '显示语言', exact: true })).toBeVisible()
  const contents = settings.getByRole('navigation', { name: '设置目录', exact: true })
  await expect(contents.getByRole('link')).toHaveText(['常规', '数据', '关于'])
  await expect(settings.getByRole('heading', { name: '设置目录', exact: true })).toHaveCount(0)
  for (const title of ['常规', '数据', '关于']) {
    await expect(
      contents.getByRole('link', { name: title, exact: true }).locator('svg')
    ).toHaveCount(1)
    await expect(
      settings.getByRole('heading', { name: title, exact: true }).locator('svg')
    ).toHaveCount(1)
  }
  const hint = '最小化到托盘后，播放和编辑会话仍会保留。可通过托盘图标重新打开窗口。'
  await expect(settings).not.toContainText(hint)
  await settings.getByRole('button', { name: '托盘说明', exact: true }).focus()
  await expect(page.getByRole('tooltip')).toHaveText(hint)
  await contents.getByRole('link', { name: '常规', exact: true }).focus()
  await contents.getByRole('link', { name: '关于', exact: true }).hover()
  await expect(page.getByRole('tooltip')).not.toBeVisible()
  await expect(settings.locator('#app-settings-general')).toBeAttached()
  await expect(settings.locator('#app-settings-about')).toBeAttached()
  await expect(settings).not.toContainText('沿用现有')
  await page.screenshot({
    path: testInfo.outputPath('settings-general.png'),
    animations: 'disabled',
  })
  await contents.getByRole('link', { name: '关于', exact: true }).click()
  await expect(settings).toContainText('更新日志')
  await expect(settings.locator('#app-settings-about')).toBeInViewport()
  await expect(contents.getByRole('link', { name: '关于', exact: true })).toHaveClass(
    /title-active/
  )
  const about = settings.locator('.embedded-about')
  await expect(about.locator('.about-icon')).toHaveCount(1)
  await expect(about).toContainText('当前版本')
  await expect(about.getByRole('button', { name: '检测更新', exact: true })).toHaveText('检测更新')
  await expect(about.locator('.about-description')).toHaveCount(0)
  const buttons = about.locator('.version-update-trigger button, .about-release-notes')
  await expect(buttons).toHaveText(['检测更新', '更新日志'])
  await expect(about.getByRole('button', { name: '导出诊断', exact: true })).toHaveCount(0)
  for (const button of await buttons.all()) {
    await expect(button.locator('.ant-btn-icon')).toHaveCount(1)
    expect(
      await button.evaluate((node) => {
        const icon = node.querySelector('.ant-btn-icon')!
        return !!(
          icon.compareDocumentPosition(node.lastElementChild!) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      })
    ).toBe(true)
  }
  expect((await settings.locator('#app-settings-about').boundingBox())!.height).toBeLessThan(600)
  const contact = about.locator('.app-contact')
  await expect(contact).toContainText('967529814')
  await about.getByRole('button', { name: '官方网站', exact: true }).click()
  expect(await page.evaluate(() => window.midiEditorFixture.openedUrls())).toEqual([
    'https://ztachi.com/tools/infinity-nikki-player',
  ])
  await page.screenshot({
    path: testInfo.outputPath('settings-contact.png'),
    animations: 'disabled',
  })
  await about.getByRole('button', { name: '源代码', exact: true }).click()
  expect(await page.evaluate(() => window.midiEditorFixture.openedUrls())).toEqual([
    'https://ztachi.com/tools/infinity-nikki-player',
    'https://github.com/Ztachi/strawberrybear-tools/tree/main/apps/infinity-nikki-player',
  ])
  await page.screenshot({ path: testInfo.outputPath('settings-about.png'), animations: 'disabled' })
  await contents.getByRole('link', { name: '常规', exact: true }).click()
  await expect
    .poll(() => settings.locator('.section-document-content').evaluate((node) => node.scrollTop))
    .toBe(0)
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
  for (const mark of ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0'])
    await expect(
      page.locator('.playback-speed-popover .ant-slider-mark').getByText(mark, { exact: true })
    ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('playback-speed.png'), animations: 'disabled' })
  await page
    .locator('.playback-speed-popover .ant-slider-mark')
    .getByText('1.5', { exact: true })
    .click()
  await expect(speed).toHaveText('1.5x')
  await page.getByRole('button', { name: '恢复原速', exact: true }).click()
  await expect(speed).toHaveText('1.0x')
})

test('窄窗口设置保持左侧目录，语言可保存，关于仍在同一正文中', async ({ page }, testInfo) => {
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
    .getByRole('link', { name: 'General', exact: true })
    .boundingBox())!
  const lastCategory = (await settings
    .getByRole('link', { name: 'About', exact: true })
    .boundingBox())!
  expect(Math.abs(firstCategory.x - lastCategory.x)).toBeLessThan(2)
  expect(lastCategory.y).toBeGreaterThan(firstCategory.y)
  const body = (await settings.locator('.section-document-content').boundingBox())!
  expect(body.x).toBeGreaterThan(lastCategory.x + lastCategory.width)
  await expect(settings.getByRole('link', { name: 'Playback', exact: true })).toHaveCount(0)
  await expect(settings.getByRole('link', { name: 'Updates', exact: true })).toHaveCount(0)
  await expect(settings.getByRole('link', { name: 'Data', exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('settings-narrow-en.png'),
    animations: 'disabled',
  })
  const bounds = (await settings.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(540)
  await settings.getByRole('link', { name: 'About', exact: true }).click()
  await expect(settings).toContainText('Release Notes')
  await settings.getByRole('link', { name: 'Data', exact: true }).click()
  await expectDataPosition(settings, 'Data')
  await page.screenshot({
    path: testInfo.outputPath('settings-data-narrow-en.png'),
    animations: 'disabled',
  })
})

test('360×156 悬浮窗口内倍速浮层完整显示，刻度与恢复原速可点击', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.getByRole('button', { name: '进入悬浮模式', exact: true }).click()
  await page.setViewportSize({ width: 360, height: 156 })
  const speed = page.getByRole('button', { name: '倍速播放', exact: true })
  expect(await speed.evaluate((node) => getComputedStyle(node).color)).toMatch(
    /^rgba?\(255, 255, 255(?:, 0\.9)?\)$/
  )
  await speed.click()
  const popup = page.locator('.playback-speed-popover')
  await expect(popup).toBeVisible()
  await expect
    .poll(async () => {
      const box = (await popup.boundingBox())!
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 156
    })
    .toBe(true)
  const box = (await popup.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(260)
  expect(box.height).toBeLessThanOrEqual(90)
  await expect(popup.locator('.ant-slider-mark-text')).toHaveText([
    '0.5',
    '1.0',
    '1.5',
    '2.0',
    '2.5',
    '3.0',
  ])
  await popup.getByText('2.5', { exact: true }).click()
  await expect(speed).toHaveText('2.5x')
  const reset = popup.getByRole('button', { name: '恢复原速', exact: true })
  expect((await reset.boundingBox())!.width).toBeLessThanOrEqual(18)
  expect(await reset.evaluate((node) => getComputedStyle(node).padding)).toBe('0px')
  await reset.click()
  await expect(speed).toHaveText('1.0x')
  await page.screenshot({
    path: testInfo.outputPath('playback-speed-overlay.png'),
    animations: 'disabled',
  })
})

test('系统关于入口定位同一设置正文，重新从设置打开回到常规', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.showAbout())
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  const content = settings.locator('.section-document-content')
  const url = page.url()
  const historyLength = await page.evaluate(() => window.history.length)
  async function expectAboutPosition(): Promise<void> {
    await expect
      .poll(() =>
        content.evaluate((node) => {
          const about = node.querySelector('#app-settings-about')!
          const target =
            about.getBoundingClientRect().top -
            node.getBoundingClientRect().top +
            node.scrollTop -
            8
          return Math.abs(node.scrollTop - Math.min(target, node.scrollHeight - node.clientHeight))
        })
      )
      .toBeLessThanOrEqual(1)
    await expect(settings.locator('[href="#app-settings-about"]')).toHaveClass(/title-active/)
  }
  await expect(settings).toBeVisible()
  await expectAboutPosition()
  await settings.getByRole('link', { name: '常规', exact: true }).click()
  await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBe(0)
  await page.evaluate(() => window.midiEditorFixture.showAbout())
  await expectAboutPosition()
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  // 关闭后确实销毁正文；重新打开的第一帧就应从顶部开始。
  await expect(page.locator('.app-settings-modal .section-document')).toHaveCount(0)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(settings).toBeVisible()
  expect(await content.evaluate((node) => node.scrollTop)).toBe(0)
  await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBe(0)
  await expect(settings.locator('[href="#app-settings-general"]')).toHaveClass(/title-active/)
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
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
  await settings.getByRole('link', { name: '关于', exact: true }).click()
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
