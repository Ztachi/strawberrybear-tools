import type { RouteLocationNormalizedLoaded } from 'vue-router'

/** 同一 MIDI 详情页切歌只替换数据，保留其独立窗口会话；离开该页面仍正常卸载。 */
export function mainPageIdentity(route: RouteLocationNormalizedLoaded): string {
  return route.name === 'files-midi-detail' ? 'files-midi-detail' : route.fullPath
}
