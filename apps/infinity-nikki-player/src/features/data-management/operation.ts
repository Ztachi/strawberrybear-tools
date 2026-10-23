/** 资料替换单独管理参与者与界面锁，复用编辑器保存能力而不触发退出或安装流程。 */
import { readonly, ref } from 'vue'

const participants = new Set<() => Promise<boolean>>()
const locked = ref(false)
const preparing = ref(false)
let pending: Promise<boolean> | undefined
export const dataOperationLocked = readonly(locked)
export const dataOperationPreparing = readonly(preparing)

export function registerDataOperationGuard(prepare: () => Promise<boolean>): () => void {
  participants.add(prepare)
  return () => {
    participants.delete(prepare)
  }
}

/** 成功后保持锁直至重启；提交失败由调用方显式结束，防止旧编辑器抢先写回。 */
export function prepareDataOperation(): Promise<boolean> {
  if (pending) return pending
  if (locked.value) return Promise.resolve(false)
  preparing.value = true
  pending = Promise.resolve().then(async () => {
    try {
      for (const prepare of Array.from(participants)) {
        if (!(await prepare())) return false
      }
      locked.value = true
      return true
    } catch (error) {
      locked.value = false
      throw error
    } finally {
      pending = undefined
      preparing.value = false
    }
  })
  return pending
}

export function finishDataOperation(): void {
  locked.value = false
}
