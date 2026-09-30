/** 更新界面只验收渲染与交互，不替代真实安装升级验收。 */
import { expect, test } from '@playwright/test'

test('首次未发布时显示未发现新版本，不误报检测失败', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about&scenario=unpublished')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '检查更新', exact: true }).click()
  await expect(dialog.getByText('未发现新版本', { exact: true })).toBeVisible()
  await expect(
    page.locator('.ant-notification').getByText('未发现新版本', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('检查更新失败', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => window.updaterFixture.calls)).toEqual(['version', 'check'])
})

test('小窗口只在分割线下滚动，更新入口和关闭按钮保持可见', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 720, height: 400 })
  await page.goto('/tests/browser/app-updater.html?about&scenario=error')
  const dialog = page.getByRole('dialog')
  const body = dialog.locator('.about-body')
  await expect(dialog.getByRole('button', { name: '检查更新', exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: '导出诊断', exact: true })).toBeInViewport()
  const before = await dialog
    .locator('.about-header')
    .evaluate((element) => (element as HTMLElement).offsetTop)
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0)
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(
    await dialog.locator('.about-header').evaluate((element) => (element as HTMLElement).offsetTop)
  ).toBe(before)
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(dialog.getByRole('button', { name: '检查更新', exact: true })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('about-update-compact.png') })
})

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
  await page.getByRole('button', { name: '检查更新', exact: true }).click()
  await expect(page.getByText('检查更新失败', { exact: true })).toBeVisible()
  await expect(page.locator('.ant-alert')).toHaveCount(0)
  await expect(page.locator('.ant-notification-bottomRight')).toBeVisible()
  await expect(page.getByText('未发现新版本', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '导出诊断', exact: true }).click()
  await page.getByRole('button', { name: '手动下载', exact: true }).click()
  expect(await page.evaluate(() => window.updaterFixture.calls)).toEqual([
    'check',
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

test('单一手动下载入口保留 GitHub 和加速线路选择', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '手动下载', exact: true }).click()
  await page.getByRole('menuitem', { name: '手动下载（加速）', exact: true }).click()
  expect(await page.evaluate(() => window.updaterFixture.calls)).toEqual([
    'version',
    'manual:mirror',
  ])
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
          locale === 'zh-CN'
            ? '上次目标为 1.2.1，当前运行 1.2.0。请重试或手动安装，并确认打开的是正确的安装目录。'
            : 'The target was 1.2.1; you are running 1.2.0. Retry or install manually, and check which installation you opened.',
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
