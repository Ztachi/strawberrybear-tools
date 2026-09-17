<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, nextTick, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { App as AntApp, ConfigProvider, Spin } from 'antdv-next'
import type { PianoRollTransport, PianoRollView } from '@strawberrybear/piano-roll/browser'
import PianoWorkspace from '@/components/PianoWorkspace/PianoWorkspace.vue'
import { createTimeline } from '@strawberrybear/piano-roll/core'
import PlayerSongTitle from '@/components/PlayerSongTitle.vue'
import PreviewPlaybackControls from '@/components/PreviewPlayer/PreviewPlaybackControls.vue'
import WindowTitleBar from '@/components/WindowTitleBar/WindowTitleBar.vue'
import type { PreviewControlState } from '@/features/player/previewControls'
import { getAntdvLocale, isSupportedLocale } from '@/i18n'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import { createPianoEditorClientPort } from '@/platform/tauri/pianoEditorWindow'
import {
  EDITOR_CLIENT_PORT,
  PianoPresentationClock,
  presentationNow,
  type PianoWorkspaceState,
  type EditorClientPort,
  type EditorCommand,
  type EditorPresentation,
} from '@/features/piano-editor'

const { locale, t } = useI18n()
const port =
  inject<EditorClientPort | undefined>(EDITOR_CLIENT_PORT, undefined) ??
  createPianoEditorClientPort()
const session = new URLSearchParams(location.search).get('session') ?? ''
const state = shallowRef<EditorPresentation>()
const playback = shallowRef<PreviewControlState>({ mediaId: null, isPlaying: false, isPaused: false, mode: 'sequential', error: '' })
const transport = shallowRef<PianoRollTransport>({
  positionSeconds: 0,
  isPlaying: false,
  playbackRate: 1,
})
const restore = shallowRef<PianoWorkspaceState>()
const panel = ref<{
  getState: () => PianoWorkspaceState
  setTransport: PianoRollView['setTransport']
} | null>(null)
const error = ref('')
const loading = ref(false)
let pendingViewport: PianoWorkspaceState | undefined
let viewportTimer: ReturnType<typeof setTimeout> | undefined
function queueViewport(value: PianoWorkspaceState): void {
  if (loading.value) return
  pendingViewport = value
  viewportTimer ??= setTimeout(() => {
    viewportTimer = undefined
    if (pendingViewport) void send({ kind: 'viewport', viewport: pendingViewport })
    pendingViewport = undefined
  }, 100)
}

const clock = new PianoPresentationClock()
let duration = 0
let frame = 0
function paint(): void {
  if (!active) return
  panel.value?.setTransport(clock.read(presentationNow(), duration))
  frame = requestAnimationFrame(paint)
}

const configLocale = computed(() => getAntdvLocale(locale.value))
let revision = -1
let sequence = 0
let received = 0
let active = true
let shown = false
let lastContact = Date.now()
let sending = Promise.resolve()
const cleanups: (() => void)[] = []

/** 子窗口不连接 Player、Pinia 或键盘；所有动作按发送顺序回到主窗口验证。 */
function send(command: EditorCommand): Promise<void> {
  if (loading.value && !['ready', 'shown', 'dock', 'ping', 'playback'].includes(command.kind))
    return Promise.resolve()
  const request = { ...command, session, revision, sequence: ++sequence }
  sending = sending
    .then(() => port.send(request))
    .catch((cause) => {
      error.value = t('midi.pianoRoll.windowFailed', { error: String(cause) })
    })
  return sending
}

/** 原生关闭和工具栏还原走同一条路径，先发最终视口，再由主窗口销毁本窗口。 */
async function dock(): Promise<void> {
  clearTimeout(viewportTimer)
  viewportTimer = undefined
  pendingViewport = undefined
  const viewport = panel.value?.getState()
  if (viewport) await send({ kind: 'viewport', viewport })
  await send({ kind: 'preview', seconds: null })
  await send({ kind: 'dock' })
}

