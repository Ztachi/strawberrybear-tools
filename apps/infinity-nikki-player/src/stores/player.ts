import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { KeyLogEntry, MidiInfo, MelodyEvent, PlaybackState, KeyTemplate } from '@/types'
import {
  previewAllNotes,
  stopPreview as stopPreviewPlayer,
  pausePreview,
  resumePreview,
  getCurrentTime,
  getTotalDuration,
  setVolume as setPreviewVolume,
  seekTo,
  isPlayingState,
} from '@/lib/midiPlayer'

export const usePlayerStore = defineStore('player', () => {
  // MIDI 库（已导入的文件列表）
  const midiLibrary = ref<MidiInfo[]>([])

  // 当前选中的 MIDI
  const currentMidi = ref<MidiInfo | null>(null)

  // 当前 MIDI 的旋律数据
  const melody = ref<MelodyEvent[]>([])

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
  const previewStartTime = 0
  let previewTimer: ReturnType<typeof setInterval> | null = null

  /** 检查辅助功能权限 */
  async function checkAccessibility() {
    try {
      hasAccessibility.value = await invoke<boolean>('check_accessibility')
    } catch {
      hasAccessibility.value = false
    }
  }

  /** 导入 MIDI 文件到库中 */
  async function importMidi(path: string) {
    isLoading.value = true
    try {
      const [info] = await invoke<[MidiInfo]>('parse_midi_file', { path })
      // 检查是否已存在（按文件名判断）
      const exists = midiLibrary.value.some((m) => m.filename === info.filename)
      if (!exists) {
        midiLibrary.value.push(info)
      }
      // 选中并打开详情
      await selectMidi(info)
      return true
    } catch (e) {
      console.error('导入 MIDI 失败:', e)
      return false
    } finally {
      isLoading.value = false
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
    } catch (e) {
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
  }

  /** 扫描文件夹并导入所有 MIDI */
  async function scanFolder(folderPath: string) {
    isLoading.value = true
    try {
      const files = await invoke<MidiInfo[]>('scan_folder', { folderPath })
      for (const file of files) {
        const exists = midiLibrary.value.some((m) => m.filename === file.filename)
        if (!exists) {
          midiLibrary.value.push(file)
        }
      }
    } catch (e) {
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
      console.error('暂停失败:', e)
    }
  }

  /** 继续播放 */
  async function resumePlayback() {
    try {
      await invoke('resume_playback')
      await updatePlaybackState()
    } catch (e) {
      console.error('继续播放失败:', e)
    }
  }

  /** 停止播放 */
  async function stopPlayback() {
    try {
      await invoke('stop_playback')
      await updatePlaybackState()
    } catch (e) {
      console.error('停止失败:', e)
    }
  }

  /** 开始试听 */
  async function startPreview() {
    if (!currentMidi.value || currentMidi.value.events.length === 0) return

    try {
      // 播放所有音符（所有音轨叠加）
      await previewAllNotes(
        currentMidi.value.events,
        currentMidi.value.ticks_per_beat,
        500000,
        speed.value
      )
      isPreviewPlaying.value = true
      isPreviewPaused.value = false
      previewDuration.value = getTotalDuration()
      startPreviewTimer()
    } catch (e) {
      console.error('试听失败:', e)
      isPreviewPlaying.value = false
    }
  }

  /** 停止试听 */
  function stopPreviewPlayback() {
    stopPreviewPlayer()
    stopPreviewTimer()
    isPreviewPlaying.value = false
    isPreviewPaused.value = false
    previewCurrentTime.value = 0
  }

  /** 暂停试听 */
  function pausePreviewPlayback() {
    if (!isPreviewPlaying.value) return
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
  function seekPreview(time: number) {
    previewCurrentTime.value = time
    // 只有在拖拽结束时才真正跳转播放位置
    if (!isDragging.value) {
      seekTo(time)
    }
  }

  /** 开始定时器 */
  function startPreviewTimer() {
    stopPreviewTimer()
    previewTimer = setInterval(() => {
      // 如果不在拖拽中，才从 Tone.js 获取真实播放时间
      if (!isDragging.value) {
        previewCurrentTime.value = getCurrentTime()
      }
    }, 100)
  }

  /** 标记为正在拖拽（阻止定时器覆盖） */
  function setDragging(dragging: boolean) {
    isDragging.value = dragging
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
      showDetail.value = true
      // 选择后立即开始播放
      startPreview()
    } catch (e) {
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
      showDetail.value = true
      // 选择后立即开始播放
      startPreview()
    } catch (e) {
      console.error('解析 MIDI 失败:', e)
    }
  }

  /** 更新播放状态 */
  async function updatePlaybackState() {
    try {
      playbackState.value = await invoke<PlaybackState>('get_playback_state')
    } catch (e) {
      console.error('获取播放状态失败:', e)
    }
  }

  /** 设置速度 */
  async function setSpeed(newSpeed: number) {
    speed.value = newSpeed
    try {
      await invoke('set_speed', { speed: newSpeed })
    } catch (e) {
      console.error('设置速度失败:', e)
    }
  }

  /** 刷新日志 */
  async function refreshLogs() {
    try {
      keyLogs.value = await invoke<KeyLogEntry[]>('get_key_logs')
    } catch (e) {
      console.error('获取日志失败:', e)
    }
  }

  /** 清空日志 */
  async function clearLogs() {
    try {
      await invoke('clear_key_logs')
      keyLogs.value = []
    } catch (e) {
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
      console.error('加载模板失败:', e)
    }
  }

  /** 保存模板 */
  async function saveTemplate(template: KeyTemplate) {
    try {
      await invoke('save_template', { template })
      await loadTemplates()
    } catch (e) {
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
    importMidi,
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
  }
})
