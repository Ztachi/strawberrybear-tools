<script setup lang="ts">
/** 录制打开服务：宿主只提供初值与结果回调，弹窗内部拥有录制业务。 */
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from 'antdv-next'
import { Circle } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { createProject, type EditorSessionState, type MidiProject } from '@strawberrybear/midi-editor'
import type { KeyTemplate } from '@/types'
import { recordingRevision } from '@/features/midi-recording/coordinator'
import { createRecorderAudio } from '@/features/midi-recording/audio'
import type { TrackRecorderInput, TrackRecorderResult, TrackRecorderServices } from '@/features/midi-recording/types'
import TrackRecorderDialog from './TrackRecorderDialog/index.vue'
import { feedback } from '@/lib/feedback'
import { uniqueProjectName } from '@/features/midi-editor/projectIo'

const props = defineProps<{
  state: EditorSessionState
  templates: readonly KeyTemplate[]
  templateId: string | null
  trackId?: string | null
  positionSeconds?: number
  fps?: number
  speed?: number
  disabled?: boolean
  autoOpen?: boolean
  prepareExternal: () => Promise<void>
  // eslint-disable-next-line no-unused-vars -- Vue ESLint 将类型签名的参数误识别为变量。
  applyResult(result: TrackRecorderResult): Promise<void>
  // eslint-disable-next-line no-unused-vars -- 同上，仅为回调类型。
  recoverCopy?(project: MidiProject): Promise<void>
}>()
const emit = defineEmits<{ lock: [locked: boolean] }>()
const { t } = useI18n()
const input = shallowRef<TrackRecorderInput | null>(null)
const services = shallowRef<TrackRecorderServices | null>(null)
const dialog = ref<InstanceType<typeof TrackRecorderDialog> | null>(null)
const opening = ref(false)
const audioFactory = inject<typeof createRecorderAudio>('track-recorder-audio-factory', createRecorderAudio)
const isOpen = computed(() => opening.value || !!input.value)
let disposed = false
async function openTrackRecorder(): Promise<void> {
  if (isOpen.value || props.disabled) return
  opening.value = true; emit('lock', true)
  try {
    await props.prepareExternal()
    if (disposed) return
    const project = JSON.parse(JSON.stringify(props.state.project)) as MidiProject
    const track = project.document.tracks.find(item => item.id === props.trackId) ?? project.document.tracks[0]
    if (!track) throw new Error('No recording track')
    const { clipNoteToTrackRegion, createTimeline } = await import('@strawberrybear/piano-roll/core')
    const selected = project.document.notes.flatMap(note => {
      const visible = note.trackId === track.id && props.state.selection.has(note.id) ? clipNoteToTrackRegion(note, track) : null
      return visible ? [visible] : []
    })
    services.value = {
      audio: audioFactory(track.id),
      loadDraft: key => invoke('load_midi_project_draft', { key }),
      saveDraft: (key, project) => invoke('save_midi_project_draft', { key, project }),
      deleteDraft: key => invoke('delete_midi_project_draft', { key }),
      apply: result => props.applyResult(result),
      recoverCopy: async project => {
        if (props.recoverCopy) { await props.recoverCopy(project); return }
        const existing = await invoke<{ name: string }[]>('get_midi_projects')
        const extensions = { ...project.extensions }
        delete extensions.recordingDraft
        await invoke('save_midi_project', { project: { ...createProject({ document: project.document, extensions, name: uniqueProjectName(t('recording.copyName', { name: project.name }), new Set(existing.map(item => item.name)), project.name) }), loop: project.loop } })
      },
    }
    input.value = {
      project, trackId: track.id, startTick: Math.max(track.startTick ?? 0, Math.round(createTimeline(project.document).secondsToTick(props.positionSeconds ?? 0))),
      range: selected.length ? { startTick: Math.min(...selected.map(note => note.startTick)), endTick: Math.max(...selected.map(note => note.endTick)) } : project.loop ?? undefined,
      templates: JSON.parse(JSON.stringify(props.templates)), templateId: props.templateId,
      baseRevision: await recordingRevision(project), fps: props.fps, speed: props.speed,
    }
  } catch (cause) {
    input.value = null; emit('lock', false)
    feedback.error(t('recording.operationFailed'), { description: String(cause) })
  } finally { opening.value = false }
}
function closed(): void { input.value = null; services.value = null; emit('lock', false) }
onMounted(() => { if (props.autoOpen) void openTrackRecorder() })
onBeforeUnmount(() => { disposed = true; emit('lock', false) })
defineExpose({ openTrackRecorder, close: () => dialog.value?.close(), checkpoint: () => dialog.value?.checkpoint(), pause: () => dialog.value?.pause(), isOpen })
</script>
<template>
  <Button size="small" :disabled="disabled || isOpen" :loading="opening" @click="openTrackRecorder">
    <template #icon>
      <Circle class="size-4" :stroke-width="2" /> </template
    >{{ t('recording.launch') }}
  </Button>
  <TrackRecorderDialog
    v-if="input && services"
    ref="dialog"
    :input="input"
    :services="services"
    @closed="closed"
  />
</template>
