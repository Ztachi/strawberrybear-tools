/** 关于页使用稳定版本入口，更新反馈交由全局通知。 */
import { expect, test } from '@playwright/test'

test('未发布版本的检查结果仅在全局通知显示', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about&scenario=unpublished')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '检测更新', exact: true }).click()
  await expect(
    page.locator('.ant-notification').getByText('未发现新版本', { exact: true })
  ).toBeVisible()
  await expect(dialog.getByText('未发现新版本', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('v1.2.0', { exact: true })).toBeVisible()
  await dialog.locator('.version-update-trigger').hover()
  await expect(page.getByRole('tooltip')).toHaveText('检测更新')
  expect(await page.evaluate(() => window.updaterFixture.calls)).toEqual(['version', 'check'])
})

test('小窗口更新入口固定，滚动后可访问底部次要操作', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 720, height: 400 })
  await page.goto('/tests/browser/app-updater.html?about&scenario=error')
  const dialog = page.getByRole('dialog')
  const body = dialog.locator('.about-body')
  await expect(dialog.getByRole('button', { name: '检测更新', exact: true })).toBeInViewport()
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(dialog.getByRole('button', { name: '检测更新', exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '导出诊断', exact: true })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('about-update-compact.png') })
})

test('双语次要操作并列，移除手动下载与提示行', async ({ page }) => {
  for (const locale of ['zh-CN', 'en-US']) {
    await page.goto(`/tests/browser/app-updater.html?about&scenario=error&locale=${locale}`)
    const dialog = page.getByRole('dialog')
    const actions = dialog.locator('.about-actions')
    await expect(actions.getByRole('button')).toHaveCount(2)
    const exportButton = actions.getByRole('button', {
      name: locale === 'zh-CN' ? '导出诊断' : 'Export diagnostics',
      exact: true,
    })
    await expect(exportButton).toBeVisible()
    await expect(
      dialog.getByRole('button', {
        name: locale === 'zh-CN' ? '手动下载' : 'Manual download',
        exact: true,
      })
    ).toHaveCount(0)
    await exportButton.click()
    expect(await page.evaluate(() => window.updaterFixture.calls)).toEqual(['version', 'export'])
  }
})

test('检查失败使用全局通知，版本文字与按钮保持不变', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about&scenario=error')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '检测更新', exact: true }).click()
  await expect(
    page.locator('.ant-notification').getByText('检查更新失败', { exact: true })
  ).toBeVisible()
  await expect(dialog.getByText('v1.2.0', { exact: true })).toBeVisible()
  await expect(dialog.locator('.ant-alert, .ant-progress')).toHaveCount(0)
})

test('下载中图标旋转置灰，动态操作文案只在 Tooltip 显示', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about')
  const dialog = page.getByRole('dialog')
  const button = dialog.getByRole('button', { name: '检测更新', exact: true })
  await dialog.locator('.version-update-trigger').hover()
  await expect(page.getByRole('tooltip')).toHaveText('更新')
  await button.click()
  await expect(button).toBeDisabled()
  const icon = button.locator('.icon-rotation-spinning')
  await expect(icon).toHaveCount(1)
  // 用旋转前后的实际屏幕位置验收，不能仅检查 transform-origin 声明。
  const drift = await icon.evaluate((element) => {
    const target = element as HTMLElement
    const center = () => {
      const rect = target.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    target.style.animation = 'none'
    target.style.transform = 'rotate(0deg)'
    const before = center()
    target.style.transform = 'rotate(180deg)'
    const after = center()
    target.style.removeProperty('animation')
    target.style.removeProperty('transform')
    return Math.hypot(after.x - before.x, after.y - before.y)
  })
  expect(drift).toBeLessThan(0.1)
  await expect(button).toHaveText('v1.2.0')
  await dialog.locator('.version-update-trigger').hover()
  await expect(page.getByRole('tooltip')).toHaveText('下载中')
  await page.evaluate(() => window.updaterFixture.complete())
  await expect(button).toBeEnabled()
  await dialog.locator('.version-update-trigger').hover()
  await expect(page.getByRole('tooltip')).toContainText('安装并重启')
  await button.click()
  const calls = await page.evaluate(() => window.updaterFixture.calls)
  expect(calls.filter((call) => call === 'download')).toHaveLength(1)
  expect(calls).not.toContain('install')
})

test('检测中提示只显示当前状态，标题栏刷新围绕同一画布中心旋转', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about&scenario=checking')
  const dialog = page.getByRole('dialog')
  await dialog.locator('.version-update-trigger').hover()
  await expect(page.getByRole('tooltip')).toHaveText('检测中')
  await expect(dialog.getByRole('button', { name: '检测更新', exact: true })).toBeDisabled()
  await dialog.locator('.ant-modal-close').click()
  const refresh = page.locator('.header-nav-refresh')
  await refresh.hover()
  await expect(refresh.locator('.icon-rotation')).toHaveCSS(
    'transform',
    'matrix(-1, 0, 0, -1, 0, 0)'
  )
  await expect(refresh.locator('svg')).toHaveCSS('transform', 'none')
})

test('刷新、帮助更新和顶部更新的实际图案中心在旋转时保持固定', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?about&scenario=unknownLength')
  await expect(page.getByRole('dialog')).toBeVisible()
  // 去掉弹窗入场变换，测量图案本身，不把进入动画位移混入图标旋转。
  await page.getByRole('dialog').evaluate((element) => {
    const dialog = element as HTMLElement
    dialog.style.animation = 'none'
    dialog.style.transform = 'none'
  })
  const centers = await page.locator('.icon-rotation').evaluateAll((elements) =>
    elements.map((element) => {
      const frame = element as HTMLElement
      frame.style.animation = 'none'
      frame.style.transition = 'none'
      const positions = [0, 90, 180, 270].map((angle) => {
        frame.style.transform = `rotate(${angle}deg)`
        // path 的屏幕边界包含 SVG 实际绘制位置，不能只检查外层容器中心。
        const paths = Array.from(frame.querySelectorAll('path')).map((path) =>
          path.getBoundingClientRect()
        )
        const left = Math.min(...paths.map((rect) => rect.left))
        const right = Math.max(...paths.map((rect) => rect.right))
        const top = Math.min(...paths.map((rect) => rect.top))
        const bottom = Math.max(...paths.map((rect) => rect.bottom))
        const rect = frame.getBoundingClientRect()
        return {
          x: (left + right) / 2,
          y: (top + bottom) / 2,
          offset: Math.hypot(
            (left + right - rect.left - rect.right) / 2,
            (top + bottom - rect.top - rect.bottom) / 2
          ),
        }
      })
      frame.style.removeProperty('animation')
      frame.style.removeProperty('transition')
      frame.style.removeProperty('transform')
      return positions
    })
  )
  expect(centers).toHaveLength(3)
  for (const positions of centers) {
    for (const point of positions) {
      expect(point.offset).toBeLessThan(0.1)
      expect(Math.hypot(point.x - positions[0]!.x, point.y - positions[0]!.y)).toBeLessThan(0.1)
    }
  }
})
