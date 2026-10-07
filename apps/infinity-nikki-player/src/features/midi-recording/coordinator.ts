/** 宿主结果协调：先验证并保存候选草稿，再一次性写入主会话。 */
import { createEditorSession } from '@strawberrybear/midi-editor'
import type { EditorAction, MidiProject } from '@strawberrybear/midi-editor'
import type { TrackRecorderResult } from './types'

export async function recordingRevision(project: MidiProject): Promise<string> {
  const data = new TextEncoder().encode(
    JSON.stringify([project.id, project.name, project.document, project.extensions, project.loop])
  )
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export async function applyRecorderResult(
  current: () => MidiProject,
  dispatch: (action: EditorAction) => void,
  persist: (project: MidiProject) => Promise<void>,
  result: TrackRecorderResult
): Promise<void> {
  const project = current()
  if (
    project.id !== result.projectId ||
    (await recordingRevision(project)) !== result.baseRevision ||
    !project.document.tracks.some((t) => t.id === result.trackId)
  )
    throw new Error('stale-recording-result')
  const extensions = { ...project.extensions, keyboardRecording: { template: result.template } }
  delete (extensions as Record<string, unknown>).recordingDraft
  const action: EditorAction = {
    type: 'apply-track-edit',
    trackId: result.trackId,
    notes: result.notes,
    endTick: result.endTick,
    extensions,
  }
  const candidate = createEditorSession(project)
  candidate.dispatch(action)
  if (!candidate.getState().canUndo) throw new Error('invalid-recording-result')
  await persist(candidate.toProject())
  if ((await recordingRevision(current())) !== result.baseRevision)
    throw new Error('stale-recording-result')
  dispatch(action)
}

/** 固定长度文件安全键，与普通编辑草稿完全隔离。 */
export async function recorderDraftKey(projectId: string, trackId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${projectId}:${trackId}`)
  )
  return `recording-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
