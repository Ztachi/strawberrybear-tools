/** MIDI 编辑偏好与项目内容独立；主窗口拥有编辑会话，独立窗口仍通过宿主更新。 */
import { computed } from 'vue'
import { SNAP_RESOLUTIONS, type EditorTool, type SnapResolution } from '@strawberrybear/midi-editor'
import { preferenceValues, useUiPreferences } from '@/composables/useUiPreferences'

export function preferenceSnap(value: unknown): SnapResolution {
  return SNAP_RESOLUTIONS.includes(value as SnapResolution) ? (value as SnapResolution) : '1/16'
}

export function useMidiEditorPreferences() {
  const preferences = useUiPreferences(
    'infinity-nikki-player:midi-editor-preferences:v1',
    (value) => {
      const saved = preferenceValues(value)
      return {
        snap: preferenceSnap(saved.snap),
        tool: (saved.tool === 'draw' ? 'draw' : 'select') as EditorTool,
        showVelocity: saved.showVelocity === true,
        dimUnplayable: saved.dimUnplayable === true,
      }
    }
  )
  const option = (key: 'showVelocity' | 'dimUnplayable') =>
    computed({
      get: () => preferences.value[key],
      set: (value: boolean) => {
        preferences.value = { ...preferences.value, [key]: value }
      },
    })
  return {
    preferences,
    showVelocity: option('showVelocity'),
    dimUnplayable: option('dimUnplayable'),
  }
}
