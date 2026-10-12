/** 卷帘布局是全局 UI 偏好；音轨、滚动位置与音乐选区只属于当前会话及窗口迁移。 */
import { preferenceNumber, preferenceValues, useUiPreferences } from './useUiPreferences'

export function usePianoWorkspacePreferences(editing: boolean) {
  return useUiPreferences('infinity-nikki-player:piano-workspace:v1', (value) => {
    const saved = preferenceValues(value)
    return {
      hideEmptyTracks:
        typeof saved.hideEmptyTracks === 'boolean' ? saved.hideEmptyTracks : !editing,
      showOtherTracks: typeof saved.showOtherTracks === 'boolean' ? saved.showOtherTracks : true,
      editorHeight: preferenceNumber(saved.editorHeight, 25, 82) ?? (editing ? 70 : 55),
    }
  })
}