onMounted(async () => {
  try {
    const unlisten = await port.listen(async (payload) => {
      if (!active || payload.session !== session || payload.sequence <= received) return
      lastContact = Date.now()
      received = payload.sequence
      if (payload.kind === 'playback') {
        playback.value = payload.playback
      } else if (payload.kind === 'state') {
        if (payload.revision < revision) return
        revision = payload.revision
        loading.value = payload.state.loading
        if (loading.value) {
          clearTimeout(viewportTimer)
          viewportTimer = undefined
          pendingViewport = undefined
          clock.receive(
            { ...clock.read(presentationNow(), duration), isPlaying: false },
            presentationNow()
          )
          return
        }
        const document = payload.state.document ?? state.value?.document
        if (!document) return
        const songChanged = state.value?.filename !== payload.state.filename
        const previousLayout = songChanged ? panel.value?.getState() : undefined
        state.value = { ...payload.state, document }
        duration = createTimeline(document).durationSeconds
        if (songChanged) {
          transport.value = { positionSeconds: 0, isPlaying: false, playbackRate: 1 }
          clock.receive(transport.value, presentationNow())
        }
        if (songChanged || payload.viewport)
          restore.value =
            payload.viewport ??
            (previousLayout
              ? {
                  ...previousLayout,
                  selectedTrackId: document.notes[0]?.trackId ?? document.tracks[0]?.id ?? null,
                  overview: undefined,
                  editor: undefined,
                }
              : undefined)
        if (isSupportedLocale(payload.state.locale)) locale.value = payload.state.locale
        await nextTick()
        if (!active || payload.revision !== revision) return
        await port.setTitle(payload.state.title)
        if (!shown) {
          await port.show()
          shown = true
        }
        await send({ kind: 'shown' })
      } else if (payload.revision === revision) {
        clock.receive(payload.transport, payload.sampledAt)
      }
    })
    if (!active) {
      unlisten()
      return
    }
    cleanups.push(unlisten)
    const close = await port.onCloseRequested(() => {
      void dock()
    })
    if (!active) {
      close()
      return
    }
    cleanups.push(close)
    await send({ kind: 'ready' })
    frame = requestAnimationFrame(paint)
    // 主页面刷新不会触发 Vue 卸载；租约避免遗留一个显示旧歌曲的孤立窗口。
    const heartbeat = window.setInterval(() => {
      if (Date.now() - lastContact > 10000) {
        clearInterval(heartbeat)
        void port.destroy().catch((cause) => {
          error.value = String(cause)
        })
      } else void send({ kind: 'ping' })
    }, 2000)
    cleanups.push(() => clearInterval(heartbeat))
  } catch (cause) {
    error.value = t('midi.pianoRoll.windowFailed', { error: String(cause) })
    await port.show()
  }
})
onBeforeUnmount(() => {
  active = false
  cancelAnimationFrame(frame)
  clearTimeout(viewportTimer)
  for (const cleanup of cleanups) cleanup()
})
</script>

<template>
  <ConfigProvider
    v-bind="infinityNikkiConfigProviderProps"
    :locale="configLocale"
  >
    <AntApp>
      <main class="detached-editor">
        <template v-if="state">
          <WindowTitleBar :snap-layouts="false">
            <template #title>
              <PlayerSongTitle
                class="detached-song-title"
                :title="state.title"
                :media-id="state.filename"
              />
            </template>
            <template #center>
              <PreviewPlaybackControls
                :state="playback"
                :show-volume="false"
                @command="send({ kind: 'playback', mediaId: playback.mediaId, command: $event })"
              />
            </template>
          </WindowTitleBar>
          <PianoWorkspace
            :key="state.filename"
            ref="panel"
            :inert="loading"
            :filename="state.filename"
            :document="state.document"
            :transport="transport"
            :labels="state.labels"
            :restore="restore"
            detached
            @seek="send({ kind: 'seek', seconds: $event })"
            @seek-preview="send({ kind: 'preview', seconds: $event })"
            @state-change="queueViewport"
            @toggle-track="send({ kind: 'toggle-track', trackId: $event })"
            @migrate="dock"
          />
        </template>
        <Spin
          v-else
          class="m-auto"
        />
        <Spin
          v-if="loading"
          class="absolute inset-0 flex items-center justify-center bg-white/60"
        />
        <p
          v-if="error || playback.error || state?.error"
          role="status"
          class="detached-error"
        >
          {{ error || playback.error || state?.error }}
        </p>
      </main>
    </AntApp>
  </ConfigProvider>
</template>

<style scoped>
.detached-editor { @apply relative flex h-screen min-h-0 flex-col bg-white; }

.detached-error { @apply m-0 px-3 py-1 text-sm; color: var(--color-error); }
</style>
