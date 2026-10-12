/** 录制操作偏好；选段、游标、按住状态与模板快照仍由当前录制会话管理。 */
import {
  preferenceNumber,
  preferenceValues,
  useUiPreferences,
} from '@/composables/useUiPreferences'
import { preferenceSnap } from '@/features/midi-editor/preferences'
import type { RecorderMode } from './types'

export function useRecordingPreferences() {
  return useUiPreferences('infinity-nikki-player:recording-preferences:v1', (value) => {
    const saved = preferenceValues(value)
    return {
      snap: preferenceSnap(saved.snap),
      mode: (saved.mode === 'replace' || saved.mode === 'overdub'
        ? saved.mode
        : 'append') as RecorderMode,
      countIn: saved.countIn === true,
      metronome: saved.metronome === true,
      accompaniment: saved.accompaniment === true,
      keyboardHeight: preferenceNumber(saved.keyboardHeight, 120, Number.MAX_SAFE_INTEGER) ?? 180,
    }
  })
}
