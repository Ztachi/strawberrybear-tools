import { expect, test } from '@playwright/test'

for (const list of [
  { name: 'MIDI 项目', query: 'list', row: '.project-table-row' },
  { name: '模板', query: 'templates', row: '.template-table-row' },
]) {
  test(`${list.name}列表仅在有选中项时显示批量导出`, async ({ page }) => {
    await page.goto(`/tests/browser/midi-editor-page.html?${list.query}=1`)
    const checkbox = page.locator(list.row).first().getByRole('checkbox')
    await expect(checkbox).toBeVisible()
    const batchExport = page.getByRole('button', { name: '批量导出', exact: true })
    await expect(batchExport).toHaveCount(0)
    await checkbox.check()
    await expect(batchExport).toBeVisible()
    await expect(batchExport).toBeEnabled()
    await checkbox.uncheck()
    await expect(batchExport).toHaveCount(0)
  })
}

for (const list of [
  { name: '歌曲管理', query: 'navigation' },
  { name: '歌单', query: 'playlist' },
]) {
  test(`${list.name}全选涵盖虚拟列表全部歌曲，并遵循搜索范围`, async ({ page }) => {
    await page.goto(`/tests/browser/midi-editor-page.html?${list.query}=1`)
    await expect(page.locator('.song-row').first()).toBeVisible()
    const selectAll = page.getByRole('button', { name: '全选', exact: true })
    const count = page.locator('.selected-count')
    await expect(selectAll).toHaveCount(0)
    await page.getByRole('button', { name: '批量', exact: true }).click()
    await expect(count).toHaveText('已选中 0 首')
    await expect(selectAll).toHaveClass(/ant-btn-link/)
    await selectAll.click()
    // 80 首远超首屏虚拟行数，全选不能只遍历当前渲染的元素。
    await expect(count).toHaveText('已选中 80 首')
    await page.locator('.song-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(page.locator('.song-row').last().getByRole('checkbox')).toBeChecked()
    await page.locator('.song-row').last().getByRole('checkbox').uncheck()
    await expect(count).toHaveText('已选中 79 首')
    await selectAll.click()
    await expect(count).toHaveText('已选中 80 首')

    await page.getByRole('button', { name: '退出批量', exact: true }).click()
    await expect(selectAll).toHaveCount(0)
    await page.getByRole('button', { name: '批量', exact: true }).click()
    await expect(count).toHaveText('已选中 0 首')
    const search = page.getByPlaceholder('搜索歌曲', { exact: true })
    await search.fill('导航测试歌曲 7')
    await selectAll.click()
    await expect(count).toHaveText('已选中 10 首')
    await search.fill('不存在的歌曲')
    await expect(count).toHaveText('已选中 0 首')
    await expect(selectAll).toBeDisabled()
  })
}
