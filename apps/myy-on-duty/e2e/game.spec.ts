import { expect, test } from '@playwright/test'
import { BOARD } from '../src/config/board'

test('资源加载后可进入游戏并暂停', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page).toHaveURL(/\/game/)
  await page.getByRole('button', { name: '知道了，开始上班', exact: true }).click()
  await expect(page.getByRole('button', { name: '长按发射', exact: true })).toBeVisible({
    timeout: 5000,
  })
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '游戏已暂停' })).toBeVisible()
})

test('暂停存档返回主页后可以继续', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('button', { name: '知道了，开始上班', exact: true }).click()
  await expect(page.getByRole('button', { name: '长按发射', exact: true })).toBeVisible({
    timeout: 5000,
  })
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '返回主页', exact: true }).click()
  const continueButton = page.getByRole('button', { name: /继续游戏/ })
  await expect(continueButton).toBeEnabled()
  await expect(continueButton).toContainText('已进行')
  await continueButton.click()
  await expect(page.getByRole('dialog', { name: '游戏已暂停' })).toBeVisible()
})

test('设置可持久化静音、语言和 PC 按键', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('声音关闭', { exact: true }).check()
  const leftKeyButton = page.getByRole('button', { name: '修改左拍板按键', exact: true })
  if (testInfo.project.name === 'mobile') {
    await expect(leftKeyButton).toBeDisabled()
  } else {
    await leftKeyButton.click()
    await page.keyboard.press('KeyQ')
  }
  await page.getByLabel('语言', { exact: true }).selectOption('en-US')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start Game', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Mute Audio', { exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Change key for Left Flipper' })).toContainText(
    testInfo.project.name === 'mobile' ? 'A' : 'Q'
  )
})

test('390×844 竖屏无横向溢出且主要操作可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
  ).toEqual({ clientWidth: 390, scrollWidth: 390 })
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('button', { name: '知道了，开始上班', exact: true }).click()
  await expect(page.getByRole('button', { name: '长按发射', exact: true })).toBeVisible({
    timeout: 5000,
  })
  const launchBox = await page.getByRole('button', { name: '长按发射', exact: true }).boundingBox()
  const hudBox = await page.locator('.game-hud').boundingBox()
  const fieldBox = await page.locator('.playfield-shell').boundingBox()
  const controlsBox = await page.locator('.game-controls').boundingBox()
  expect(launchBox).not.toBeNull()
  expect(hudBox).not.toBeNull()
  expect(fieldBox).not.toBeNull()
  expect(controlsBox).not.toBeNull()
  expect((launchBox?.x ?? 0) + (launchBox?.width ?? 0)).toBeLessThanOrEqual(390)
  expect((hudBox?.y ?? 0) + (hudBox?.height ?? 0)).toBeLessThanOrEqual(fieldBox?.y ?? 0)
  expect((fieldBox?.y ?? 0) + (fieldBox?.height ?? 0)).toBeLessThanOrEqual(controlsBox?.y ?? 0)
})

test('弱蓄力会回到弹簧且允许重新发射', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('button', { name: '知道了，开始上班', exact: true }).click()
  const launchButton = page.getByRole('button', { name: '长按发射', exact: true })
  await expect(launchButton).toBeVisible({ timeout: 5000 })
  await page.keyboard.down('Space')
  await page.waitForTimeout(120)
  await page.keyboard.up('Space')
  await expect(page.locator('main.game-page')).toHaveAttribute('data-launch-state', 'ready', {
    timeout: 8000,
  })
  await expect(launchButton).toBeVisible()
})

test('长按 Space 成功进入主台面后开始计时', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('button', { name: '知道了，开始上班', exact: true }).click()
  await expect(page.getByRole('button', { name: '长按发射', exact: true })).toBeVisible({
    timeout: 5000,
  })
  await page.keyboard.down('Space')
  await page.waitForTimeout(1300)
  await page.keyboard.up('Space')
  const gamePage = page.locator('main.game-page')
  await expect(gamePage).toHaveAttribute('data-launch-state', 'entered', { timeout: 8000 })
  await expect(gamePage).toHaveAttribute('data-phase', 'playing')
  await expect(page.getByText('00:00', { exact: true })).toHaveCount(0, { timeout: 3000 })

  // 长按右拍板覆盖旧版会持续整圈旋转的操作路径；角度收敛由物理单测精确约束。
  await page.keyboard.down('KeyL')
  await page.waitForTimeout(2000)
  await expect(gamePage).toHaveAttribute('data-phase', 'playing')
  await page.keyboard.up('KeyL')
})

test('持续操作时上半台面不会把球永久托在线条上', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/game?mode=new&debug=1')
  await page.getByRole('button', { name: '知道了，开始上班', exact: true }).click()
  const gamePage = page.locator('main.game-page')
  await expect(page.getByRole('button', { name: '长按发射', exact: true })).toBeVisible({
    timeout: 5000,
  })
  await page.keyboard.down('Space')
  await page.waitForTimeout(1300)
  await page.keyboard.up('Space')
  await expect(gamePage).toHaveAttribute('data-launch-state', 'entered', { timeout: 8000 })

  let previous: { x: number; y: number } | null = null
  let stationaryMs = 0
  let observedPlayingMs = 0
  const trajectory: Array<{ t: number; x: number; y: number; speed: number }> = []
  for (let index = 0; index < 80; index += 1) {
    const state = await gamePage.evaluate((element) => ({
      phase: element.dataset.phase,
      x: Number(element.dataset.ballX),
      y: Number(element.dataset.ballY),
      speed: Number(element.dataset.ballSpeed),
    }))
    const { phase, x, y, speed } = state
    if (phase === 'ending' || phase === 'ended') break
    trajectory.push({ t: observedPlayingMs, x, y, speed })

    // 像真人一样观察球位：进入下半场后抬起球所在一侧的拍板，而非盲目交替乱按。
    if (y > 760) {
      const centerX = (BOARD.flippers.left.x + BOARD.flippers.right.x) / 2
      const key = x < centerX ? 'KeyA' : 'KeyL'
      await page.keyboard.down(key)
      await page.waitForTimeout(70)
      await page.keyboard.up(key)
      await page.waitForTimeout(30)
    } else {
      await page.waitForTimeout(100)
    }
    observedPlayingMs += 100
    if (previous && y < 900 && Math.hypot(x - previous.x, y - previous.y) < 3 && speed < 0.5) {
      stationaryMs += 100
    } else {
      stationaryMs = 0
    }
    expect(stationaryMs).toBeLessThan(2250)
    previous = { x, y }
  }

  expect(observedPlayingMs, JSON.stringify(trajectory)).toBeGreaterThanOrEqual(8000)
})
