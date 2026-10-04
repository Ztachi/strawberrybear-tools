import { expect, test } from '@playwright/test'

test('升级首次进入只显示本次区间，刷新后不重复，关于入口打开完整历史', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?notes=update')
  const update = page.getByRole('dialog', { name: '本次更新', exact: true })
  await expect(update).toBeVisible()
  await expect(update.getByRole('navigation').getByRole('link')).toHaveCount(3)
  await expect(update.getByRole('navigation').getByRole('link').first()).toHaveText(
    '1.3.1 2026-10-02'
  )
  await expect(update.getByText('1.1.4 2026-06-17', { exact: true })).toHaveCount(0)
  await update.getByRole('button', { name: /^关\s*闭$/ }).click()
  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => window.updaterFixture.showAbout())
  const about = page.locator('.about-modal-root')
  await expect(about.getByRole('button', { name: '更新日志', exact: true })).toHaveClass(
    /ant-btn-link/
  )
  const versionAlignment = await about.locator('.about-version-row').evaluate((element) => {
    const row = element.getBoundingClientRect()
    const version = element.querySelector('.version-update-trigger')!.getBoundingClientRect()
    const link = element.querySelector('.about-release-notes')!
    return {
      offset: Math.abs(version.x + version.width / 2 - row.x - row.width / 2),
      fontSize: getComputedStyle(link).fontSize,
    }
  })
  expect(versionAlignment.offset).toBeLessThanOrEqual(1)
  expect(versionAlignment.fontSize).toBe('12px')
  await about.getByRole('button', { name: '更新日志', exact: true }).click()
  const history = page.getByRole('dialog', { name: '更新日志', exact: true })
  await expect(history).toBeVisible()
  await expect(history.getByRole('navigation').getByRole('link')).toHaveCount(17)
  await expect(history.getByText('0.1.0 2026-04-17', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '本次更新', exact: true })).toHaveCount(0)
})

test('首次安装不弹公告，手动日志目录定位不增加导航历史，正文可复制', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?notes=first')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('fixture:release-notes-seen')))
    .toBe('1.3.1')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => window.updaterFixture.showAbout())
  await page.getByRole('button', { name: '更新日志', exact: true }).click()
  const history = page.getByRole('dialog', { name: '更新日志', exact: true })
  const url = page.url()
  const historyLength = await page.evaluate(() => window.history.length)
  await history.getByRole('link', { name: '1.0.0 2026-06-08', exact: true }).click()
  const content = history.locator('.section-document-content')
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(500)
  await expect(history.locator('[href="#release-note-v1_0_0"]')).toHaveClass(/title-active/)
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
  expect(
    await history
      .locator('#release-note-v1_0_0 li')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return (
          style.getPropertyValue('user-select') || style.getPropertyValue('-webkit-user-select')
        )
      })
  ).toBe('text')
})

test('右侧正文上下滚动时，左侧当前目录项平滑滚入可见区域', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 650 })
  await page.goto('/tests/browser/app-updater.html?notes=first')
  await page.evaluate(() => window.updaterFixture.showAbout())
  await page.getByRole('button', { name: '更新日志', exact: true }).click()
  const history = page.getByRole('dialog', { name: '更新日志', exact: true })
  const content = history.locator('.section-document-content')
  const contents = history.locator('aside')
  await expect(history).toHaveCSS('opacity', '1')
  // 只操作正文，不能借点击目录时浏览器自动定位来证明目录会跟随。
  await content.evaluate((element) => {
    const section = element.querySelector('#release-note-v0_2_2')!
    element.scrollTop +=
      section.getBoundingClientRect().top - element.getBoundingClientRect().top - 8
  })
  await expect(history.locator('[href="#release-note-v0_2_2"]')).toHaveClass(/title-active/)
  await expect.poll(() => contents.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  await expect
    .poll(() =>
      contents.evaluate((element) => {
        const item = element.querySelector('.ant-anchor-link-title-active')!.getBoundingClientRect()
        const viewport = element.getBoundingClientRect()
        return item.top >= viewport.top && item.bottom <= viewport.bottom
      })
    )
    .toBe(true)
  const previousTop = await contents.evaluate((element) => element.scrollTop)
  await content.evaluate((element) => {
    element.scrollTop = 0
  })
  await expect(history.locator('[href="#release-note-v1_3_1"]')).toHaveClass(/title-active/)
  await expect
    .poll(() => contents.evaluate((element) => element.scrollTop))
    .toBeLessThan(previousTop)
  await expect
    .poll(() =>
      contents.evaluate((element) => {
        const item = element.querySelector('.ant-anchor-link-title-active')!.getBoundingClientRect()
        const viewport = element.getBoundingClientRect()
        return item.top >= viewport.top && item.bottom <= viewport.bottom
      })
    )
    .toBe(true)
})

