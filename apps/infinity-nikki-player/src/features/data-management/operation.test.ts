import { afterEach, expect, it, vi } from 'vitest'
import {
  dataOperationLocked,
  finishDataOperation,
  prepareDataOperation,
  registerDataOperationGuard,
} from './operation'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  finishDataOperation()
})

it('准备时允许编辑器保存，全部通过后锁定到重启或失败释放', async () => {
  const prepare = vi.fn(async () => {
    expect(dataOperationLocked.value).toBe(false)
    return true
  })
  cleanups.push(registerDataOperationGuard(prepare))
  const first = prepareDataOperation()
  const duplicate = prepareDataOperation()
  expect(first).toBe(duplicate)
  expect(await first).toBe(true)
  expect(prepare).toHaveBeenCalledOnce()
  expect(dataOperationLocked.value).toBe(true)
  finishDataOperation()
  expect(await prepareDataOperation()).toBe(true)
})
it('任一编辑器取消后停止准备并释放界面', async () => {
  const later = vi.fn(async () => true)
  cleanups.push(
    registerDataOperationGuard(async () => false),
    registerDataOperationGuard(later)
  )
  expect(await prepareDataOperation()).toBe(false)
  expect(later).not.toHaveBeenCalled()
  expect(dataOperationLocked.value).toBe(false)
})
it('保存失败传播原因，解绑的页面不会再参与', async () => {
  const remove = registerDataOperationGuard(async () => {
    throw new Error('草稿落盘失败')
  })
  await expect(prepareDataOperation()).rejects.toThrow('草稿落盘失败')
  expect(dataOperationLocked.value).toBe(false)
  remove()
  expect(await prepareDataOperation()).toBe(true)
})
