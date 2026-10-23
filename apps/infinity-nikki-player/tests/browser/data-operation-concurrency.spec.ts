import { test, expect } from '@playwright/test'

test('恢复等待模板保存时系统退出不能重入确认，取消后仍可继续编辑', async ({ page }) => {
  await page.goto('/tests/browser/midi-editor-page.html?navigation=1')
  await page.evaluate(() => window.midiEditorFixture.navigate('/templates/new'))
  const name = page.locator('.template-editor-inline input').first()
  await name.fill('恢复期间保护的模板')
  await name.blur()
  await page.evaluate(() => window.dataManagementFixture.setDialogPath('/fixture/backup.zip'))
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('link', { name: '数据', exact: true }).click()
  const restore = settings.getByRole('button', { name: '导入数据', exact: true })
  await restore.click()
  await page
    .getByRole('dialog', { name: '恢复备份', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  const guard = page.getByRole('dialog').filter({ hasText: '保存并退出' })
  await expect(guard).toBeVisible()
  await page.evaluate(() => window.midiEditorFixture.requestClose('quit'))
  await guard.getByRole('button', { name: /取\s*消/, exact: true }).click()
  // 原恢复请求必须结束；若退出覆盖了模板的确认回调，这里会永久保持禁用。
  await expect(restore).toBeEnabled()
  expect((await page.evaluate(() => window.midiEditorFixture.closeState())).quits).toBe(0)
  expect(
    await page.evaluate(() =>
      window.dataManagementFixture.state().calls.includes('commit_data_restore')
    )
  ).toBe(false)
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(name).toHaveValue('恢复期间保护的模板')
  await name.fill('取消后继续编辑')
  await expect(name).toHaveValue('取消后继续编辑')
})
