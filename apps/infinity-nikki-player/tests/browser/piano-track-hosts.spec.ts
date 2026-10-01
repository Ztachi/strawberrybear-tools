import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'

async function controlStyle(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      color: style.color,
      height: style.height,
      borderRadius: style.borderRadius,
      fontFamily: style.fontFamily,
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/piano-track-hosts.html')
  await expect(page.locator('.pr-track-toggle-host .ant-switch').first()).toBeVisible()
})

test('track controls inherit the same live antdv theme as sibling controls', async ({ page }) => {
  const trackSwitch = page.locator('.pr-track-toggle-host .ant-switch').first()
  const reference = page.getByTestId('reference-switch')
  await expect(page.locator('.pr-track-toggle')).toHaveCount(0)
  await expect(trackSwitch).toHaveAttribute('role', 'switch')
  await expect(trackSwitch).toHaveAttribute('aria-checked', 'true')
  expect(await controlStyle(trackSwitch)).toEqual(await controlStyle(reference))
  const original = await controlStyle(trackSwitch)
  await page.getByTestId('change-theme').click()
  await page.mouse.move(0, 0)
  await expect
    .poll(async () => (await controlStyle(trackSwitch)).background)
    .not.toBe(original.background)
  await expect
    .poll(async () => JSON.stringify(await controlStyle(trackSwitch)) === JSON.stringify(await controlStyle(reference)))
    .toBe(true)

  await trackSwitch.focus()
  await page.keyboard.press('Space')
  await expect(trackSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(trackSwitch).toBeFocused()
  await expect(page.getByTestId('selection')).toBeEmpty()
})

test('only overflowing track labels use the themed antdv Tooltip', async ({ page }) => {
  const labels = page.locator('.pr-track .piano-roll-track-name')
  await expect(labels.first()).not.toHaveAttribute('title')
  await labels.nth(1).hover()
  await page.waitForTimeout(250)
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await page.getByTestId('reference-tooltip').hover()
  const referencePopup = page.locator('.ant-tooltip-container').filter({ hasText: 'Reference tooltip' })
  await expect(referencePopup).toBeVisible()
  const reference = await controlStyle(referencePopup)
  await labels.first().hover()
  const trackPopup = page.locator('.ant-tooltip-container').filter({ hasText: 'メタルマックス' })
  await expect(trackPopup).toBeVisible()
  const actual = await controlStyle(trackPopup)
  expect({ ...actual, height: reference.height }).toEqual(reference)
  // antdv 在相邻触发器间复用 Tooltip 的浮层，截图前等待其文字切换动画完成。
  await page.waitForTimeout(350)
  await page.screenshot({ path: test.info().outputPath('piano-track-antd-context.png') })
})

test('virtual row and view cleanup remove their Vue hosts', async ({ page }) => {
  const firstName = page.locator('.pr-track .piano-roll-track-name').first()
  await expect(firstName).toContainText('メタルマックス')
  await page.locator('.pr-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(firstName).not.toContainText('メタルマックス')
  await expect(page.locator('.pr-track-toggle-host .ant-switch').first()).toBeVisible()
  await page.getByTestId('hide').click()
  await expect(page.getByTestId('label-host-count')).toHaveText('0')
  await expect(page.getByTestId('toggle-host-count')).toHaveText('0')
  await expect(page.locator('.pr-track-toggle-host .ant-switch')).toHaveCount(0)
})
