import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'vue-sonner'
import type {
  KeyLogEntry,
  MidiInfo,
  MelodyEvent,
  PlaybackState,
  KeyTemplate,
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
} from '@/lib/midiPlayer'

/** 音轨屏蔽设置缓存 */
interface TrackSettings {
  [filename: string]: number[] // 禁用的音轨索引数组
}

export const usePlayerStore = defineStore('player', () => {
  // MIDI 库（已导入的文件列表）
  const midiLibrary = ref<MidiInfo[]>([])

  // 当前选中的 MIDI
  const currentMidi = ref<MidiInfo | null>(null)

  // 当前 MIDI 的旋律数据
  const melody = ref<MelodyEvent[]>([])

  // 当前 MIDI 的音轨列表
  const tracks = ref<TrackInfo[]>([])

  // 禁用的音轨索引集合
  const disabledTracks = ref<Set<number>>(new Set())
  // 用于强制触发响应式更新的版本号
  let disabledTracksVersion = 0
  const disabledTracksVersionRef = ref(0)

  // 是否显示详情 Drawer
  const showDetail = ref(false)

  // 播放状态
  const playbackState = ref<PlaybackState>({
    status: 'idle',
    midi_name: null,
    current_tick: 0,
    speed: 1.0,
  })

  // 按键日志（最多 50 条）
  const keyLogs = ref<KeyLogEntry[]>([])

  // 模板相关
  const templates = ref<KeyTemplate[]>([])
  const currentTemplate = ref<KeyTemplate | null>(null)

  // 速度
  const speed = ref(1.0)

  // 是否加载中
  const isLoading = ref(false)

  // 辅助功能权限状态
  const hasAccessibility = ref(false)

  // 试听状态
  const isPreviewPlaying = ref(false)
  const isPreviewPaused = ref(false)
  const previewCurrentTime = ref(0)
  const previewDuration = ref(0)
  const previewVolume = ref(1)
  const isPreviewMuted = ref(false)
  const isDragging = ref(false) // 标记是否正在拖拽进度条
  let previewTimer: ReturnType<typeof setInterval> | null = null
  let playbackStartTime = 0 // 开始播放时的时间戳（毫秒）
  let pausedAtTime = 0 // 暂停时的已播放时间（毫秒）

  /** 检查辅助功能权限 */
  async function checkAccessibility() {
    try {
      hasAccessibility.value = await invoke<boolean>('check_accessibility')
    } catch {
      hasAccessibility.value = false
    }
  }

  /** 加载 MIDI 库列表（从应用数据目录） */
  async function loadMidiLibrary() {
    isLoading.value = true
    try {
      const files = await invoke<MidiInfo[]>('get_midi_library')
      // 为每个文件加载配置（时长、音轨数等）
      for (const file of files) {
        try {
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

  /** 导入 MIDI 文件到库中（复制到应用数据目录） */
  async function importMidi(sourcePath: string) {
    isLoading.value = true
    try {
      // 调用后端复制文件到库目录并获取信息
      const info = await invoke<MidiInfo>('import_midi', { sourcePath })
      // 通过后端读取 MIDI 文件计算正确时长
      const midiData = await invoke<number[]>('read_midi_data', { filename: info.filename })
      const uint8Array = new Uint8Array(midiData)
      const { duration } = await loadMidiForDuration(uint8Array.buffer)
      // duration 可能是浮点数，转为 u64
      info.duration_ms = Math.floor(duration)
      // 提取旋律并获取音符数
      const melody = await invoke<MelodyEvent[]>('extract_melody', {
        events: info.events,
        ticksPerBeat: info.ticks_per_beat,
        tempo: 500000,
      })
      info.melody_note_count = melody.length
      // 保存配置到文件（文件名、时长、音轨数、旋律音符数、音轨禁用状态）
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

  /** 从库中删除 MIDI 文件 */
  async function deleteMidi(filename: string) {
    try {
      await invoke('delete_midi_from_library', { filename })
      removeFromLibrary(filename)
      return true
    } catch (e) {
      toast.error('删除 MIDI 失败', { description: String(e), richColors: true })
      console.error('删除 MIDI 失败:', e)
      return false
    }
  }

  /** 从库中删除 MIDI */
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

  /** 从 NoteEvent 构建音轨列表 */
  function buildTracksFromEvents(events: NoteEvent[]): TrackInfo[] {
    const trackMap = new Map<number, TrackInfo>()

    for (const event of events) {
      if (!trackMap.has(event.track)) {
        trackMap.set(event.track, {
          index: trackMap.size,
          eventTrackValue: event.track, // MIDI 原始 track 值
          channel: event.channel,
          name: `音轨 ${trackMap.size + 1}`,
          noteCount: 0,
          isPercussion: event.channel === 9,
          enabled: true,
        })
      }
      trackMap.get(event.track)!.noteCount++
    }

    // 标记打击乐音轨
    for (const [trackIdx, track] of trackMap) {
      if (track.channel === 9) {
        track.isPercussion = true
        track.name = `打击乐`
      }
    }

    return Array.from(trackMap.values()).sort((a, b) => a.index - b.index)
  }

  /** 加载音轨屏蔽设置（从应用数据目录的配置文件） */
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

  /** 保存音轨屏蔽设置（写入应用数据目录的配置文件） */
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

  /** 切换音轨启用状态（使用显示索引） */
  function toggleTrack(displayIndex: number) {
    // 获取该显示索引对应的 midi-player-js track 值
    const track = tracks.value.find((t) => t.index === displayIndex)
    if (!track) return

    // midi-player-js 的 track 值比 Rust 解析的大 1
    const midiPlayerTrackValue = track.eventTrackValue + 1

    if (disabledTracks.value.has(midiPlayerTrackValue)) {
      disabledTracks.value.delete(midiPlayerTrackValue)
    } else {
      disabledTracks.value.add(midiPlayerTrackValue)
    }
    disabledTracksVersionRef.value = ++disabledTracksVersion
    persistDisabledTracks()
  }

  /** 根据显示索引检查音轨是否被禁用 */
  function isTrackDisabled(displayIndex: number): boolean {
    const track = tracks.value.find((t) => t.index === displayIndex)
    if (!track) return false
    // midi-player-js 的 track 值比 Rust 解析的大 1
    const midiPlayerTrackValue = track.eventTrackValue + 1
    return disabledTracks.value.has(midiPlayerTrackValue)
  }

  /** 获取当前启用的音轨索引集合 */
  const enabledTrackIndices = computed(() => {
    const indices = new Set<number>()
    for (let i = 0; i < tracks.value.length; i++) {
      if (!isTrackDisabled(i)) {
        indices.add(i)
      }
    }
    return indices
  })

  /** 选中 MIDI 并打开详情 */
  async function selectMidi(midi: MidiInfo) {
    currentMidi.value = midi
    try {
      // 从缓存的 events 提取旋律（包含 pitch_name）
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
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

  /** 关闭详情 */
  function closeDetail() {
    stopPreviewPlayback() // 停止试听
    showDetail.value = false
    currentMidi.value = null
    melody.value = []
    tracks.value = []
    disabledTracks.value.clear()
  }

  /** 扫描文件夹并导入所有 MIDI */
  async function scanFolder(folderPath: string) {
    isLoading.value = true
    try {
      const files = await invoke<MidiInfo[]>('scan_folder', { folderPath })
      for (const file of files) {
        const exists = midiLibrary.value.some((m) => m.filename === file.filename)
        if (!exists) {
          // 计算正确的时长
          try {
            const midiData = await invoke<number[]>('read_midi_data', { filename: file.file_path })
            const uint8Array = new Uint8Array(midiData)
            const { duration } = await loadMidiForDuration(uint8Array.buffer)
            file.duration_ms = duration
          } catch (e) {
            console.warn('计算时长失败:', file.filename, e)
          }
          midiLibrary.value.push(file)
        }
      }
    } catch (e) {
      toast.error('扫描文件夹失败', { description: String(e), richColors: true })
      console.error('扫描文件夹失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  /** 开始播放 */
  async function startPlayback() {
    if (!currentMidi.value) return
    if (!currentTemplate.value) {
      alert('请先选择映射模板')
      return
    }
    try {
      await invoke('start_playback', {
        midiPath: currentMidi.value.filename,
        melody: melody.value,
        template: currentTemplate.value.mappings,
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

  /** 暂停播放 */
  async function pausePlayback() {
    try {
      await invoke('pause_playback')
      await updatePlaybackState()
    } catch (e) {
      toast.error('暂停失败', { description: String(e), richColors: true })
      console.error('暂停失败:', e)
    }
  }

  /** 继续播放 */
  async function resumePlayback() {
    try {
      await invoke('resume_playback')
      await updatePlaybackState()
    } catch (e) {
      toast.error('继续播放失败', { description: String(e), richColors: true })
      console.error('继续播放失败:', e)
    }
  }

  /** 停止播放 */
  async function stopPlayback() {
    try {
      await invoke('stop_playback')
      await updatePlaybackState()
    } catch (e) {
      toast.error('停止失败', { description: String(e), richColors: true })
      console.error('停止失败:', e)
    }
  }

  /** 开始试听 */
  async function startPreview() {
    if (!currentMidi.value) return

    try {
      // 同步音轨屏蔽设置到播放器
      setDisabledTracks(disabledTracks.value)

      // 通过后端读取 MIDI 文件二进制数据
      const midiData = await invoke<number[]>('read_midi_data', {
        filename: currentMidi.value.file_path,
      })
      // 转换为 Uint8Array
      const uint8Array = new Uint8Array(midiData)
      // 播放
      await playMidi(uint8Array.buffer, speed.value)
      isPreviewPlaying.value = true
      isPreviewPaused.value = false
      previewDuration.value = getTotalDuration()
      pausedAtTime = 0 // 重置暂停时间
      startPreviewTimer()
    } catch (e) {
      toast.error('试听失败', { description: String(e), richColors: true })
      console.error('试听失败:', e)
      isPreviewPlaying.value = false
    }
  }

  /** 停止试听 */
  function stopPreviewPlayback() {
    stopPreview()
    stopPreviewTimer()
    isPreviewPlaying.value = false
    isPreviewPaused.value = false
    previewCurrentTime.value = 0
    pausedAtTime = 0
  }

  /** 暂停试听 */
  function pausePreviewPlayback() {
    if (!isPreviewPlaying.value) return
    pausedAtTime = previewCurrentTime.value // 保存当前播放位置
    pausePreview()
    isPreviewPaused.value = true
    stopPreviewTimer()
  }

  /** 继续试听 */
  function resumePreviewPlayback() {
    if (!isPreviewPaused.value) return
    resumePreview()
    isPreviewPaused.value = false
    startPreviewTimer()
  }

  /** 设置音量 */
  function setPreviewVolumeValue(value: number) {
    setPreviewVolume(value)
    previewVolume.value = value
    if (value > 0) {
      isPreviewMuted.value = false
    }
  }

  /** 切换静音 */
  function toggleMute() {
    if (isPreviewMuted.value) {
      setPreviewVolume(previewVolume.value)
      isPreviewMuted.value = false
    } else {
      setPreviewVolume(0)
      isPreviewMuted.value = true
    }
  }

  /** 跳转播放 */
  async function seekPreview(time: number) {
    previewCurrentTime.value = time
    pausedAtTime = time
    if (!isDragging.value) {
      // 如果 player 不存在，先加载 MIDI
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

  /** 开始定时器 - 60fps 平滑更新 */
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

  /** 标记为正在拖拽（阻止定时器覆盖） */
  function setDragging(dragging: boolean) {
    isDragging.value = dragging
    if (!dragging) {
      // 拖拽结束，重置播放起始时间
      playbackStartTime = performance.now() - previewCurrentTime.value
    }
  }

  /** 设置预览播放时间（仅更新显示值） */
  function setPreviewTime(time: number) {
    previewCurrentTime.value = time
  }

  /** 停止定时器 */
  function stopPreviewTimer() {
    if (previewTimer) {
      clearInterval(previewTimer)
      previewTimer = null
    }
  }

  /** 播放上一曲 */
  async function playPrev() {
    if (midiLibrary.value.length === 0) return
    stopPreviewPlayback()
    const currentIndex = midiLibrary.value.findIndex(
      (m) => m.filename === currentMidi.value?.filename
    )
    const prevIndex = currentIndex <= 0 ? midiLibrary.value.length - 1 : currentIndex - 1
    const prevMidi = midiLibrary.value[prevIndex]
    currentMidi.value = prevMidi
    try {
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
        events: prevMidi.events,
        ticksPerBeat: prevMidi.ticks_per_beat,
        tempo: 500000,
      })
      // 构建音轨列表
      tracks.value = buildTracksFromEvents(prevMidi.events as any)
      loadDisabledTracks(prevMidi)
      // 读取 MIDI 文件获取实际时长
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

  /** 播放下一曲 */
  async function playNext() {
    if (midiLibrary.value.length === 0) return
    stopPreviewPlayback()
    const currentIndex = midiLibrary.value.findIndex(
      (m) => m.filename === currentMidi.value?.filename
    )
    const nextIndex = currentIndex >= midiLibrary.value.length - 1 ? 0 : currentIndex + 1
    const nextMidi = midiLibrary.value[nextIndex]
    currentMidi.value = nextMidi
    try {
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
        events: nextMidi.events,
        ticksPerBeat: nextMidi.ticks_per_beat,
        tempo: 500000,
      })
      // 构建音轨列表
      tracks.value = buildTracksFromEvents(nextMidi.events as any)
      loadDisabledTracks(nextMidi)
      // 读取 MIDI 文件获取实际时长
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

  /** 更新播放状态 */
  async function updatePlaybackState() {
    try {
      playbackState.value = await invoke<PlaybackState>('get_playback_state')
    } catch (e) {
      toast.error('获取播放状态失败', { description: String(e), richColors: true })
      console.error('获取播放状态失败:', e)
    }
  }

  /** 设置速度 */
  async function setSpeed(newSpeed: number) {
    speed.value = newSpeed
    try {
      await invoke('set_speed', { speed: newSpeed })
    } catch (e) {
      toast.error('设置速度失败', { description: String(e), richColors: true })
      console.error('设置速度失败:', e)
    }
  }

  /** 刷新日志 */
  async function refreshLogs() {
    try {
      keyLogs.value = await invoke<KeyLogEntry[]>('get_key_logs')
    } catch (e) {
      toast.error('获取日志失败', { description: String(e), richColors: true })
      console.error('获取日志失败:', e)
    }
  }

  /** 清空日志 */
  async function clearLogs() {
    try {
      await invoke('clear_key_logs')
      keyLogs.value = []
    } catch (e) {
      toast.error('清空日志失败', { description: String(e), richColors: true })
      console.error('清空日志失败:', e)
    }
  }

  /** 加载模板 */
  async function loadTemplates() {
    try {
      templates.value = await invoke<KeyTemplate[]>('get_templates')
      if (templates.value.length > 0 && !currentTemplate.value) {
        currentTemplate.value = templates.value[0]
      }
    } catch (e) {
      toast.error('加载模板失败', { description: String(e), richColors: true })
      console.error('加载模板失败:', e)
    }
  }

  /** 保存模板 */
  async function saveTemplate(template: KeyTemplate) {
    try {
      await invoke('save_template', { template })
      await loadTemplates()
    } catch (e) {
      toast.error('保存模板失败', { description: String(e), richColors: true })
      console.error('保存模板失败:', e)
    }
  }

  /** 删除模板 */
  async function deleteTemplate(templateId: string) {
    try {
      await invoke('delete_template', { templateId })
      await loadTemplates()
      if (currentTemplate.value?.id === templateId) {
        currentTemplate.value = templates.value[0] || null
      }
    } catch (e) {
      toast.error('删除模板失败', { description: String(e), richColors: true })
      console.error('删除模板失败:', e)
    }
  }

  // 轮询日志（用于实时显示）
  let logPollInterval: number | null = null

  function startLogPolling() {
    if (logPollInterval) return
    logPollInterval = window.setInterval(refreshLogs, 200)
  }

  function stopLogPolling() {
    if (logPollInterval) {
      clearInterval(logPollInterval)
      logPollInterval = null
    }
  }

  return {
    // 状态
    midiLibrary,
    currentMidi,
    melody,
    tracks,
    disabledTracks,
    disabledTracksVersion: disabledTracksVersionRef,
    enabledTrackIndices,
    showDetail,
    playbackState,
    keyLogs,
    templates,
    currentTemplate,
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
    importMidi,
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
    loadTemplates,
    saveTemplate,
    deleteTemplate,
    checkAccessibility,
    startLogPolling,
    stopLogPolling,
    startPreview,
    stopPreviewPlayback,
    pausePreviewPlayback,
    resumePreviewPlayback,
    seekPreview,
    seekTo,
    setPreviewVolumeValue,
    setDragging,
    setPreviewTime,
    toggleMute,
    playPrev,
    playNext,
    toggleTrack,
  }
})
