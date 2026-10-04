/** @fileOverview 更新日志的原生适配，范围比较与已读版本持久化由 Rust 负责。 */
import { invoke } from '@tauri-apps/api/core'
import type { ReleaseNotesAdapter, ReleaseNotesLaunch } from '@/features/release-notes/controller'

export const tauriReleaseNotes: ReleaseNotesAdapter = {
  load: () => invoke<ReleaseNotesLaunch>('get_release_notes_launch'),
  acknowledge: () => invoke<void>('acknowledge_release_notes'),
}
