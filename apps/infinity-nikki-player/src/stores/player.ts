import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { KeyLogEntry, MidiInfo, MelodyEvent, PlaybackState, KeyTemplate } from '@/types'

export const usePlayerStore = defineStore('player', () => {
  // MIDI 文件相关
  const currentMidi = ref<MidiInfo | null>(null)
  const midiList = ref<MidiInfo[]>([])
  const melody = ref<MelodyEvent[]>([])

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

  /** 解析 MIDI 文件 */
  async function parseMidi(path: string) {
    isLoading.value = true
    try {
      const [info, events] = await invoke<[MidiInfo, any[]]>('parse_midi_file', { path })
      currentMidi.value = info
      // 提取旋律
      melody.value = await invoke<MelodyEvent[]>('extract_melody', {
        events,
        ticksPerBeat: info.ticks_per_beat,
        tempo: 500000,
      })
    } catch (e) {
      console.error('解析 MIDI 失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  /** 扫描文件夹 */
  async function scanFolder(folderPath: string) {
    isLoading.value = true
    try {
      midiList.value = await invoke<MidiInfo[]>('scan_folder', { folderPath })
    } catch (e) {
      console.error('扫描文件夹失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  /** 开始播放 */
  async function startPlayback(midiPath: string) {
    if (!currentTemplate.value) {
      alert('请先选择映射模板')
      return
    }
    try {
      await invoke('start_playback', {
        midiPath,
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
    currentMidi,
    midiList,
    melody,
    playbackState,
    keyLogs,
    templates,
    currentTemplate,
    speed,
    isLoading,
    // 方法
    parseMidi,
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
    startLogPolling,
    stopLogPolling,
  }
})
