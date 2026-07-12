/**
 * @fileOverview 播放器状态管理 - 管理 MIDI 库、播放状态、试听功能等
 * @description 使用 Pinia 管理的播放器状态，包含 MIDI 文件管理、试听播放、音轨控制等功能
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { feedback as toast } from '@/lib/feedback'
import {
  createPlayerState,
  type MediaItem,
  type Player,
  type PlaybackMode,
  type PlayerState,
  type Unsubscribe,
} from '@strawberrybear/player'
import type { MidiPreviewPlaybackFeature } from '@/features/player/midiPreview'
import type { MidiPreviewQueueContext } from '@/features/player/midiPreview'
import type {
  KeyLogEntry,
  MidiInfo,
  MelodyEvent,
  PlaybackState,
  TrackInfo,
  NoteEvent,
} from '@/types'
import {
  loadMidiForDuration,
  setNoteFilter,
  setPitchMapper,
  ensureInstrument,
  setOnActiveNotesChange,
  setDisabledTracks,
} from '@/lib/midiPlayer'
import { useSettingsStore } from './settings'
import { useSongListStore } from './songLists'

/** 支持的 MIDI 文件扩展名集合 */
const MIDI_EXTENSIONS = new Set(['mid', 'midi'])

/**
 * @description: 导入路径结果类型
 * @typedef {Object} ImportPathsResult
 * @property {number} importedFiles - 成功导入的文件数量
 * @property {number} scannedFolders - 扫描的文件夹数量
 * @property {string[]} invalidPaths - 无效的路径列表
 */
export interface ImportPathsResult {
  importedFiles: number
  scannedFolders: number
  invalidPaths: string[]
}

/**
 * @description: 导入 MIDI Buffer 的选项
 * @typedef {Object} ImportMidiBufferOptions
 * @property {boolean} [autoSelect=true] - 导入后是否自动选中
 */
interface ImportMidiBufferOptions {
  autoSelect?: boolean
  metadata?: OnlineMidiMetadata
}

/** 选择 MIDI 时可指定的试听队列上下文。 */
interface SelectMidiQueueOptions {
  queueItems?: MidiInfo[]
  queueContext?: MidiPreviewQueueContext | null
  persistSelection?: boolean
}

type SongPlaybackState = 'idle' | 'playing' | 'paused'

type MidiConfigResponse = {
  filename: string
  title?: string | null
  author_name?: string | null
  description?: string | null
  online_song_id?: string | null
  online_sha256?: string | null
  duration_ms: number
  track_count: number
  melody_note_count: number
  ticks_per_beat: number
  tempo: number
  disabled_tracks: number[]
}

export type OnlineMidiMetadata = {
  title?: string | null
  authorName?: string | null
  description?: string | null
  onlineSongId?: string | null
  onlineSha256?: string | null
}

type PreviewSnapshot = {
  midi: MidiInfo | null
  queueItems: MidiInfo[]
  queueContext: MidiPreviewQueueContext | null
  positionMs: number
  wasPlaying: boolean
  wasPaused: boolean
}

/**
 * @description: 播放器 Store - 管理所有播放器相关状态和方法
 * @return {Object} 返回播放器状态管理对象
 */
