/** 可复用的 UI 偏好入口；由使用处声明固定配置键及字段，不进入文档、草稿或撤销历史。 */
import { ref, type Ref } from 'vue'
import { useEventListener, useStorage } from '@vueuse/core'

export function preferenceValues(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function preferenceNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined
}

/** 全局 UI 配置只用固定键；VueUse 管理即时写入和窗口同步，白名单解析兼容损坏与旧值。 */
export function useUiPreferences<T extends object>(
  key: string,
  normalize: (value: unknown) => T
): Ref<T> {
  let storage: Storage | undefined
  try {
    storage = typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    /* 偏好存储不可用时仍可操作当前界面。 */
  }
  if (!storage) return ref(normalize(undefined)) as Ref<T>
  const browser = typeof window.dispatchEvent === 'function' ? window : undefined
  const parse = (raw: string | null) => {
    try {
      return normalize(raw === null ? undefined : JSON.parse(raw))
    } catch {
      return normalize(undefined)
    }
  }
  let receiving = false
  const preferences = useStorage(key, normalize(undefined), storage, {
    window: browser,
    writeDefaults: false,
    flush: 'sync',
    // VueUse 原监听在自身写入事件后暂停到 nextTick，会遗漏同一帧的第二项偏好。
    listenToStorageChanges: false,
    eventFilter: (invoke) => {
      if (!receiving) return invoke()
    },
    serializer: {
      read: parse,
      write: (value) => JSON.stringify(normalize(value)),
    },
    onError: () => {},
  }) as Ref<T>
  if (browser)
    useEventListener(browser, 'storage', (event) => {
      if (event.storageArea !== storage || (event.key !== null && event.key !== key)) return
      const next = parse(event.newValue)
      if (JSON.stringify(next) === JSON.stringify(normalize(preferences.value))) return
      // 同步外部值时不回写；自身事件相同则跳过，连续本地修改仍立即逐项保存。
      receiving = true
      try {
        preferences.value = next
      } finally {
        receiving = false
      }
    })
  return preferences
}
