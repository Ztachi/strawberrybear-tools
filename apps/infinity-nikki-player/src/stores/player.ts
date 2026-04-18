/**
 * @fileOverview 播放器状态管理 - 管理 MIDI 库、播放状态、试听功能等
 * @description 使用 Pinia 管理的播放器状态，包含 MIDI 文件管理、试听播放、音轨控制等功能
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'vue-sonner'
import type {
  KeyLogEntry,
  MidiInfo,
  MelodyEvent,
  PlaybackState,
  TrackInfo,
  NoteEvent,
} from '@/types'
import {
  playMidi,
  stopPreview,
  pausePreview,
  resumePreview,
  getTotalDuration,
  setVolume as setPreviewVolume,
  seekTo,
  loadMidiForDuration,
  setDisabledTracks,
  setNoteFilter,
  setPitchMapper,
  ensureInstrument,
  setOnActiveNotesChange,
} from '@/lib/midiPlayer'
import { useSettingsStore } from './settings'

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

  /** 是否显示详情 Drawer */
  const showDetail = ref(false)

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

  /** 预览定时器 ID */
  let previewTimer: ReturnType<typeof setInterval> | null = null

  /** 开始播放时的时间戳（毫秒，用于计算已播放时间） */
  let playbackStartTime = 0

  /** 暂停时的已播放时间（毫秒，用于恢复播放） */
  let pausedAtTime = 0

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
          const config = await invoke<{
            filename: string
            duration_ms: number
            track_count: number
            melody_note_count: number
            ticks_per_beat: number
            tempo: number
            disabled_tracks: number[]
          }>('load_midi_config', { filename: file.filename })

          // 使用配置中的值（配置存在时优先使用）
          if (config.duration_ms > 0) {
            file.duration_ms = config.duration_ms
          }
          if (config.track_count > 0) {
            file.track_count = config.track_count
          }
          if (config.melody_note_count > 0) {
            file.melody_note_count = config.melody_note_count
          }
          if (config.ticks_per_beat > 0) {
            file.ticks_per_beat = config.ticks_per_beat
          }
          if (config.tempo > 0) {
            file.tempo = config.tempo
          }
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
            await invoke('save_midi_config', {
              filename: file.filename,
              durationMs: Math.floor(duration),
              trackCount: file.track_count,
              melodyNoteCount: melody.length,
              ticksPerBeat: file.ticks_per_beat,
              tempo: file.tempo,
              disabledTracks: [],
            })
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
        // 已存在，直接打开详情
        await selectMidi(midiLibrary.value[existingIndex])
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
      await invoke('save_midi_config', {
        filename: info.filename,
        durationMs: Math.floor(duration),
        trackCount: info.track_count,
        melodyNoteCount: melody.length,
        ticksPerBeat: info.ticks_per_beat,
        tempo: info.tempo,
        disabledTracks: [],
      })

      // 添加到本地库列表
      midiLibrary.value.push(info)

      // 选中并打开详情
      await selectMidi(info)
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
      const { autoSelect = true } = options

      // 统一转换为数组格式（Rust 后端需要 number[]）
      const payload = data instanceof Uint8Array ? Array.from(data) : data

      // 调用后端导入
      const info = await invoke<MidiInfo>('import_midi_buffer', { filename, data: payload })

      // 检查是否已存在
      const existingIndex = midiLibrary.value.findIndex((m) => m.filename === info.filename)
      if (existingIndex !== -1) {
        if (autoSelect) {
          await selectMidi(midiLibrary.value[existingIndex])
        }
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
      await invoke('save_midi_config', {
        filename: info.filename,
        durationMs: Math.floor(duration),
        trackCount: info.track_count,
        melodyNoteCount: melody.length,
        ticksPerBeat: info.ticks_per_beat,
        tempo: info.tempo,
        disabledTracks: [],
      })

      midiLibrary.value.push(info)
      if (autoSelect) {
        await selectMidi(info)
      }
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
   * @description: 从库中删除 MIDI 文件
   * @param {string} filename - 要删除的文件名
   * @return Promise 删除是否成功
   */
  async function deleteMidi(filename: string) {
    try {
      // 调用后端删除文件
      await invoke('delete_midi_from_library', { filename })
      // 从本地库移除
      removeFromLibrary(filename)
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
  function removeFromLibrary(filename: string) {
    const index = midiLibrary.value.findIndex((m) => m.filename === filename)
    if (index !== -1) {
      midiLibrary.value.splice(index, 1)
    }
    // 如果删除的是当前选中的，关闭详情
    if (currentMidi.value?.filename === filename) {
      closeDetail()
    }
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
      const config = await invoke<{
        filename: string
        duration_ms: number
        track_count: number
        ticks_per_beat: number
        tempo: number
        disabled_tracks: number[]
      }>('load_midi_config', { filename: midi.filename })

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
      await invoke('save_midi_config', {
        filename: currentMidi.value.filename,
        durationMs: currentMidi.value.duration_ms,
        trackCount: currentMidi.value.track_count,
        melodyNoteCount: currentMidi.value.melody_note_count || 0,
        ticksPerBeat: currentMidi.value.ticks_per_beat,
        tempo: currentMidi.value.tempo,
        disabledTracks: disabledArray,
      })
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

  // ============================================
  // MIDI 选择与详情
  // ============================================

  /**
   * @description: 选中 MIDI 并打开详情
   * @param {MidiInfo} midi - MIDI 文件信息
   * @return Promise
   */
  async function selectMidi(midi: MidiInfo) {
    currentMidi.value = midi
    try {
      // 从缓存的 events 提取旋律（包含 pitch_name）
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
        events: midi.events,
        ticksPerBeat: midi.ticks_per_beat,
        tempo: 500000,
      })

      // 提取所有音符用于键盘映射
      allNotes.value = await invoke<MelodyEvent[]>('extract_all_notes', {
        events: midi.events,
        ticksPerBeat: midi.ticks_per_beat,
        tempo: 500000,
      })

      // 构建音轨列表
      tracks.value = buildTracksFromEvents(midi.events as any)

      // 加载缓存的音轨屏蔽设置
      loadDisabledTracks(midi)

      // 读取 MIDI 文件获取实际时长
      const midiData = await invoke<number[]>('read_midi_data', {
        filename: midi.file_path,
      })
      const uint8Array = new Uint8Array(midiData)
      const { duration } = await loadMidiForDuration(uint8Array.buffer)
      previewDuration.value = duration
    } catch (e) {
      toast.error('解析 MIDI 失败', { description: String(e), richColors: true })
      console.error('解析 MIDI 失败:', e)
    }
    showDetail.value = true
  }

  /**
   * @description: 关闭详情
   * @return 无
   */
  function closeDetail() {
    stopPreviewPlayback() // 停止试听
    showDetail.value = false
    currentMidi.value = null
    melody.value = []
    tracks.value = []
    disabledTracks.value.clear()
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
        let config = null
        try {
          config = await invoke<{
            filename: string
            duration_ms: number
            track_count: number
            melody_note_count: number
            ticks_per_beat: number
            tempo: number
            disabled_tracks: number[]
          }>('load_midi_config', { filename: file.filename })
        } catch {
          // 配置文件不存在
        }

        if (config && config.duration_ms > 0) {
          // 配置文件存在，直接使用
          file.duration_ms = config.duration_ms
          file.melody_note_count = config.melody_note_count
          file.ticks_per_beat = config.ticks_per_beat
          file.tempo = config.tempo
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
            await invoke('save_midi_config', {
              filename: imported.filename,
              durationMs: Math.floor(duration),
              trackCount: imported.track_count,
              melodyNoteCount: melody.length,
              ticksPerBeat: imported.ticks_per_beat,
              tempo: imported.tempo,
              disabledTracks: [],
            })

            midiLibrary.value.push(imported)
          } catch (e) {
            console.warn('导入文件失败:', sourcePath, e)
          }
        }
      }
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

    try {
      // 同步音轨屏蔽设置到播放器
      setDisabledTracks(disabledTracks.value)

      // 根据播放模式配置过滤器
      if (settingsStore.playMode === 'piano') {
        // Piano 模式：使用模板音高过滤和映射
        const template = settingsStore.getCurrentTemplate()
        if (template) {
          // 提取模板中的所有音高
          const templatePitches = template.mappings.map((m) => m.pitch)

          // C 大调白键相对于八度起点的偏移量
          const WHITE_KEY_OFFSETS = [0, 2, 4, 5, 7, 9, 11] // C, D, E, F, G, A, B

          // 设置音高过滤器：只允许模板音高
          setNoteFilter(({ pitch }) => templatePitches.includes(pitch))

          // 设置音高映射器（将任意音高映射到模板音高）
          setPitchMapper((originalPitch: number): number | null => {
            // 步骤1：量化到 C 大调白键
            const noteInOctave = originalPitch % 12
            const octave = Math.floor(originalPitch / 12)

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
            const whiteKeyPitch = octave * 12 + closestWhiteKeyOffset

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
          // 没有模板，移除过滤器和映射器
          setNoteFilter(null)
          setPitchMapper(null)
        }
      } else {
        // Auto 模式：移除过滤器，播放所有音符
        setNoteFilter(null)
        setPitchMapper(null)
      }

      // 读取 MIDI 文件二进制数据
      const midiData = await invoke<number[]>('read_midi_data', {
        filename: currentMidi.value.file_path,
      })
      const uint8Array = new Uint8Array(midiData)

      // 播放
      await playMidi(uint8Array.buffer, speed.value)
      previewDuration.value = getTotalDuration()

      isPreviewPlaying.value = true
      isPreviewPaused.value = false
      pausedAtTime = 0
      startPreviewTimer()
    } catch (e) {
      toast.error('试听失败', { description: String(e), richColors: true })
      console.error('试听失败:', e)
      isPreviewPlaying.value = false
    }
  }

  /**
   * @description: 停止试听
   * @return 无
   */
  function stopPreviewPlayback() {
    stopPreview()
    stopPreviewTimer()
    isPreviewPlaying.value = false
    isPreviewPaused.value = false
    previewCurrentTime.value = 0
    pausedAtTime = 0
  }

  /**
   * @description: 重启试听（保持当前播放位置）
   * @return Promise
   */
  async function restartPreview() {
    if (!currentMidi.value) return
    const currentTime = previewCurrentTime.value
    stopPreview()
    stopPreviewTimer()
    previewCurrentTime.value = 0
    pausedAtTime = 0

    try {
      setDisabledTracks(disabledTracks.value)

      if (settingsStore.playMode === 'piano') {
        const template = settingsStore.getCurrentTemplate()
        if (template) {
          const templatePitches = template.mappings.map((m) => m.pitch)
          setNoteFilter(({ pitch }) => templatePitches.includes(pitch))
          setPitchMapper((originalPitch: number): number | null => {
            if (templatePitches.includes(originalPitch)) {
              return originalPitch
            }
            let closestPitch = templatePitches[0] ?? 60
            let minDiff = Math.abs(originalPitch - closestPitch)
            for (const tp of templatePitches) {
              const diff = Math.abs(originalPitch - tp)
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

      const midiData = await invoke<number[]>('read_midi_data', {
        filename: currentMidi.value.file_path,
      })
      const uint8Array = new Uint8Array(midiData)
      await playMidi(uint8Array.buffer, speed.value)
      previewDuration.value = getTotalDuration()

      isPreviewPlaying.value = true
      isPreviewPaused.value = false
      pausedAtTime = 0
      startPreviewTimer()

      // 跳转到之前的播放位置
      if (currentTime > 0) {
        seekPreview(currentTime)
      }
    } catch (e) {
      toast.error('试听失败', { description: String(e), richColors: true })
      console.error('试听失败:', e)
      isPreviewPlaying.value = false
    }
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
    pausedAtTime = previewCurrentTime.value // 保存当前播放位置
    pausePreview()
    isPreviewPaused.value = true
    stopPreviewTimer()
  }

  /**
   * @description: 继续试听
   * @return 无
   */
  function resumePreviewPlayback() {
    if (!isPreviewPaused.value) return
    resumePreview()
    isPreviewPaused.value = false
    startPreviewTimer()
  }

  /**
   * @description: 设置试听音量
   * @param {number} value - 音量值（0-1）
   * @return 无
   */
  function setPreviewVolumeValue(value: number) {
    setPreviewVolume(value)
    previewVolume.value = value
    if (value > 0) {
      isPreviewMuted.value = false
    }
  }

  /**
   * @description: 切换静音状态
   * @return 无
   */
  function toggleMute() {
    if (isPreviewMuted.value) {
      setPreviewVolume(previewVolume.value)
      isPreviewMuted.value = false
    } else {
      setPreviewVolume(0)
      isPreviewMuted.value = true
    }
  }

  /**
   * @description: 将详情页当前音量应用到 midiPlayer（从悬浮层退出时调用）
   * @return 无
   */
  function applyDetailVolume() {
    if (isPreviewMuted.value) {
      setPreviewVolume(0)
    } else {
      setPreviewVolume(previewVolume.value)
    }
  }

  /**
   * @description: 跳转到指定时间播放
   * @param {number} time - 目标时间（毫秒）
   * @return Promise
   */
  async function seekPreview(time: number) {
    previewCurrentTime.value = time
    pausedAtTime = time
    if (!isDragging.value) {
      if (!currentMidi.value) return
      const midiData = await invoke<number[]>('read_midi_data', {
        filename: currentMidi.value.file_path,
      })
      const uint8Array = new Uint8Array(midiData)
      await playMidi(uint8Array.buffer, speed.value)
      seekTo(time)
      isPreviewPlaying.value = true
      isPreviewPaused.value = false
      playbackStartTime = performance.now() - time
      startPreviewTimer()
    }
  }

  // ============================================
  // 定时器管理
  // ============================================

  /**
   * @description: 开始预览定时器（60fps 平滑更新播放时间）
   * @return 无
   */
  function startPreviewTimer() {
    stopPreviewTimer()
    playbackStartTime = performance.now() - pausedAtTime

    previewTimer = setInterval(() => {
      // 如果不在拖拽中，用 performance.now() 计算时间
      if (!isDragging.value) {
        pausedAtTime = performance.now() - playbackStartTime
        // 播放结束，停止计时
        if (pausedAtTime >= previewDuration.value) {
          previewCurrentTime.value = previewDuration.value
          stopPreviewTimer()
          isPreviewPlaying.value = false
          return
        }
        previewCurrentTime.value = Math.max(0, pausedAtTime)
      }
    }, 16) // 16ms ≈ 60fps
  }

  /**
   * @description: 标记为正在拖拽（阻止定时器覆盖）
   * @param {boolean} dragging - 是否正在拖拽
   * @return 无
   */
  function setDragging(dragging: boolean) {
    isDragging.value = dragging
    if (!dragging) {
      // 拖拽结束，重置播放起始时间
      playbackStartTime = performance.now() - previewCurrentTime.value
    }
  }

  /**
   * @description: 设置预览播放时间（仅更新显示值，用于点击进度条）
   * @param {number} time - 目标时间（毫秒）
   * @return 无
   */
  function setPreviewTime(time: number) {
    previewCurrentTime.value = time
  }

  /**
   * @description: 停止预览定时器
   * @return 无
   */
  function stopPreviewTimer() {
    if (previewTimer) {
      clearInterval(previewTimer)
      previewTimer = null
    }
  }

  // ============================================
  // 上一曲/下一曲
  // ============================================

  /**
   * @description: 播放上一曲
   * @return Promise
   */
  async function playPrev() {
    if (midiLibrary.value.length === 0) return
    stopPreviewPlayback()
    const currentIndex = midiLibrary.value.findIndex(
      (m) => m.filename === currentMidi.value?.filename
    )
    // 循环播放：到头则跳到最后一首
    const prevIndex = currentIndex <= 0 ? midiLibrary.value.length - 1 : currentIndex - 1
    const prevMidi = midiLibrary.value[prevIndex]
    currentMidi.value = prevMidi
    try {
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
        events: prevMidi.events,
        ticksPerBeat: prevMidi.ticks_per_beat,
        tempo: 500000,
      })
      allNotes.value = await invoke<MelodyEvent[]>('extract_all_notes', {
        events: prevMidi.events,
        ticksPerBeat: prevMidi.ticks_per_beat,
        tempo: 500000,
      })
      tracks.value = buildTracksFromEvents(prevMidi.events as any)
      loadDisabledTracks(prevMidi)
      const midiData = await invoke<number[]>('read_midi_data', {
        filename: prevMidi.file_path,
      })
      const uint8Array = new Uint8Array(midiData)
      const { duration } = await loadMidiForDuration(uint8Array.buffer)
      previewDuration.value = duration
      showDetail.value = true
      // 选择后立即开始播放
      startPreview()
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
    if (midiLibrary.value.length === 0) return
    stopPreviewPlayback()
    const currentIndex = midiLibrary.value.findIndex(
      (m) => m.filename === currentMidi.value?.filename
    )
    // 循环播放：到尾则跳到第一首
    const nextIndex = currentIndex >= midiLibrary.value.length - 1 ? 0 : currentIndex + 1
    const nextMidi = midiLibrary.value[nextIndex]
    currentMidi.value = nextMidi
    try {
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
        events: nextMidi.events,
        ticksPerBeat: nextMidi.ticks_per_beat,
        tempo: 500000,
      })
      allNotes.value = await invoke<MelodyEvent[]>('extract_all_notes', {
        events: nextMidi.events,
        ticksPerBeat: nextMidi.ticks_per_beat,
        tempo: 500000,
      })
      tracks.value = buildTracksFromEvents(nextMidi.events as any)
      loadDisabledTracks(nextMidi)
      const midiData = await invoke<number[]>('read_midi_data', {
        filename: nextMidi.file_path,
      })
      const uint8Array = new Uint8Array(midiData)
      const { duration } = await loadMidiForDuration(uint8Array.buffer)
      previewDuration.value = duration
      showDetail.value = true
      // 选择后立即开始播放
      startPreview()
    } catch (e) {
      toast.error('解析 MIDI 失败', { description: String(e), richColors: true })
      console.error('解析 MIDI 失败:', e)
    }
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

  // ============================================
  // 返回
  // ============================================

  return {
    // 状态
    midiLibrary,
    currentMidi,
    melody,
    allNotes,
    tracks,
    disabledTracks,
    disabledTracksVersion: disabledTracksVersionRef,
    enabledTrackIndices,
    showDetail,
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
    // 方法
    loadMidiLibrary,
    importPaths,
    importMidi,
    importMidiBuffer,
    deleteMidi,
    removeFromLibrary,
    selectMidi,
    closeDetail,
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
    seekTo,
    setPreviewVolumeValue,
    setDragging,
    setPreviewTime,
    toggleMute,
    applyDetailVolume,
    playPrev,
    playNext,
    toggleTrack,
    initPianoEngine,
    applyPlayModeFilter,
    clearActiveNotes,
  }
})