export const usePlayerStore = defineStore('player', () => {
  // ============================================
  // 状态定义
  // ============================================

  /** MIDI 库（已导入的文件列表） */
  const midiLibrary = ref<MidiInfo[]>([])

  /** 当前选中的 MIDI 文件 */
  const currentMidi = ref<MidiInfo | null>(null)

  /** 当前 MIDI 的旋律数据（提取后的单旋律） */
  const melody = ref<MelodyEvent[]>([])

  /** 当前 MIDI 的所有音符（用于键盘映射，保留所有声部） */
  const allNotes = ref<MelodyEvent[]>([])

  /** 当前 MIDI 的音轨列表 */
  const tracks = ref<TrackInfo[]>([])

  /** 禁用的音轨索引集合（使用 midi-player-js 的 track 值） */
  const disabledTracks = ref<Set<number>>(new Set())

  /** 用于强制触发响应式更新的版本号（解决 Set 无法触发响应式的问题） */
  let disabledTracksVersion = 0

  /** 响应式的版本号引用 */
  const disabledTracksVersionRef = ref(0)

  /** 当前详情页查看的 MIDI 文件；与当前播放曲相互独立 */
  const detailMidi = ref<MidiInfo | null>(null)

  /** 最近一次导入或命中的 MIDI，用于导入后进入详情页 */
  const lastImportedMidi = ref<MidiInfo | null>(null)

  /** 详情页 MIDI 的旋律数据 */
  const detailMelody = ref<MelodyEvent[]>([])

  /** 详情页 MIDI 的所有音符 */
  const detailAllNotes = ref<MelodyEvent[]>([])

  /** 详情页 MIDI 的音轨列表 */
  const detailTracks = ref<TrackInfo[]>([])

  /** 详情页禁用音轨集合 */
  const detailDisabledTracks = ref<Set<number>>(new Set())

  /** 详情页音轨禁用集合响应式版本 */
  let detailDisabledTracksVersion = 0
  const detailDisabledTracksVersionRef = ref(0)

  /** 详情页 MIDI 实际时长 */
  const detailDuration = ref(0)

  /** 详情页加载状态 */
  const isDetailLoading = ref(false)

  /** 播放状态（Rust 后端状态） */
  const playbackState = ref<PlaybackState>({
    status: 'idle',
    midi_name: null,
    current_tick: 0,
    speed: 1.0,
  })

  /** 按键日志（最多 50 条） */
  const keyLogs = ref<KeyLogEntry[]>([])

  /** 当前活跃的音符列表（来自 midiPlayer，用于同步键盘高亮） */
  const activeNotes = ref<Array<{ pitch: number; noteName: string }>>([])

  /** 播放速度倍率 */
  const speed = ref(1.0)

  /** 获取 settings store 实例（用于访问模板和设置） */
  const settingsStore = useSettingsStore()
  /** 获取歌单 store 实例（用于按当前来源实时重算播放队列） */
  const songListStore = useSongListStore()

  /** 是否处于加载中状态 */
  const isLoading = ref(false)

  /** 辅助功能权限状态（macOS 需要） */
  const hasAccessibility = ref(false)

  // ============================================
  // 试听相关状态
  // ============================================

  /** 是否正在试听播放 */
  const isPreviewPlaying = ref(false)

  /** 是否处于暂停状态 */
  const isPreviewPaused = ref(false)

  /** 当前试听播放时间（毫秒） */
  const previewCurrentTime = ref(0)

  /** 试听总时长（毫秒） */
  const previewDuration = ref(0)

  /** 试听音量（0-1） */
  const previewVolume = ref(1)

  /** 是否处于静音状态 */
  const isPreviewMuted = ref(false)

  /** 标记是否正在拖拽进度条（防止拖拽时定时器覆盖位置） */
  const isDragging = ref(false)

  /** 公共播放器状态快照；Pinia 只桥接快照，不直接维护队列状态机。 */
  const previewState = ref<PlayerState>(
    createPlayerState({
      playbackMode: 'sequential',
      volume: previewVolume.value,
      muted: isPreviewMuted.value,
    })
  )

  /** 当前播放列表调度模式，来自公共播放器快照。 */
  const previewPlaybackMode = computed(() => previewState.value.playbackMode)

  /** bootstrap 注入的公共播放器实例。 */
  let previewPlayer: Player | null = null
  let selectMidiRequestId = 0

  /** bootstrap 注入的 MIDI 试听适配层。 */
  let midiPreview: MidiPreviewPlaybackFeature | null = null

  /** 公共播放器 statechange 订阅清理函数。 */
  let unsubscribePreviewState: Unsubscribe | null = null

  /** 公共播放器 error 订阅清理函数。 */
  let unsubscribePreviewError: Unsubscribe | null = null

  /** 当前试听队列来源列表，用于上一曲/下一曲保持在歌单或筛选结果内。 */
  const previewQueueItems = ref<MidiInfo[]>([])

  /** 当前试听队列来源信息；null 表示普通临时队列。 */
  const previewQueueContext = ref<MidiPreviewQueueContext | null>(null)

  /** 当前队列来源 ID；用于持久化恢复。 */
  const previewQueueSourceId = computed(() => previewQueueContext.value?.id ?? null)

  /** 当前是否正在处理“当前曲离开队列”的 fallback，避免 watcher 并发重入。 */
  let isResolvingPreviewQueueFallback = false

  const temporaryPreviewSnapshot = ref<PreviewSnapshot | null>(null)
  const temporaryPreviewFilePath = ref<string | null>(null)
  const currentTemporaryOnlineSongId = ref<string | null>(null)

  /**
   * @description: 将公共播放器状态同步到旧 UI 字段
   * @param {PlayerState} state - 公共播放器状态快照
   * @return {void} 无返回值
   */
  function syncPreviewStateFromPlayerState(state: PlayerState) {
    previewState.value = state
    isPreviewPlaying.value = state.status === 'playing'
    isPreviewPaused.value = state.status === 'paused'
    previewCurrentTime.value = state.positionSeconds * 1000
    previewDuration.value = state.durationSeconds * 1000
    previewVolume.value = state.volume
    isPreviewMuted.value = state.muted
  }

  /**
   * @description: 根据播放器媒体同步当前 MIDI 选择
   * @param {MediaItem | null} media - 公共播放器当前媒体
   * @return {void} 无返回值
   */
  async function setCurrentMidiFromMedia(media: MediaItem | null): Promise<void> {
    const midi = media?.metadata?.midi as MidiInfo | undefined
    if (midi) {
      currentMidi.value = midi
      await loadDisabledTracks(midi)
      if (shouldPersistPreviewSelection()) {
        void persistPreviewSelection(midi)
      }
    }
  }

  function isTemporaryPreviewContext(context: MidiPreviewQueueContext | null | undefined): boolean {
    return context?.id.startsWith('online-preview:') === true
  }

  function shouldPersistPreviewSelection(
    context: MidiPreviewQueueContext | null = previewQueueContext.value
  ): boolean {
    return !isTemporaryPreviewContext(context)
  }

  /**
   * @description: 持久化当前预览歌曲与播放来源
   * @param {MidiInfo | null} midi - 当前预览歌曲
   * @return {Promise<void>} 无返回值
   */
  async function persistPreviewSelection(midi: MidiInfo | null = currentMidi.value): Promise<void> {
    await settingsStore.setLastPreviewSelection(midi?.filename ?? null, previewQueueSourceId.value)
  }

  /**
   * @description: 绑定 bootstrap 创建的试听播放器运行时
   * @param {Player} player - 公共播放器实例
   * @param {MidiPreviewPlaybackFeature} feature - MIDI 试听适配层
   * @return {void} 无返回值
   */
  function bindPreviewRuntime(player: Player, feature: MidiPreviewPlaybackFeature): void {
    unsubscribePreviewState?.()
    unsubscribePreviewError?.()

    previewPlayer = player
    midiPreview = feature
    midiPreview.configure({
      getDisabledTracks: () => disabledTracks.value,
      getPlaybackSpeed: () => speed.value,
      configurePlaybackFilter: configurePreviewFilter,
      onMediaSelected: setCurrentMidiFromMedia,
    })

    // settings 可能已经先于运行时绑定完成，绑定时主动同步一次持久化播放模式。
    player.setPlaybackMode(settingsStore.playlistPlaybackMode)
    syncPreviewStateFromPlayerState(player.getState())
    unsubscribePreviewState = player.on('statechange', syncPreviewStateFromPlayerState)
    unsubscribePreviewError = player.on('error', (state) => {
      const message = state.error?.message || '播放器错误'
      toast.error('试听失败', { description: message, richColors: true })
      console.error('试听失败:', state.error)
    })
  }

  /**
   * @description: 应用持久化的播放列表模式到公共播放器
   * @return {void} 无返回值
   */
  function applyPlaylistPlaybackMode() {
    previewPlayer?.setPlaybackMode(settingsStore.playlistPlaybackMode)
  }

  /**
   * @description: 设置播放列表调度模式
   * @param {PlaybackMode} mode - 目标播放列表模式
   * @return {Promise<void>} 无返回值
   */
  async function setPlaylistPlaybackMode(mode: PlaybackMode) {
    // 先更新公共 Player，让 UI 快照立即反映新模式；随后再写入 settings 持久化。
    previewPlayer?.setPlaybackMode(mode)
    await settingsStore.setPlaylistPlaybackMode(mode)
  }

  // ============================================
  // 辅助功能
  // ============================================

  /**
   * @description: 检查辅助功能权限（macOS 需要辅助功能权限才能模拟键盘）
   * @return Promise
   */
  async function checkAccessibility() {
    try {
      // 调用 Rust 后端检查权限状态
      hasAccessibility.value = await invoke<boolean>('check_accessibility')
    } catch {
      // 检查失败，默认无权限
      hasAccessibility.value = false
    }
  }

  function applyMetadataToMidi(midi: MidiInfo, metadata?: OnlineMidiMetadata | null): MidiInfo {
    if (!metadata) return midi
    midi.title = metadata.title?.trim() || midi.title || null
    midi.author_name = metadata.authorName?.trim() || midi.author_name || null
    midi.description = metadata.description?.trim() || midi.description || null
    midi.online_song_id = metadata.onlineSongId?.trim() || midi.online_song_id || null
    midi.online_sha256 = metadata.onlineSha256?.trim() || midi.online_sha256 || null
    return midi
  }

  function applyConfigToMidi(midi: MidiInfo, config: MidiConfigResponse): void {
    if (config.duration_ms > 0) midi.duration_ms = config.duration_ms
    if (config.track_count > 0) midi.track_count = config.track_count
    if (config.melody_note_count > 0) midi.melody_note_count = config.melody_note_count
    if (config.ticks_per_beat > 0) midi.ticks_per_beat = config.ticks_per_beat
    if (config.tempo > 0) midi.tempo = config.tempo
    midi.title = config.title ?? midi.title ?? null
    midi.author_name = config.author_name ?? midi.author_name ?? null
    midi.description = config.description ?? midi.description ?? null
    midi.online_song_id = config.online_song_id ?? midi.online_song_id ?? null
    midi.online_sha256 = config.online_sha256 ?? midi.online_sha256 ?? null
  }

  function buildMidiConfigPayload(midi: MidiInfo, disabledTracksValue: number[] = []) {
    return {
      filename: midi.filename,
      durationMs: Math.floor(midi.duration_ms || 0),
      trackCount: midi.track_count || 0,
      melodyNoteCount: midi.melody_note_count || 0,
      ticksPerBeat: midi.ticks_per_beat || 480,
      tempo: midi.tempo || 500000,
      disabledTracks: disabledTracksValue,
      title: midi.title ?? null,
      authorName: midi.author_name ?? null,
      description: midi.description ?? null,
      onlineSongId: midi.online_song_id ?? null,
      onlineSha256: midi.online_sha256 ?? null,
    }
  }

  async function saveMidiConfig(midi: MidiInfo, disabledTracksValue: number[] = []): Promise<void> {
    await invoke('save_midi_config', buildMidiConfigPayload(midi, disabledTracksValue))
  }

  // ============================================
  // MIDI 库管理
  // ============================================

  /**
   * @description: 加载 MIDI 库列表（从应用数据目录）
   * @return Promise 加载是否成功
   */
  async function loadMidiLibrary() {
    isLoading.value = true
    try {
      // 从 Rust 后端获取库文件列表
      const files = await invoke<MidiInfo[]>('get_midi_library')

      // 为每个文件加载缓存的配置（时长、音轨数等）
      for (const file of files) {
        try {
          // 尝试加载缓存的配置
          const config = await invoke<MidiConfigResponse>('load_midi_config', {
            filename: file.filename,
          })
          applyConfigToMidi(file, config)
        } catch {
          // 配置不存在（可能旧文件），使用 Rust 解析的原始值
          // 同时计算准确时长
          try {
            // 读取 MIDI 文件计算时长
            const midiData = await invoke<number[]>('read_midi_data', { filename: file.filename })
            const uint8Array = new Uint8Array(midiData)
            const { duration } = await loadMidiForDuration(uint8Array.buffer)
            file.duration_ms = Math.floor(duration)

            // 提取旋律获取音符数
            const melody = await invoke<MelodyEvent[]>('extract_melody', {
              events: file.events,
              ticksPerBeat: file.ticks_per_beat,
              tempo: 500000,
            })
            file.melody_note_count = melody.length

            // 保存配置以便下次快速加载
            await saveMidiConfig(file, [])
          } catch {
            // 忽略时长计算失败
          }
        }
      }

      midiLibrary.value = files
      return true
    } catch (e) {
      toast.error('加载 MIDI 库失败', { description: String(e), richColors: true })
      console.error('加载 MIDI 库失败:', e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @description: 导入 MIDI 文件到库中（复制到应用数据目录）
   * @param {string} sourcePath - 源文件路径
   * @return Promise 导入是否成功
   */
  async function importMidi(sourcePath: string) {
    isLoading.value = true
    try {
      // 调用后端复制文件到库目录并获取信息
      const info = await invoke<MidiInfo>('import_midi', { sourcePath })

      // 检查是否已存在于库中（Rust 后端对已存在文件会直接返回信息）
      const existingIndex = midiLibrary.value.findIndex((m) => m.filename === info.filename)
      if (existingIndex !== -1) {
        lastImportedMidi.value = midiLibrary.value[existingIndex]
        if (!currentMidi.value) {
          await selectMidi(midiLibrary.value[existingIndex])
        }
        await syncActivePreviewQueue()
        return true
      }

      // 通过后端读取 MIDI 文件计算正确时长
      const midiData = await invoke<number[]>('read_midi_data', { filename: info.filename })
      const uint8Array = new Uint8Array(midiData)
      const { duration } = await loadMidiForDuration(uint8Array.buffer)
      info.duration_ms = Math.floor(duration)

      // 提取旋律并获取音符数
      const melody = await invoke<MelodyEvent[]>('extract_melody', {
        events: info.events,
        ticksPerBeat: info.ticks_per_beat,
        tempo: 500000,
      })
      info.melody_note_count = melody.length

      // 保存配置到文件
      await saveMidiConfig(info, [])

      // 添加到本地库列表
      midiLibrary.value.push(info)
      lastImportedMidi.value = info

      if (!currentMidi.value) {
        await selectMidi(info)
      }
      await syncActivePreviewQueue()
      return true
    } catch (e) {
      toast.error('导入 MIDI 失败', { description: String(e), richColors: true })
      console.error('导入 MIDI 失败:', e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @description: 从 Buffer 导入 MIDI 文件（用于拖拽导入）
   * @param {string} filename - 文件名
   * @param {Uint8Array | number[]} data - 文件数据
   * @param {ImportMidiBufferOptions} [options] - 导入选项
   * @param {boolean} [options.autoSelect=true] - 导入后是否自动选中
   * @return Promise 导入是否成功
   */
  async function importMidiBuffer(
    filename: string,
    data: Uint8Array | number[],
    options: ImportMidiBufferOptions = {}
  ) {
    isLoading.value = true
    try {
      const { autoSelect = true, metadata } = options

      // 统一转换为数组格式（Rust 后端需要 number[]）
      const payload = data instanceof Uint8Array ? Array.from(data) : data

      // 调用后端导入
      const info = await invoke<MidiInfo>('import_midi_buffer', { filename, data: payload })
      applyMetadataToMidi(info, metadata)

      // 检查是否已存在
      const existingIndex = midiLibrary.value.findIndex((m) => m.filename === info.filename)
      if (existingIndex !== -1) {
        applyMetadataToMidi(midiLibrary.value[existingIndex], metadata)
        let existingDisabledTracks: number[] = []
        try {
          const existingConfig = await invoke<MidiConfigResponse>('load_midi_config', {
            filename: midiLibrary.value[existingIndex].filename,
          })
          existingDisabledTracks = existingConfig.disabled_tracks
        } catch {
          // 旧导入文件可能还没有配置文件，此时创建一份新配置。
        }
        await saveMidiConfig(midiLibrary.value[existingIndex], existingDisabledTracks)
        lastImportedMidi.value = midiLibrary.value[existingIndex]
        if (autoSelect && !currentMidi.value) {
          await selectMidi(midiLibrary.value[existingIndex])
        }
        await syncActivePreviewQueue()
        return true
      }

      // 计算时长
      const midiData = await invoke<number[]>('read_midi_data', { filename: info.filename })
      const uint8Array = new Uint8Array(midiData)
      const { duration } = await loadMidiForDuration(uint8Array.buffer)
      info.duration_ms = Math.floor(duration)

      // 提取旋律
      const melody = await invoke<MelodyEvent[]>('extract_melody', {
        events: info.events,
        ticksPerBeat: info.ticks_per_beat,
        tempo: 500000,
      })
      info.melody_note_count = melody.length

      // 保存配置
      await saveMidiConfig(info, [])

      midiLibrary.value.push(info)
      lastImportedMidi.value = info
      if (autoSelect && !currentMidi.value) {
        await selectMidi(info)
      }
      await syncActivePreviewQueue()
      return true
    } catch (e) {
      toast.error('导入 MIDI 失败', { description: String(e), richColors: true })
      console.error('导入 MIDI 失败:', e)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ============================================
  // 路径处理辅助函数
  // ============================================

  /**
   * @description: 从路径中获取文件名
   * @param {string} path - 文件路径
   * @return {string} 文件名
   */
  function getPathBasename(path: string) {
    return path.split(/[/\\]/).pop() || path
  }

  /**
   * @description: 从路径中获取文件扩展名
   * @param {string} path - 文件路径
   * @return {string} 扩展名（不含点，小写）
   */
  function getPathExtension(path: string) {
    const basename = getPathBasename(path)
    const lastDotIndex = basename.lastIndexOf('.')
    return lastDotIndex === -1 ? '' : basename.slice(lastDotIndex + 1).toLowerCase()
  }

  /**
   * @description: 判断路径是否为 MIDI 文件
   * @param {string} path - 文件路径
   * @return {boolean} 是否为 MIDI 文件
   */
  function isMidiPath(path: string) {
    return MIDI_EXTENSIONS.has(getPathExtension(path))
  }

  /**
   * @description: 判断路径是否像文件夹路径（无扩展名）
   * @param {string} path - 文件路径
   * @return {boolean} 是否像文件夹路径
   */
  function looksLikeDirectoryPath(path: string) {
    return getPathExtension(path) === ''
  }

  /**
   * @description: 批量导入路径（文件或文件夹）
   * @param {string[]} paths - 路径列表
   * @return Promise 导入结果统计
   */
  async function importPaths(paths: string[]): Promise<ImportPathsResult> {
    lastImportedMidi.value = null
    const result: ImportPathsResult = {
      importedFiles: 0,
      scannedFolders: 0,
      invalidPaths: [],
    }

    // 去重并过滤空值
    const uniquePaths = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))

    for (const path of uniquePaths) {
      if (isMidiPath(path)) {
        // MIDI 文件直接导入
        if (await importMidi(path)) {
          result.importedFiles++
        }
        continue
      }

      if (looksLikeDirectoryPath(path)) {
        // 文件夹路径，扫描导入
        await scanFolder(path)
        result.scannedFolders++
        continue
      }

      // 无效路径
      result.invalidPaths.push(path)
    }

    return result
  }

  /**
   * @description: 清理最近导入 MIDI 记录
   * @return {void} 无返回值
   */
  function clearLastImportedMidi(): void {
    lastImportedMidi.value = null
  }

  function isManagedPreviewSource(sourceId: string | null | undefined): boolean {
    return sourceId === 'all' || sourceId?.startsWith('song-list:') === true
  }

  function getAllSongsQueueSource(): {
    items: MidiInfo[]
    context: MidiPreviewQueueContext
  } {
    return {
      items: midiLibrary.value,
      context: { id: 'all', title: '歌曲管理' },
    }
  }

  /**
   * @description: 获取当前有效试听队列
   * @return {MidiInfo[]} 当前队列为空时回退完整 MIDI 库
   */
  function getActivePreviewQueue(): MidiInfo[] {
    return previewQueueItems.value.length > 0 ? previewQueueItems.value : midiLibrary.value
  }

  const activePreviewQueueItems = computed(() => getActivePreviewQueue())

  /**
   * @description: 更新当前试听队列上下文
   * @param {MidiInfo[]} items - 队列内 MIDI 列表
   * @param {MidiPreviewQueueContext | null} context - 队列来源信息
   * @return {void} 无返回值
   */
  function setPreviewQueueContext(
    items: MidiInfo[],
    context: MidiPreviewQueueContext | null = null
  ): void {
    previewQueueItems.value = items
    previewQueueContext.value = context
  }

  /**
   * @description: 根据持久化来源 ID 解析队列和来源信息
   * @param {string | null | undefined} sourceId - 来源 ID
   * @return 解析后的队列和来源信息
   */
  function resolvePreviewSource(sourceId: string | null | undefined): {
    items: MidiInfo[]
    context: MidiPreviewQueueContext | null
  } | null {
    if (!sourceId || sourceId === 'all') {
      return getAllSongsQueueSource()
    }

    if (!sourceId.startsWith('song-list:')) return null
    const songListId = sourceId.slice('song-list:'.length)
    const songList = songListStore.getSongListById(songListId)
    if (!songList) return null
    const midiMap = new Map(midiLibrary.value.map((midi) => [midi.filename, midi]))
    const items = songList.song_filenames
      .map((filename) => midiMap.get(filename))
      .filter((midi): midi is MidiInfo => Boolean(midi))
    if (items.length === 0) return null
    return {
      items,
      context: { id: sourceId, title: songList.name },
    }
  }

  /**
   * @description: 按当前播放来源重新计算试听队列，并把最新队列同步给公共 Player。
   * @description 当前曲仍在队列内时只刷新队列快照，保留播放/暂停状态和进度；
   * 当前曲已离开队列时沿用现有 fallback 语义，播放中切到新队列第一首，非播放中只更新选择。
   * @return {Promise<void>} 无返回值
   */
  async function syncActivePreviewQueue(): Promise<void> {
    if (isResolvingPreviewQueueFallback) return
    const sourceId = previewQueueContext.value?.id ?? null
    if (!sourceId && previewQueueItems.value.length > 0) return
    if (sourceId && !isManagedPreviewSource(sourceId)) return
    if (!currentMidi.value && !previewQueueContext.value && previewQueueItems.value.length === 0)
      return

    const resolved = resolvePreviewSource(sourceId) ?? getAllSongsQueueSource()
    if (resolved.items.length === 0) {
      clearCurrentPreviewSelection()
      await persistPreviewSelection(null)
      return
    }

    const current = currentMidi.value
    const currentStillInQueue = Boolean(
      current && resolved.items.some((midi) => midi.filename === current.filename)
    )
    const nextCurrent = currentStillInQueue && current ? current : resolved.items[0]!
    const shouldSwitchCurrent = !currentStillInQueue || current?.filename !== nextCurrent.filename
    const wasPlaying = isPreviewPlaying.value && !isPreviewPaused.value
    const previousStatus = previewState.value.status
    const positionMs = previewCurrentTime.value
    const durationMs = previewDuration.value

    setPreviewQueueContext(resolved.items, resolved.context)

    if (shouldSwitchCurrent) {
      isResolvingPreviewQueueFallback = true
      try {
        if (current) await stopPreviewPlayback()
        if (wasPlaying) {
          await playMidiInQueue(nextCurrent, resolved.items, resolved.context)
          return
        }

        await selectMidi(nextCurrent, {
          queueItems: resolved.items,
          queueContext: resolved.context,
          resetPreviewProgress: true,
        })
        if (shouldPersistPreviewSelection(resolved.context)) {
          await persistPreviewSelection(nextCurrent)
        }
      } finally {
        isResolvingPreviewQueueFallback = false
      }
      return
    }

    midiPreview?.syncMidiQueue(resolved.items, nextCurrent, resolved.context)
    previewPlayer?.updateProgress(positionMs / 1000, durationMs / 1000)
    if (previousStatus === 'playing') {
      previewPlayer?.handlePlaying()
    } else if (previousStatus === 'paused') {
      previewPlayer?.handlePaused()
    } else if (previousStatus === 'loading') {
      previewPlayer?.handleWaiting()
    }
  }

  /**
   * @description: 启动后恢复上次预览选中歌曲和队列作用域
   * @return {Promise<void>} 无返回值
   */
  async function restoreInitialPreviewSelection(): Promise<void> {
    if (midiLibrary.value.length === 0) {
      clearCurrentPreviewSelection()
      await persistPreviewSelection(null)
      return
    }

    const resolved =
      resolvePreviewSource(settingsStore.lastPreviewSourceId) ?? resolvePreviewSource('all')
    const queueItems = resolved?.items.length ? resolved.items : midiLibrary.value
    const queueContext = resolved?.context ?? { id: 'all', title: '歌曲管理' }
    const savedFilename = settingsStore.lastPreviewFilename
    const selected =
      queueItems.find((midi) => midi.filename === savedFilename) ??
      midiLibrary.value.find((midi) => midi.filename === savedFilename) ??
      queueItems[0] ??
      midiLibrary.value[0]

    setPreviewQueueContext(queueItems, queueContext)
    await selectMidi(selected, {
      syncPreviewQueue: true,
      resetPreviewProgress: true,
    })
    await persistPreviewSelection(selected)
  }

  /**
   * @description: 清空当前预览选中状态
   * @return {void} 无返回值
   */
  function clearCurrentPreviewSelection(): void {
    void stopPreviewPlayback()
    currentMidi.value = null
    melody.value = []
    allNotes.value = []
    tracks.value = []
    disabledTracks.value.clear()
    disabledTracksVersionRef.value = ++disabledTracksVersion
    previewDuration.value = 0
    previewCurrentTime.value = 0
    previewQueueItems.value = []
    previewQueueContext.value = null
    previewPlayer?.clearQueue()
  }

  /**
   * @description: 获取指定歌曲相对于全局播放器的状态
   * @param {string} filename - MIDI 文件名
   * @return {SongPlaybackState} 当前播放状态
   */
  function getSongPlaybackState(filename: string): SongPlaybackState {
    if (currentMidi.value?.filename !== filename) return 'idle'
    if (isPreviewPlaying.value && !isPreviewPaused.value) return 'playing'
    if (isPreviewPaused.value) return 'paused'
    return 'idle'
  }

  function captureTemporaryPreviewSnapshot(): PreviewSnapshot {
    return {
      midi: currentMidi.value,
      queueItems: [...previewQueueItems.value],
      queueContext: previewQueueContext.value ? { ...previewQueueContext.value } : null,
      positionMs: previewCurrentTime.value,
      wasPlaying: isPreviewPlaying.value && !isPreviewPaused.value,
      wasPaused: isPreviewPaused.value,
    }
  }

  async function cleanupTemporaryPreviewFile(): Promise<void> {
    const filePath = temporaryPreviewFilePath.value
    temporaryPreviewFilePath.value = null
    if (!filePath) return
    try {
      await invoke('cleanup_online_midi_preview', { filePath })
    } catch (e) {
      console.warn('清理在线临时试听文件失败:', e)
    }
  }

  async function playTemporaryMidiBuffer(
    filename: string,
    data: Uint8Array | number[],
    metadata: OnlineMidiMetadata = {}
  ): Promise<boolean> {
    try {
      if (!temporaryPreviewSnapshot.value) {
        temporaryPreviewSnapshot.value = captureTemporaryPreviewSnapshot()
      }
      await cleanupTemporaryPreviewFile()

      const payload = data instanceof Uint8Array ? Array.from(data) : data
      const midi = await invoke<MidiInfo>('prepare_online_midi_preview', {
        filename,
        data: payload,
      })
      applyMetadataToMidi(midi, metadata)
      temporaryPreviewFilePath.value = midi.file_path
      currentTemporaryOnlineSongId.value = metadata.onlineSongId?.trim() || null

      const contextId = `online-preview:${currentTemporaryOnlineSongId.value ?? midi.filename}`
      await playMidiInQueue(
        midi,
        [...midiLibrary.value, midi],
        { id: contextId, title: '歌曲管理' },
        {
          persistSelection: false,
        }
      )
      return true
    } catch (e) {
      toast.error('播放在线 MIDI 失败', { description: String(e), richColors: true })
      console.error('播放在线 MIDI 失败:', e)
      return false
    }
  }

  async function restoreTemporaryOnlinePreview(): Promise<void> {
    const snapshot = temporaryPreviewSnapshot.value
    const hasTemporaryPreview =
      Boolean(snapshot) ||
      Boolean(currentTemporaryOnlineSongId.value) ||
      Boolean(temporaryPreviewFilePath.value)
    if (!hasTemporaryPreview) return

    temporaryPreviewSnapshot.value = null
    currentTemporaryOnlineSongId.value = null
    await stopPreviewPlayback()
    await cleanupTemporaryPreviewFile()

    if (!snapshot) return
    const restoreItems = snapshot.queueItems.length > 0 ? snapshot.queueItems : midiLibrary.value
    if (!snapshot.midi) {
      clearCurrentPreviewSelection()
      await persistPreviewSelection(null)
      return
    }

    await selectMidiInQueue(snapshot.midi, restoreItems, snapshot.queueContext, {
      persistSelection: shouldPersistPreviewSelection(snapshot.queueContext),
    })
    if (snapshot.wasPlaying) {
      await seekPreviewAndPlay(snapshot.positionMs)
    } else {
      await seekPreview(snapshot.positionMs)
      setPreviewTime(snapshot.positionMs)
      if (snapshot.wasPaused) {
        pausePreviewPlayback()
      }
    }
  }

  async function replaceTemporaryOnlinePreviewWithLocal(
    midi: MidiInfo,
    items: MidiInfo[],
    context: MidiPreviewQueueContext | null = null
  ): Promise<void> {
    const positionMs = previewCurrentTime.value
    const shouldContinuePlaying = isPreviewPlaying.value && !isPreviewPaused.value
    const shouldRemainPaused = isPreviewPaused.value

    temporaryPreviewSnapshot.value = null
    currentTemporaryOnlineSongId.value = null
    await stopPreviewPlayback()
    await cleanupTemporaryPreviewFile()

    await selectMidiInQueue(midi, items, context, {
      persistSelection: shouldPersistPreviewSelection(context),
    })
    if (shouldContinuePlaying) {
      await seekPreviewAndPlay(positionMs)
      return
    }
    await seekPreview(positionMs)
    setPreviewTime(positionMs)
    if (shouldRemainPaused) {
      pausePreviewPlayback()
    }
  }

  /**
   * @description: 在指定队列中选择 MIDI，但不立即播放
   * @param {MidiInfo} midi - 要选择的 MIDI
   * @param {MidiInfo[]} items - 当前播放集合
   * @param {MidiPreviewQueueContext | null} context - 播放来源
   * @return {Promise<void>} 无返回值
   */
  async function selectMidiInQueue(
    midi: MidiInfo,
    items: MidiInfo[],
    context: MidiPreviewQueueContext | null = null,
    options: { persistSelection?: boolean } = {}
  ): Promise<void> {
    const { persistSelection = shouldPersistPreviewSelection(context) } = options
    setPreviewQueueContext(items, context)
    await selectMidi(midi, {
      queueItems: items,
      queueContext: context,
      persistSelection,
    })
    if (persistSelection) {
      await persistPreviewSelection(midi)
    }
  }

  /**
   * @description: 选择并播放指定集合中的 MIDI
   * @param {MidiInfo} midi - 要播放的 MIDI
   * @param {MidiInfo[]} items - 当前播放集合
   * @param {MidiPreviewQueueContext | null} context - 播放来源
   * @return {Promise<void>} 无返回值
   */
  async function playMidiInQueue(
    midi: MidiInfo,
    items: MidiInfo[],
    context: MidiPreviewQueueContext | null = null,
    options: { persistSelection?: boolean } = {}
  ): Promise<void> {
    await selectMidiInQueue(midi, items, context, options)
    await startPreview()
  }

  /**
   * 点击指定歌曲的统一播放语义：正在播放则暂停，已暂停则恢复，否则切换目标并播放。
   */
  async function toggleMidiInQueue(
    midi: MidiInfo,
    items: MidiInfo[],
    context: MidiPreviewQueueContext | null = null
  ): Promise<void> {
    const isCurrent = currentMidi.value?.filename === midi.filename
    if (isCurrent && isPreviewPlaying.value && !isPreviewPaused.value) {
      pausePreviewPlayback()
      return
    }
    if (isCurrent && isPreviewPaused.value) {
      resumePreviewPlayback()
      return
    }
    await playMidiInQueue(midi, items, context)
  }

  /**
   * @description: 从库中删除 MIDI 文件
   * @param {string} filename - 要删除的文件名
   * @return Promise 删除是否成功
   */
  async function deleteMidi(filename: string) {
    try {
      // 调用后端删除文件
      await invoke('delete_midi_from_library', { filename })
      // 从本地库移除
      await removeFromLibrary(filename)
      songListStore.removeSongFromLocalLists(filename)
      return true
    } catch (e) {
      toast.error('删除 MIDI 失败', { description: String(e), richColors: true })
      console.error('删除 MIDI 失败:', e)
      return false
    }
  }

  /**
   * @description: 从本地库中移除 MIDI（不删除文件）
   * @param {string} filename - 要移除的文件名
   * @return 无
   */
  async function removeFromLibrary(filename: string): Promise<void> {
    const index = midiLibrary.value.findIndex((m) => m.filename === filename)
    if (index !== -1) {
      midiLibrary.value.splice(index, 1)
    }
    const shouldContinuePlayback = isPreviewPlaying.value && !isPreviewPaused.value
    previewQueueItems.value = previewQueueItems.value.filter((midi) => midi.filename !== filename)
    const removedCurrent = currentMidi.value?.filename === filename
    if (detailMidi.value?.filename === filename) {
      clearMidiDetail()
    }
    if (removedCurrent) {
      const fallbackQueue = getActivePreviewQueue()
      const fallback = fallbackQueue[0] ?? midiLibrary.value[0] ?? null
      if (fallback) {
        isResolvingPreviewQueueFallback = true
        try {
          // 当前播放文件已经从库中移除，先释放旧 WebAudio 数据，再把队列落到仍存在的歌曲。
          // 如果删除前正在播放，则自动接着播放 fallback；暂停或空闲时只更新当前选择。
          await stopPreviewPlayback()
          if (shouldContinuePlayback) {
            await playMidiInQueue(fallback, fallbackQueue, previewQueueContext.value)
            return
          }
          await selectMidi(fallback, {
            syncPreviewQueue: true,
            resetPreviewProgress: true,
          })
          await persistPreviewSelection(fallback)
        } finally {
          isResolvingPreviewQueueFallback = false
        }
      } else {
        clearCurrentPreviewSelection()
        await persistPreviewSelection(null)
      }
      return
    }
    // 删除非当前项时按当前来源整队同步，避免 playlist 元信息或歌单顺序与公共 Player 脱节。
    await syncActivePreviewQueue()
  }

  // ============================================
  // 音轨管理
  // ============================================

  /**
   * @description: 从 NoteEvent 列表构建音轨列表
   * @param {NoteEvent[]} events - MIDI 音符事件列表
   * @return {TrackInfo[]} 音轨信息列表
   */
  function buildTracksFromEvents(events: NoteEvent[]): TrackInfo[] {
    // 使用 Map 按 track 值去重
    const trackMap = new Map<number, TrackInfo>()

    for (const event of events) {
      if (!trackMap.has(event.track)) {
        trackMap.set(event.track, {
          index: trackMap.size,
          eventTrackValue: event.track, // MIDI 原始 track 值
          channel: event.channel,
          name: `${trackMap.size + 1}`, // 纯数字，显示时由组件处理 i18n
          noteCount: 0,
          isPercussion: event.channel === 9, // MIDI Channel 9 是打击乐
          enabled: true,
        })
      }
      trackMap.get(event.track)!.noteCount++
    }

    // 标记打击乐音轨（Channel 9）
    for (const [_trackIdx, track] of trackMap) {
      if (track.channel === 9) {
        track.isPercussion = true
        // 使用特殊标记，组件层处理翻译
        track.name = `${track.index}|percussion`
      }
    }

    // 按索引排序返回
    return Array.from(trackMap.values()).sort((a, b) => a.index - b.index)
  }

  /**
   * @description: 加载音轨屏蔽设置（从应用数据目录的配置文件）
   * @param {MidiInfo} midi - MIDI 文件信息
   * @return Promise
   */
  async function loadDisabledTracks(midi: MidiInfo) {
    try {
      const config = await invoke<MidiConfigResponse>('load_midi_config', {
        filename: midi.filename,
      })
      applyConfigToMidi(midi, config)
      disabledTracks.value = new Set(config.disabled_tracks)
      disabledTracksVersionRef.value = ++disabledTracksVersion
    } catch (e) {
      console.error('加载音轨配置失败:', e)
      disabledTracks.value = new Set()
      disabledTracksVersionRef.value = ++disabledTracksVersion
    }
  }

  /**
   * @description: 保存音轨屏蔽设置（写入应用数据目录的配置文件）
   * @return Promise
   */
  async function persistDisabledTracks() {
    if (!currentMidi.value) return
    try {
      const disabledArray = Array.from(disabledTracks.value).map((n) => n)
      await saveMidiConfig(currentMidi.value, disabledArray)
    } catch (e) {
      console.error('保存音轨配置失败:', e)
    }
  }

  /**
   * @description: 切换音轨启用状态（使用显示索引）
   * @param {number} displayIndex - 音轨显示索引
   * @return 无
   */
  function toggleTrack(displayIndex: number) {
    // 获取该显示索引对应的音轨
    const track = tracks.value.find((t) => t.index === displayIndex)
    if (!track) return

    // midi-player-js 的 track 值比 Rust 解析的大 1
    const midiPlayerTrackValue = track.eventTrackValue + 1

    if (disabledTracks.value.has(midiPlayerTrackValue)) {
      disabledTracks.value.delete(midiPlayerTrackValue)
    } else {
      disabledTracks.value.add(midiPlayerTrackValue)
    }
    // 递增版本号触发响应式更新
    disabledTracksVersionRef.value = ++disabledTracksVersion
    setDisabledTracks(disabledTracks.value)
    persistDisabledTracks()
  }

  /**
   * @description: 根据显示索引检查音轨是否被禁用
   * @param {number} displayIndex - 音轨显示索引
   * @return {boolean} 是否被禁用
   */
  function isTrackDisabled(displayIndex: number): boolean {
    const track = tracks.value.find((t) => t.index === displayIndex)
    if (!track) return false
    // midi-player-js 的 track 值比 Rust 解析的大 1
    const midiPlayerTrackValue = track.eventTrackValue + 1
    return disabledTracks.value.has(midiPlayerTrackValue)
  }

  /**
   * @description: 获取当前启用的音轨索引集合
   * @type {computed<Set<number>>}
   */
  const enabledTrackIndices = computed(() => {
    const indices = new Set<number>()
    for (let i = 0; i < tracks.value.length; i++) {
      if (!isTrackDisabled(i)) {
        indices.add(i)
      }
    }
    return indices
  })

  /**
   * @description: 解析 MIDI 的页面/播放器展示数据
   * @param {MidiInfo} midi - MIDI 文件
   * @return 旋律、全部音符、音轨和真实时长
   */
  async function readMidiAnalysis(midi: MidiInfo): Promise<{
    melody: MelodyEvent[]
    allNotes: MelodyEvent[]
    tracks: TrackInfo[]
    duration: number
  }> {
    const [extractedMelody, extractedAllNotes, midiData] = await Promise.all([
      invoke<MelodyEvent[]>('extract_melody', {
        events: midi.events,
        ticksPerBeat: midi.ticks_per_beat,
        tempo: 500000,
      }),
      invoke<MelodyEvent[]>('extract_all_notes', {
        events: midi.events,
        ticksPerBeat: midi.ticks_per_beat,
        tempo: 500000,
      }),
      invoke<number[]>('read_midi_data', {
        filename: midi.file_path,
      }),
    ])
    const uint8Array = new Uint8Array(midiData)
    const { duration } = await loadMidiForDuration(uint8Array.buffer)
    return {
      melody: extractedMelody,
      allNotes: extractedAllNotes,
      tracks: buildTracksFromEvents(midi.events as any),
      duration,
    }
  }

  /**
   * @description: 加载详情页音轨屏蔽设置
   * @param {MidiInfo} midi - MIDI 文件
   * @return {Promise<void>} 无返回值
   */
  async function loadDetailDisabledTracks(midi: MidiInfo): Promise<void> {
    try {
      const config = await invoke<MidiConfigResponse>('load_midi_config', {
        filename: midi.filename,
      })
      applyConfigToMidi(midi, config)
      detailDisabledTracks.value = new Set(config.disabled_tracks)
    } catch (e) {
      console.error('加载详情音轨配置失败:', e)
      detailDisabledTracks.value = new Set()
    } finally {
      detailDisabledTracksVersionRef.value = ++detailDisabledTracksVersion
    }
  }

  /**
   * @description: 保存详情页音轨屏蔽设置
   * @return {Promise<void>} 无返回值
   */
  async function persistDetailDisabledTracks(): Promise<void> {
    if (!detailMidi.value) return
    try {
      await saveMidiConfig(detailMidi.value, Array.from(detailDisabledTracks.value))
      if (currentMidi.value?.filename === detailMidi.value.filename) {
        disabledTracks.value = new Set(detailDisabledTracks.value)
        disabledTracksVersionRef.value = ++disabledTracksVersion
        setDisabledTracks(disabledTracks.value)
      }
    } catch (e) {
      console.error('保存详情音轨配置失败:', e)
    }
  }

  /**
   * @description: 切换详情页音轨启用状态
   * @param {number} displayIndex - 音轨显示索引
   * @return {void} 无返回值
   */
  function toggleDetailTrack(displayIndex: number): void {
    const track = detailTracks.value.find((item) => item.index === displayIndex)
    if (!track) return
    const midiPlayerTrackValue = track.eventTrackValue + 1
    if (detailDisabledTracks.value.has(midiPlayerTrackValue)) {
      detailDisabledTracks.value.delete(midiPlayerTrackValue)
    } else {
      detailDisabledTracks.value.add(midiPlayerTrackValue)
    }
    detailDisabledTracksVersionRef.value = ++detailDisabledTracksVersion
    if (currentMidi.value?.filename === detailMidi.value?.filename) {
      disabledTracks.value = new Set(detailDisabledTracks.value)
      disabledTracksVersionRef.value = ++disabledTracksVersion
      setDisabledTracks(disabledTracks.value)
    }
    void persistDetailDisabledTracks()
  }

  /**
   * @description: 清空详情页查看状态
   * @return {void} 无返回值
   */
  function clearMidiDetail(): void {
    detailMidi.value = null
    detailMelody.value = []
    detailAllNotes.value = []
    detailTracks.value = []
    detailDisabledTracks.value = new Set()
    detailDisabledTracksVersionRef.value = ++detailDisabledTracksVersion
    detailDuration.value = 0
  }

  /**
   * @description: 按文件名加载详情页 MIDI 数据
   * @param {string} filename - MIDI 文件名
   * @return {Promise<MidiInfo | null>} 找到并解析的 MIDI
   */
  async function loadMidiDetailByFilename(filename: string): Promise<MidiInfo | null> {
    const midi = midiLibrary.value.find((item) => item.filename === filename) ?? null
    if (!midi) {
      clearMidiDetail()
      return null
    }
    isDetailLoading.value = true
    try {
      detailMidi.value = midi
      const analysis = await readMidiAnalysis(midi)
      detailMelody.value = analysis.melody
      detailAllNotes.value = analysis.allNotes
      detailTracks.value = analysis.tracks
      detailDuration.value = analysis.duration
      await loadDetailDisabledTracks(midi)
      return midi
    } catch (e) {
      toast.error('解析 MIDI 失败', { description: String(e), richColors: true })
      console.error('解析 MIDI 详情失败:', e)
      clearMidiDetail()
      return null
    } finally {
      isDetailLoading.value = false
    }
  }

  // ============================================
  // MIDI 选择与详情
  // ============================================

  /**
   * @description: 选中当前播放 MIDI，不影响详情页路由
   * @param {MidiInfo} midi - MIDI 文件信息
   * @param {Object} [options] - 选项
   * @return Promise
   */
  async function selectMidi(
    midi: MidiInfo,
    options: {
      syncPreviewQueue?: boolean
      resetPreviewProgress?: boolean
    } & SelectMidiQueueOptions = {}
  ) {
    const requestId = ++selectMidiRequestId
    const { syncPreviewQueue = true, resetPreviewProgress = true } = options
    if (options.queueItems) {
      setPreviewQueueContext(options.queueItems, options.queueContext ?? null)
    }
    currentMidi.value = midi
    try {
      const analysis = await readMidiAnalysis(midi)
      if (requestId !== selectMidiRequestId || currentMidi.value?.filename !== midi.filename) return
      melody.value = analysis.melody
      allNotes.value = analysis.allNotes
      tracks.value = analysis.tracks

      // 加载缓存的音轨屏蔽设置
      await loadDisabledTracks(midi)

      const duration = analysis.duration
      previewDuration.value = duration
      if (syncPreviewQueue) {
        // 选中 MIDI 时把当前上下文同步给公共 Player，避免歌单播放回退到完整库列表。
        midiPreview?.syncMidiQueue(getActivePreviewQueue(), midi, previewQueueContext.value)
      }
      if (resetPreviewProgress) {
        previewPlayer?.updateProgress(0, duration / 1000)
      } else {
        previewPlayer?.updateProgress(previewCurrentTime.value / 1000, duration / 1000)
      }
    } catch (e) {
      if (requestId !== selectMidiRequestId) return
      toast.error('解析 MIDI 失败', { description: String(e), richColors: true })
      console.error('解析 MIDI 失败:', e)
    }
  }

  /**
   * @description: 扫描文件夹并导入所有 MIDI 文件
   * @param {string} folderPath - 文件夹路径
   * @return Promise
   */
  async function scanFolder(folderPath: string) {
    isLoading.value = true
    try {
      // 调用后端扫描文件夹
      const files = await invoke<MidiInfo[]>('scan_folder', { folderPath })

      for (const file of files) {
        // 检查是否已存在于内存中
        const existsInMemory = midiLibrary.value.some((m) => m.filename === file.filename)
        if (existsInMemory) continue

        // 检查配置文件是否存在
        let config: MidiConfigResponse | null = null
        try {
          config = await invoke<MidiConfigResponse>('load_midi_config', { filename: file.filename })
        } catch {
          // 配置文件不存在
        }

        if (config && config.duration_ms > 0) {
          // 配置文件存在，直接使用
          applyConfigToMidi(file, config)
          midiLibrary.value.push(file)
        } else {
          // 配置文件不存在，调用 importMidi 复制文件并计算
          const sourcePath = `${folderPath}/${file.filename}`
          try {
            const imported = await invoke<MidiInfo>('import_midi', { sourcePath })

            // 读取库中的文件计算时长
            const midiData = await invoke<number[]>('read_midi_data', {
              filename: imported.filename,
            })
            const uint8Array = new Uint8Array(midiData)
            const { duration } = await loadMidiForDuration(uint8Array.buffer)
            imported.duration_ms = Math.floor(duration)

            // 提取旋律
            const melody = await invoke<MelodyEvent[]>('extract_melody', {
              events: imported.events,
              ticksPerBeat: imported.ticks_per_beat,
              tempo: 500000,
            })
            imported.melody_note_count = melody.length

            // 保存配置
            await saveMidiConfig(imported, [])

            midiLibrary.value.push(imported)
          } catch (e) {
            console.warn('导入文件失败:', sourcePath, e)
          }
        }
      }
      await syncActivePreviewQueue()
    } catch (e) {
      toast.error('扫描文件夹失败', { description: String(e), richColors: true })
      console.error('扫描文件夹失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  // ============================================
  // Rust 后端播放控制（游戏内演奏）
  // ============================================

  /**
   * @description: 开始播放（Rust 后端控制的游戏内演奏）
   * @return Promise
   */
  async function startPlayback() {
    if (!currentMidi.value) return
    if (!settingsStore.getCurrentTemplate()) {
      alert('请先选择映射模板')
      return
    }
    try {
      await invoke('start_playback', {
        midiPath: currentMidi.value.filename,
        melody: melody.value,
        template: settingsStore.getCurrentTemplate()?.mappings,
        speed: speed.value,
      })
      await updatePlaybackState()
      await refreshLogs()
    } catch (e) {
      toast.error('播放失败', { description: String(e), richColors: true })
      console.error('播放失败:', e)
      alert(`播放失败: ${e}`)
    }
  }

  /**
   * @description: 暂停播放
   * @return Promise
   */
  async function pausePlayback() {
    try {
      await invoke('pause_playback')
      await updatePlaybackState()
    } catch (e) {
      toast.error('暂停失败', { description: String(e), richColors: true })
      console.error('暂停失败:', e)
    }
  }

  /**
   * @description: 继续播放
   * @return Promise
   */
  async function resumePlayback() {
    try {
      await invoke('resume_playback')
      await updatePlaybackState()
    } catch (e) {
      toast.error('继续播放失败', { description: String(e), richColors: true })
      console.error('继续播放失败:', e)
    }
  }

  /**
   * @description: 停止播放
   * @return Promise
   */
  async function stopPlayback() {
    try {
      await invoke('stop_playback')
      await updatePlaybackState()
    } catch (e) {
      toast.error('停止失败', { description: String(e), richColors: true })
      console.error('停止失败:', e)
    }
  }

  // ============================================
  // 试听播放控制（前端音频播放）
  // ============================================

  /**
   * @description: 开始试听
   * @return Promise
   */
  async function startPreview() {
    if (!currentMidi.value) return

    await midiPreview?.start(currentMidi.value, getActivePreviewQueue(), previewQueueContext.value)
  }

  /**
   * @description: 停止试听
   * @return 无
   */
  async function stopPreviewPlayback() {
    await previewPlayer?.stop()
  }

  /**
   * @description: 重启试听（保持当前播放位置）
   * @return Promise
   */
  async function restartPreview() {
    if (!currentMidi.value) return
    await midiPreview?.restart(
      currentMidi.value,
      getActivePreviewQueue(),
      previewQueueContext.value
    )
  }

  /**
   * @description: 初始化钢琴引擎（预热音频上下文）
   * @return Promise
   */
  async function initPianoEngine(): Promise<void> {
    // 预热音频上下文和 instrument
    await ensureInstrument()
    // 设置活跃音符变化回调（用于同步键盘高亮）
    setOnActiveNotesChange((notes) => {
      activeNotes.value = notes
    })
  }

  /**
   * @description: 清空活跃音符（切换模板时调用）
   * @return 无
   */
  function clearActiveNotes(): void {
    activeNotes.value = []
  }

  /**
   * @description: 应用当前播放模式的过滤器（实时切换，无需重启播放）
   * @return 无
   */
  function applyPlayModeFilter() {
    midiPreview?.applyPlaybackFilter()
  }

  function configurePreviewFilter() {
    if (settingsStore.playMode === 'piano') {
      const template = settingsStore.getCurrentTemplate()
      if (template) {
        const templatePitches = template.mappings.map((m) => m.pitch)
        // C 大调白键相对于八度起点的偏移量
        const WHITE_KEY_OFFSETS = [0, 2, 4, 5, 7, 9, 11]

        setNoteFilter(({ pitch }) => templatePitches.includes(pitch))
        setPitchMapper((originalPitch: number): number | null => {
          // 步骤1：量化到 C 大调白键
          const noteInOctave = originalPitch % 12

          // 找到最接近的白键偏移量
          let closestWhiteKeyOffset = WHITE_KEY_OFFSETS[0]
          let minWhiteKeyDistance = 12
          for (const offset of WHITE_KEY_OFFSETS) {
            const distance = Math.abs(offset - noteInOctave)
            if (distance < minWhiteKeyDistance) {
              minWhiteKeyDistance = distance
              closestWhiteKeyOffset = offset
            }
          }

          // 计算量化后的白键音高
          const whiteKeyPitch = originalPitch - noteInOctave + closestWhiteKeyOffset

          // 步骤2：在模板中查找完全匹配
          if (templatePitches.includes(whiteKeyPitch)) {
            return whiteKeyPitch
          }

          // 步骤3：找不到则找模板中最接近的音高
          let closestPitch = templatePitches[0] ?? 60
          let minDiff = Math.abs(whiteKeyPitch - closestPitch)
          for (const tp of templatePitches) {
            const diff = Math.abs(whiteKeyPitch - tp)
            if (diff < minDiff) {
              minDiff = diff
              closestPitch = tp
            }
          }
          return closestPitch
        })
      } else {
        setNoteFilter(null)
        setPitchMapper(null)
      }
    } else {
      setNoteFilter(null)
      setPitchMapper(null)
    }
  }

  /**
   * @description: 暂停试听
   * @return 无
   */
  function pausePreviewPlayback() {
    if (!isPreviewPlaying.value) return
    void previewPlayer?.pause()
  }

  /**
   * @description: 继续试听
   * @return 无
   */
  function resumePreviewPlayback() {
    if (!isPreviewPaused.value) return
    void previewPlayer?.resume()
  }

  /**
   * @description: 设置试听音量
   * @param {number} value - 音量值（0-1）
   * @return 无
   */
  function setPreviewVolumeValue(value: number) {
    void previewPlayer?.setVolume(value)
  }

  /**
   * @description: 切换静音状态
   * @return 无
   */
  function toggleMute() {
    void previewPlayer?.setMuted(!isPreviewMuted.value)
  }

  /**
   * @description: 将详情页当前音量应用到 midiPlayer（从悬浮层退出时调用）
   * @return 无
   */
  function applyDetailVolume() {
    midiPreview?.applyCurrentVolume()
  }

  /**
   * @description: 恢复详情页试听音量状态（悬浮模式退出时使用）
   * @param {number} volume - 进入悬浮前的音量值（0-1）
   * @param {boolean} muted - 进入悬浮前是否静音
   * @return Promise
   */
  async function restorePreviewVolumeState(volume: number, muted: boolean) {
    await midiPreview?.restoreVolumeState(volume, muted)
  }

  /**
   * @description: 跳转到指定时间播放
   * @param {number} time - 目标时间（毫秒）
   * @return Promise
   */
  async function seekPreview(time: number) {
    await midiPreview?.seekMs(time)
  }

  /**
   * @description: 跳转到指定时间并在未播放时直接开始播放（正常底栏使用）
   * @param {number} time - 目标时间（毫秒）
   * @return {Promise<void>} 无返回值
   */
  async function seekPreviewAndPlay(time: number) {
    await midiPreview?.seekMs(time, { autoPlay: true })
  }

  /**
   * @description: 标记为正在拖拽（阻止定时器覆盖）
   * @param {boolean} dragging - 是否正在拖拽
   * @return 无
   */
  function setDragging(dragging: boolean) {
    isDragging.value = dragging
    midiPreview?.setDragging(dragging)
  }

  /**
   * @description: 设置预览播放时间（仅更新显示值，用于点击进度条）
   * @param {number} time - 目标时间（毫秒）
   * @return 无
   */
  function setPreviewTime(time: number) {
    midiPreview?.setPreviewTime(time)
  }

  // ============================================
  // 上一曲/下一曲
  // ============================================

  /**
   * @description: 播放上一曲
   * @return Promise
   */
  async function playPrev() {
    if (getActivePreviewQueue().length === 0) return
    try {
      await midiPreview?.previous(
        getActivePreviewQueue(),
        currentMidi.value,
        previewQueueContext.value
      )
      const selected = currentMidi.value
      if (selected) {
        await selectMidi(selected, {
          syncPreviewQueue: false,
          resetPreviewProgress: false,
        })
        if (shouldPersistPreviewSelection()) {
          await persistPreviewSelection(selected)
        }
      }
    } catch (e) {
      toast.error('解析 MIDI 失败', { description: String(e), richColors: true })
      console.error('解析 MIDI 失败:', e)
    }
  }

  /**
   * @description: 播放下一曲
   * @return Promise
   */
  async function playNext() {
    if (getActivePreviewQueue().length === 0) return
    try {
      await midiPreview?.next(getActivePreviewQueue(), currentMidi.value, previewQueueContext.value)
      const selected = currentMidi.value
      if (selected) {
        await selectMidi(selected, {
          syncPreviewQueue: false,
          resetPreviewProgress: false,
        })
        if (shouldPersistPreviewSelection()) {
          await persistPreviewSelection(selected)
        }
      }
    } catch (e) {
      toast.error('解析 MIDI 失败', { description: String(e), richColors: true })
      console.error('解析 MIDI 失败:', e)
    }
  }

  /**
   * @description: 从播放器媒体中取回 MIDI 信息
   * @param {MediaItem | null} media - 公共播放器媒体
   * @return {MidiInfo | null} MIDI 信息或 null
   */
  function getMidiFromMedia(media: MediaItem | null): MidiInfo | null {
    const midi = media?.metadata?.midi as MidiInfo | undefined
    if (midi) return midi
    return midiLibrary.value.find((item) => item.filename === media?.id) ?? null
  }

  /**
   * @description: 只选择相邻曲目，不立即播放
   * @description 悬浮窗需要切歌后倒计时播放，因此这里只更新当前 MIDI 和进度。
   * @param {'prev' | 'next'} direction - 切歌方向
   * @return {Promise<boolean>} 是否成功切换到目标曲目
   */
  async function selectRelativePreview(direction: 'prev' | 'next'): Promise<boolean> {
    if (getActivePreviewQueue().length === 0) return false

    const selectedMedia =
      direction === 'prev'
        ? midiPreview?.selectPrevious(
            getActivePreviewQueue(),
            currentMidi.value,
            previewQueueContext.value
          )
        : midiPreview?.selectNext(
            getActivePreviewQueue(),
            currentMidi.value,
            previewQueueContext.value
          )
    const selectedMidi = getMidiFromMedia(selectedMedia ?? null)
    if (!selectedMidi) return false

    await selectMidi(selectedMidi, {
      syncPreviewQueue: false,
      resetPreviewProgress: true,
    })
    if (shouldPersistPreviewSelection()) {
      await persistPreviewSelection(selectedMidi)
    }
    return true
  }

  // ============================================
  // 状态同步
  // ============================================

  /**
   * @description: 更新播放状态（从 Rust 后端获取）
   * @return Promise
   */
  async function updatePlaybackState() {
    try {
      playbackState.value = await invoke<PlaybackState>('get_playback_state')
    } catch (e) {
      toast.error('获取播放状态失败', { description: String(e), richColors: true })
      console.error('获取播放状态失败:', e)
    }
  }

  /**
   * @description: 设置播放速度
   * @param {number} newSpeed - 新的速度倍率
   * @return Promise
   */
  async function setSpeed(newSpeed: number) {
    speed.value = newSpeed
    try {
      await invoke('set_speed', { speed: newSpeed })
    } catch (e) {
      toast.error('设置速度失败', { description: String(e), richColors: true })
      console.error('设置速度失败:', e)
    }
  }

  /**
   * @description: 刷新按键日志（从 Rust 后端）
   * @return Promise
   */
  async function refreshLogs() {
    try {
      keyLogs.value = await invoke<KeyLogEntry[]>('get_key_logs')
    } catch (e) {
      toast.error('获取日志失败', { description: String(e), richColors: true })
      console.error('获取日志失败:', e)
    }
  }

  /**
   * @description: 清空日志
   * @return Promise
   */
  async function clearLogs() {
    try {
      await invoke('clear_key_logs')
      keyLogs.value = []
    } catch (e) {
      toast.error('清空日志失败', { description: String(e), richColors: true })
      console.error('清空日志失败:', e)
    }
  }

  /**
   * @description: 当前激活的按键集合（根据播放时间和旋律音符自动计算）
   * @type {computed<Set<string>>}
   */
  const activeKeys = computed<Set<string>>(() => {
    const currentTime = previewCurrentTime.value
    const active = new Set<string>()

    for (const event of melody.value) {
      const startTime = event.start_ms
      const endTime = event.start_ms + event.duration_ms
      if (currentTime >= startTime && currentTime < endTime) {
        // 找到当前时间对应的键盘映射
        const mapping = settingsStore
          .getCurrentTemplate()
          ?.mappings.find((m) => m.pitch === event.pitch)
        if (mapping) {
          active.add(mapping.key)
        }
      }
    }

    return active
  })

  // ============================================
  // 日志轮询
  // ============================================

  /** 日志轮询定时器 ID */
  let logPollInterval: number | null = null

  /**
   * @description: 开始日志轮询（用于实时显示按键日志）
   * @return 无
   */
  function startLogPolling() {
    if (logPollInterval) return
    logPollInterval = window.setInterval(refreshLogs, 200)
  }

  /**
   * @description: 停止日志轮询
   * @return 无
   */
  function stopLogPolling() {
    if (logPollInterval) {
      clearInterval(logPollInterval)
      logPollInterval = null
    }
  }

  function buildMidiLibraryQueueSignature(): string {
    return midiLibrary.value
      .map((midi) =>
        [
          midi.filename,
          midi.duration_ms,
          midi.title ?? '',
          midi.author_name ?? '',
          midi.description ?? '',
        ].join('\u0001')
      )
      .join('\u0002')
  }

  function buildSongListQueueSignature(): string {
    return songListStore.songLists
      .map((songList) =>
        [songList.id, songList.name, songList.song_filenames.join('\u0001')].join('\u0001')
      )
      .join('\u0002')
  }

  watch([buildMidiLibraryQueueSignature, buildSongListQueueSignature], () => {
    void syncActivePreviewQueue()
  })

  // ============================================
  // 返回
  // ============================================

  return {
    // 状态
    midiLibrary,
    lastImportedMidi,
    currentMidi,
    melody,
    allNotes,
    tracks,
    disabledTracks,
    disabledTracksVersion: disabledTracksVersionRef,
    enabledTrackIndices,
    detailMidi,
    detailMelody,
    detailAllNotes,
    detailTracks,
    detailDisabledTracks,
    detailDisabledTracksVersion: detailDisabledTracksVersionRef,
    detailDuration,
    isDetailLoading,
    playbackState,
    keyLogs,
    activeNotes,
    activeKeys,
    speed,
    isLoading,
    hasAccessibility,
    isPreviewPlaying,
    isPreviewPaused,
    previewCurrentTime,
    previewDuration,
    previewVolume,
    isPreviewMuted,
    previewState,
    previewPlaybackMode,
    previewQueueItems,
    previewQueueContext,
    previewQueueSourceId,
    activePreviewQueueItems,
    currentTemporaryOnlineSongId,
    // 方法
    bindPreviewRuntime,
    loadMidiLibrary,
    restoreInitialPreviewSelection,
    importPaths,
    importMidi,
    importMidiBuffer,
    clearLastImportedMidi,
    deleteMidi,
    removeFromLibrary,
    syncActivePreviewQueue,
    setPreviewQueueContext,
    getSongPlaybackState,
    selectMidiInQueue,
    playMidiInQueue,
    toggleMidiInQueue,
    playTemporaryMidiBuffer,
    restoreTemporaryOnlinePreview,
    replaceTemporaryOnlinePreviewWithLocal,
    selectMidi,
    clearMidiDetail,
    loadMidiDetailByFilename,
    scanFolder,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    updatePlaybackState,
    setSpeed,
    refreshLogs,
    clearLogs,
    checkAccessibility,
    startLogPolling,
    stopLogPolling,
    startPreview,
    stopPreviewPlayback,
    restartPreview,
    pausePreviewPlayback,
    resumePreviewPlayback,
    seekPreview,
    seekPreviewAndPlay,
    setPreviewVolumeValue,
    setDragging,
    setPreviewTime,
    toggleMute,
    applyDetailVolume,
    restorePreviewVolumeState,
    applyPlaylistPlaybackMode,
    setPlaylistPlaybackMode,
    playPrev,
    playNext,
    selectRelativePreview,
    toggleTrack,
    toggleDetailTrack,
    initPianoEngine,
    applyPlayModeFilter,
    clearActiveNotes,
  }
})
