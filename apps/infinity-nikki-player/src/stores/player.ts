import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { KeyLogEntry, MidiInfo, MelodyEvent, PlaybackState, KeyTemplate } from '@/types'

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
      const [info, events] = await invoke<[MidiInfo, any[]]>('parse_midi_file', { path })
      // 检查是否已存在
      const exists = midiLibrary.value.some((m) => m.filename === info.filename)
      if (!exists) {
        midiLibrary.value.push(info)
      }
      // 选中并打开详情
      await selectMidi(info, events)
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
  async function selectMidi(midi: MidiInfo, events?: any[]) {
    currentMidi.value = midi
    if (events) {
      melody.value = events
    } else {
      // 需要重新解析
      try {
        const [, parsedEvents] = await invoke<[MidiInfo, any[]]>('parse_midi_file', {
          path: midi.filename,
        })
        melody.value = await invoke<MelodyEvent[]>('extract_melody', {
          events: parsedEvents,
          ticksPerBeat: midi.ticks_per_beat,
          tempo: 500000,
        })
      } catch (e) {
        console.error('解析 MIDI 失败:', e)
      }
    }
    showDetail.value = true
  }

  /** 关闭详情 */
  function closeDetail() {
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
  }
})