test('窄窗口与英文内容不截断，减少动态效果时最新圆点不扩散', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 480, height: 650 })
  await page.goto('/tests/browser/app-updater.html?notes=update&locale=en-US')
  const dialog = page.getByRole('dialog', { name: 'What’s New', exact: true })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'More flexible arrangements, safer drafts', exact: true })
  ).toBeVisible()
  await expect(dialog.locator('.release-note-dot-latest')).toHaveCount(1)
  expect(
    await dialog
      .locator('.release-note-dot-latest .release-note-ripple')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('none')
  await expect(dialog.locator('.release-note-ripple:visible')).toHaveCount(1)
  for (const selector of ['.section-document', '.section-document-content', 'aside']) {
    expect(
      await dialog
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true)
  }
})

test('最新版本的涟漪慢速连续扩散，时间线圆心及正文布局保持稳定', async ({ page }) => {
  await page.goto('/tests/browser/app-updater.html?notes=update')
  const dialog = page.getByRole('dialog', { name: '本次更新', exact: true })
  await expect(dialog).toBeVisible()
  const waves = dialog.locator('.release-note-dot-latest .release-note-ripple')
  await expect(waves).toHaveCount(3)
  // 用浏览器动画时间线查看发出第三圈后的状态，避免实际等待动画周期。
  const motion = await waves.evaluateAll((elements) =>
    elements.map((element) => {
      for (const animation of element.getAnimations()) {
        animation.pause()
        animation.currentTime = 3400
      }
      const style = getComputedStyle(element)
      return {
        name: style.animationName,
        transform: style.transform,
        opacity: Number(style.opacity),
      }
    })
  )
  for (const wave of motion) expect(wave.name).toMatch(/^release-note-ripple/)
  expect(new Set(motion.map((wave) => wave.transform)).size).toBe(3)
  expect(motion.every((wave) => wave.opacity > 0)).toBe(true)
  // 检查跨圈、跨周期的衔接，不能出现所有波纹一起淡出后的空档。
  const continuous = await waves.evaluateAll((elements) => {
    const samples: number[] = []
    for (let time = 4500; time <= 13500; time += 250) {
      for (const element of elements)
        for (const animation of element.getAnimations()) animation.currentTime = time
      samples.push(
        Math.max(...elements.map((element) => Number(getComputedStyle(element).opacity)))
      )
    }
    return samples
  })
  expect(continuous.every((opacity) => opacity > 0.1)).toBe(true)
  await waves.evaluateAll((elements) => {
    for (const element of elements)
      for (const animation of element.getAnimations()) animation.currentTime = 3400
  })
  await expect(dialog.locator('.release-note-dot-latest')).toHaveCSS('width', '8px')
  // 等框架弹窗完成入场再测量，不能把入场缩放混入圆点和轨道的几何判断。
  await expect(dialog).toHaveCSS('opacity', '1')
  await expect(dialog.getByRole('navigation').locator('.release-note-dot')).toHaveCount(0)
  await expect(dialog.locator('.section-document-content .release-note-dot')).toHaveCount(3)
  const alignment = await dialog
    .locator('.release-note')
    .first()
    .evaluate((element) => {
      const track = getComputedStyle(element, '::before')
      const section = element.getBoundingClientRect()
      const dot = element.querySelector('.release-note-dot')!.getBoundingClientRect()
      const nextDot = element
        .nextElementSibling!.querySelector('.release-note-dot')!
        .getBoundingClientRect()
      return {
        horizontal: Math.abs(
          section.left +
            parseFloat(track.left) +
            parseFloat(track.borderLeftWidth) / 2 -
            dot.left -
            dot.width / 2
        ),
        connection: Math.abs(
          section.bottom - parseFloat(track.bottom) - nextDot.top - nextDot.height / 2
        ),
      }
    })
  expect(alignment.horizontal).toBeLessThanOrEqual(1)
  expect(alignment.connection).toBeLessThanOrEqual(1)
  await page.mouse.move(0, 0)
  await dialog.screenshot({ path: 'test-results/release-notes.png' })
})
