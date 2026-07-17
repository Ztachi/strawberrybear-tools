import { expect, test } from '@playwright/test'

test('主页到游戏页并可暂停', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '萌园园上岗日' })).toBeVisible()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page).toHaveURL(/\/game/)
  await page.getByRole('button', { name: '知道了，开始上班' }).click()
  await page.waitForTimeout(3200)
  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('dialog', { name: '游戏已暂停' })).toBeVisible()
})

test('设置可持久化统一静音', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByLabel('声音关闭').check()
  await page.getByRole('button', { name: '关闭' }).click()
  await page.reload()
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByLabel('声音关闭')).toBeChecked()
})
