/** 更新界面只验收渲染与交互，不替代真实安装升级验收。 */
import { expect, test } from '@playwright/test'

test('真实关于弹窗使用官方版本接口，双语错误和恢复入口完整显示', async ({ page }) => {
  for (const locale of ['zh-CN', 'en-US']) {
    await page.goto(`/tests/browser/app-updater.html?about&scenario=error&locale=${locale}`)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('v1.2.0', { exact: true })).toBeVisible()
    await expect(
      dialog.getByRole('button', {
        name: locale === 'zh-CN' ? '导出诊断' : 'Export diagnostics',
        exact: true,
      })
    ).toBeInViewport()
    expect(await page.evaluate(() => window.updaterFixture.calls)).toContain('version')
  }
})

test('检查失败如实显示，并保留手动下载及导出入口', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?scenario=error')
  await expect(page.getByText('检查更新失败', { exact: true })).toBeVisible()
  await expect(page.getByText('未发现新版本', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '导出诊断', exact: true }).click()
  await page.getByRole('button', { name: '手动下载', exact: true }).click()
  expect(await page.evaluate(() => window.updaterFixture.calls)).toEqual([
    'export',
    'manual:github',
  ])
})
test('取消可恢复，下载后取消保存保留安装入口，重复点击不会再下载', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html')
  await page.getByRole('button', { name: '更新', exact: true }).last().click()
  await expect(page.getByText('30%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消下载', exact: true }).click()
  await page.getByRole('button', { name: '更新', exact: true }).last().click()
  await page.evaluate(() => window.updaterFixture.complete())
  await expect(page.getByText('下载与签名校验完成，可安装并重启')).toBeVisible()
  await page.getByRole('button', { name: '安装并重启', exact: true }).last().click()
  const calls = await page.evaluate(() => window.updaterFixture.calls)
  expect(calls.filter((call) => call === 'download')).toHaveLength(2)
  expect(calls).not.toContain('install')
})
test('未知总长度不伪造百分比，旧副本提示在中英文下均可见', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?scenario=unknownLength')
  await expect(page.getByText('加速线路 · 1.0 MB')).toBeVisible()
  await expect(page.locator('.ant-progress')).toHaveCount(0)
  for (const locale of ['zh-CN', 'en-US']) {
    await page.goto(`/tests/browser/app-updater.html?scenario=notApplied&locale=${locale}`)
    await expect(
      page
        .getByText(
          locale === 'zh-CN' ? '上次更新尚未生效' : 'Previous update has not taken effect',
          { exact: true }
        )
        .last()
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: locale === 'zh-CN' ? '导出诊断' : 'Export diagnostics',
        exact: true,
      })
    ).toBeInViewport()
  }
})
