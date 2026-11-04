/** 浏览器存储只处理明确属于本应用的草稿、界面偏好和可重建曲库缓存。 */
import { invoke } from '@tauri-apps/api/core'
import { useOnlineMidiLibraryStore } from '@/stores/onlineMidiLibrary'

const DRAFT_KEYS = [
  'infinity-nikki-player.template-draft.create',
  'infinity-nikki-player.new-template-draft',
]
const DRAFT_PREFIX = 'infinity-nikki-player.template-draft.edit.'
const UI_KEYS = [
  'infinity-nikki-player:piano-roll-zoom:v2',
  'infinity-nikki-player:piano-workspace:v1',
  'infinity-nikki-player:midi-editor-preferences:v1',
  'infinity-nikki-player:recording-preferences:v1',
  'infinity-nikki-player:snap-grid:v1:midi-editor',
  'infinity-nikki-player:snap-grid:v1:keyboard-recording',
  'infinity-nikki-player.template-page-size',
  'infinity-nikki-player.midi-project-page-size',
]
export function isTemplateDraftKey(key: string): boolean {
  return (
    DRAFT_KEYS.includes(key) || (key.startsWith(DRAFT_PREFIX) && key.length > DRAFT_PREFIX.length)
  )
}
export function captureTemplateDrafts(
  storage: Storage = window.localStorage
): Record<string, string> {
  const drafts: Record<string, string> = {}
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key && isTemplateDraftKey(key)) {
      const value = storage.getItem(key)
      if (value !== null) drafts[key] = value
    }
  }
  return drafts
}

/** 原生已校验归档，浏览器仍做键白名单校验，禁止恢复任意来源的存储键。 */
export function applyTemplateDrafts(
  drafts: Record<string, string>,
  storage: Storage = window.localStorage
): void {
  if (
    !drafts ||
    typeof drafts !== 'object' ||
    Array.isArray(drafts) ||
    Object.entries(drafts).some(
      ([key, value]) => !isTemplateDraftKey(key) || typeof value !== 'string'
    )
  ) {
    throw new Error('模板草稿备份包含无效内容')
  }
  const before = captureTemplateDrafts(storage)
  try {
    for (const key of Object.keys(before)) storage.removeItem(key)
    for (const [key, value] of Object.entries(drafts)) storage.setItem(key, value)
  } catch (error) {
    for (const key of Object.keys(captureTemplateDrafts(storage))) storage.removeItem(key)
    for (const [key, value] of Object.entries(before)) storage.setItem(key, value)
    throw error
  }
}

/** 必须在挂载编辑器前执行；失败不确认，原生恢复文件保留供下次重试。 */
export async function applyPendingTemplateDrafts(): Promise<void> {
  const pending = await invoke<Record<string, string> | null>('get_pending_template_drafts')
  if (pending === null || pending === undefined) return
  applyTemplateDrafts(pending)
  await invoke('acknowledge_template_drafts')
}

export function resetUiPreferences(storage: Storage = window.localStorage): void {
  for (const key of UI_KEYS) {
    storage.removeItem(key)
    // 同页的 VueUse 偏好也订阅标准存储事件，重置后立即同步到现有界面。
    if (typeof StorageEvent === 'function')
      window.dispatchEvent(
        new StorageEvent('storage', { key, newValue: null, storageArea: storage })
      )
  }
}
export async function clearOnlineLibraryCache(): Promise<void> {
  await useOnlineMidiLibraryStore().clearCache()
}
