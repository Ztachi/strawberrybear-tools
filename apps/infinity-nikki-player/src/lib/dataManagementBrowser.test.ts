import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyPendingTemplateDrafts,
  applyTemplateDrafts,
  captureTemplateDrafts,
  resetUiPreferences,
} from './dataManagementBrowser'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
function storage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => entries.clear(),
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('资料备份的浏览器存储边界', () => {
  it('只收集模板草稿，保留界面配置及设备身份', () => {
    const backend = storage()
    backend.setItem('infinity-nikki-player.template-draft.create', '{"name":"草稿"}')
    backend.setItem('infinity-nikki-player.template-draft.edit.模板', '{}')
    backend.setItem('infinity-nikki-player.template-draft.edit.', '无效槽位')
    backend.setItem('device-identity', '本机身份')
    expect(Object.keys(captureTemplateDrafts(backend))).toEqual([
      'infinity-nikki-player.template-draft.create',
      'infinity-nikki-player.template-draft.edit.模板',
    ])
    applyTemplateDrafts({}, backend)
    expect(backend.getItem('device-identity')).toBe('本机身份')
    expect(captureTemplateDrafts(backend)).toEqual({})
  })
  it('拒绝归档中的任意存储键，失败不清理现有草稿', () => {
    const backend = storage()
    backend.setItem('infinity-nikki-player.template-draft.create', '原草稿')
    expect(() => applyTemplateDrafts({ 'unrelated-key': '内容' }, backend)).toThrow('无效内容')
    expect(backend.getItem('infinity-nikki-player.template-draft.create')).toBe('原草稿')
  })
  it('界面重置只处理固定偏好键，保留作品草稿和其他应用数据', () => {
    const backend = storage()
    backend.setItem('infinity-nikki-player:piano-workspace:v1', '{}')
    backend.setItem('infinity-nikki-player:snap-grid:v1:keyboard-recording', '{}')
    backend.setItem('infinity-nikki-player.template-draft.create', '原草稿')
    backend.setItem('other-app', '保留')
    resetUiPreferences(backend)
    expect(backend.getItem('infinity-nikki-player:piano-workspace:v1')).toBeNull()
    expect(backend.getItem('infinity-nikki-player:snap-grid:v1:keyboard-recording')).toBeNull()
    expect(backend.getItem('infinity-nikki-player.template-draft.create')).toBe('原草稿')
    expect(backend.getItem('other-app')).toBe('保留')
  })
  it('恢复草稿必须在应用成功后才确认原生待恢复记录', async () => {
    const backend = storage()
    vi.stubGlobal('window', { localStorage: backend })
    vi.mocked(invoke)
      .mockResolvedValueOnce({ 'infinity-nikki-player.template-draft.create': '恢复草稿' })
      .mockResolvedValueOnce(undefined)
    await applyPendingTemplateDrafts()
    expect(backend.getItem('infinity-nikki-player.template-draft.create')).toBe('恢复草稿')
    expect(vi.mocked(invoke).mock.calls.map((call) => call[0])).toEqual([
      'get_pending_template_drafts',
      'acknowledge_template_drafts',
    ])
  })
})
