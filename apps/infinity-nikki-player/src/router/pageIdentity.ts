import type { HistoryState, RouteLocationNormalizedLoaded } from 'vue-router'
import { getMainPageEntryKey } from './mainNavigation'

/**
 * 同一 MIDI 详情页切歌只替换数据，保留其独立窗口会话；离开该页面仍正常卸载。
 * MIDI 编辑器新建页首次保存后会 replace 到编辑路由，保持同一实例以免丢失试听与视口状态。
 */
export function mainPageIdentity(
  route: RouteLocationNormalizedLoaded,
  historyState: HistoryState = {}
): string {
  if (route.name === 'files-midi-detail') return 'files-midi-detail'
  if (route.name === 'midi-editor-create' || route.name === 'midi-editor-edit')
    return 'midi-editor-page'
  if (route.meta.keepAlive) {
    const entryKey = getMainPageEntryKey(historyState)
    if (entryKey) return `${route.fullPath}::${entryKey}`
  }
  return route.fullPath
}
