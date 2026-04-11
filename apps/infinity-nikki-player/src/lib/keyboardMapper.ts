/**
 * @description: 键盘映射器类
 * 处理 MIDI 音符到键盘按键的 C 大调移调和白键量化
 */

import type { KeyTemplate, KeyMapping } from '@/types'

/**
 * C 大调白键相对于 C 的半音偏移量
 * C=0, D=2, E=4, F=5, G=7, A=9, B=11
 */
const WHITE_KEY_SEMITONE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const
/** 白键名称 */
const WHITE_KEY_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
/** 中央 C 的 MIDI 音符号（C4） */
const MIDDLE_C_PITCH = 60
/** 键盘行数（5 行 = 5 个八度） */
const KEYBOARD_ROWS = 5

export interface KeyboardMapperOptions {
  /** 键盘行数，默认 5 */
  rows?: number
  /** 中央 C 的音符号，默认 60 */
  middleCPitch?: number
  /** 原曲主音（用于移调计算），默认 60（C 大调） */
  originalTonic?: number
  /** 音符按下回调（可选，用于发音） */
  onNoteOn?: (pitch: number, originalPitch: number) => void
  /** 音符释放回调（可选，用于发音） */
  onNoteOff?: (pitch: number, originalPitch: number) => void
}

export interface MappingResult {
  key: string
  code: string
  pitch: number
  originalPitch: number
  wasTransposed: boolean
}

/** 按键日志条目 */
export interface KeyLogEntry {
  time: number // 时间（毫秒）
  key: string // 按键名称（如 "C4"）
  code: string // 键盘 code
  pitch: number // 映射后的音符号
  originalPitch: number // 原始音符号
  action: 'press' | 'release' // 按键动作
  velocity?: number // 力度
}

/** 按键日志章节 */
export interface KeyLogChapter {
  name: string // 章节名称
  startTime: number // 开始时间（毫秒）
  endTime: number // 结束时间（毫秒）
  entries: KeyLogEntry[] // 该章节的日志条目
}

/** 按键日志更新回调类型 */
export type KeyLogCallback = (entry: KeyLogEntry) => void

/**
 * @description: 键盘映射器
 * 将 MIDI 音符移调并量化到 C 大调白键，然后映射到键盘按键
 */
export class KeyboardMapper {
  /** 键盘行数 */
  readonly rows: number
  /** 中央 C 音符号 */
  readonly middleCPitch: number
  /** 原曲主音 */
  readonly originalTonic: number
  /** 移调量（半音数） */
  readonly transposeSemitones: number
  /** 最低白键音符号（C4 - 2个八度 = 36） */
  readonly minPitch: number
  /** 最高白键音符号（C4 + 2个八度 + 11 = 95） */
  readonly maxPitch: number

  /** 当前模板 */
  private template: KeyTemplate | null = null
  /** 缓存：原始 pitch -> 映射结果 */
  private pitchCache = new Map<number, MappingResult>()
  /** 按键日志 */
  private keyLog: KeyLogEntry[] = []
  /** 上一帧的活跃按键（用于检测按键变化） */
  private previousActiveKeys = new Set<string>()
  /** 上一帧的 code -> pitch 映射（用于 release 事件） */
  private previousCodeToPitch = new Map<string, number>()
  /** 日志更新回调 */
  private keyLogCallback: KeyLogCallback | null = null
  /** 音符按下回调（用于发音） */
  private onNoteOn: ((pitch: number, originalPitch: number) => void) | undefined
  /** 音符释放回调（用于发音） */
  private onNoteOff: ((pitch: number, originalPitch: number) => void) | undefined

  constructor(options: KeyboardMapperOptions = {}) {
    this.rows = options.rows ?? KEYBOARD_ROWS
    this.middleCPitch = options.middleCPitch ?? MIDDLE_C_PITCH
    this.originalTonic = options.originalTonic ?? MIDDLE_C_PITCH
    this.onNoteOn = options.onNoteOn
    this.onNoteOff = options.onNoteOff

    // 计算移调量：目标是 C 大调（60）
    this.transposeSemitones = this.middleCPitch - this.originalTonic

    // 计算键盘覆盖的音域范围（5 个八度，从中央 C 向下 2 个八度开始）
    const octaveShift = Math.floor((this.rows - 1) / 2)
    this.minPitch = this.middleCPitch - octaveShift * 12 // C4 - 2*12 = 36
    this.maxPitch = this.middleCPitch + octaveShift * 12 + 11 // C4 + 2*12 + 11 = 95
  }

  /**
   * @description: 设置模板并清除缓存
   * @param {KeyTemplate} template 键盘映射模板
   */
  setTemplate(template: KeyTemplate): void {
    this.template = template
    this.pitchCache.clear()
  }

  /**
   * @description: 设置日志更新回调，每次有新日志时调用
   * @param {KeyLogCallback | null} callback 回调函数
   */
  setKeyLogCallback(callback: KeyLogCallback | null): void {
    this.keyLogCallback = callback
  }

  /**
   * @description: 设置音符回调（用于发音）
   * @param {((pitch: number, originalPitch: number) => void) | undefined} onNoteOn 音符按下回调
   * @param {((pitch: number, originalPitch: number) => void) | undefined} onNoteOff 音符释放回调
   */
  setNoteCallbacks(
    onNoteOn: ((pitch: number, originalPitch: number) => void) | undefined,
    onNoteOff: ((pitch: number, originalPitch: number) => void) | undefined
  ): void {
    this.onNoteOn = onNoteOn
    this.onNoteOff = onNoteOff
  }

  /**
   * @description: 获取当前激活的按键（根据当前时间和旋律音符）
   * @param {number} currentTimeMs 当前播放时间（毫秒）
   * @param {Array<{pitch: number, start_ms: number, duration_ms: number}>} melody 旋律事件数组
   * @return {Set<string>} 激活的按键 code 集合
   */
  getActiveKeys(
    currentTimeMs: number,
    melody: Array<{ pitch: number; start_ms: number; duration_ms: number }>
  ): Set<string> {
    const active = new Set<string>()
    const activeNotes: Array<{ pitch: number; code: string }> = []

    for (const event of melody) {
      const endTime = event.start_ms + event.duration_ms
      if (currentTimeMs >= event.start_ms && currentTimeMs < endTime) {
        const result = this.mapPitch(event.pitch)
        if (result) {
          active.add(result.code)
          activeNotes.push({ pitch: event.pitch, code: result.code })
        }
      }
    }

    // 记录按键日志（只记录变化）
    this.recordKeyLog(currentTimeMs, active, activeNotes)

    return active
  }

  /**
   * @description: 记录按键日志
   * @param {number} currentTimeMs 当前时间
   * @param {Set<string>} activeKeys 当前活跃的按键
   * @param {Array<{pitch: number, code: string}>} activeNotes 当前活跃的音符（包含原始 pitch）
   */
  private recordKeyLog(
    currentTimeMs: number,
    activeKeys: Set<string>,
    activeNotes: Array<{ pitch: number; code: string }>
  ): void {
    // 构建当前活跃按键到原始 pitch 的映射
    const codeToPitch = new Map<string, number>()
    for (const noteInfo of activeNotes) {
      codeToPitch.set(noteInfo.code, noteInfo.pitch)
    }

    // 检测 press（当前 active 但上一帧不 active）
    for (const code of activeKeys) {
      if (!this.previousActiveKeys.has(code)) {
        const pitch = codeToPitch.get(code)
        if (pitch !== undefined) {
          const result = this.pitchCache.get(pitch)
          if (result) {
            const entry: KeyLogEntry = {
              time: currentTimeMs,
              key: this.pitchToNoteName(result.pitch),
              code: result.code,
              pitch: result.pitch,
              originalPitch: pitch,
              action: 'press',
            }
            this.keyLog.push(entry)
            this.keyLogCallback?.(entry)
            // 触发音符按下回调（发音）
            this.onNoteOn?.(result.pitch, pitch)
          }
        }
      }
    }

    // 检测 release（上一帧 active 但当前不 active）
    for (const code of this.previousActiveKeys) {
      if (!activeKeys.has(code)) {
        const pitch = this.previousCodeToPitch.get(code)
        if (pitch !== undefined) {
          const result = this.pitchCache.get(pitch)
          if (result) {
            const entry: KeyLogEntry = {
              time: currentTimeMs,
              key: this.pitchToNoteName(result.pitch),
              code: result.code,
              pitch: result.pitch,
              originalPitch: pitch,
              action: 'release',
            }
            this.keyLog.push(entry)
            this.keyLogCallback?.(entry)
            // 触发音符释放回调（止音）
            this.onNoteOff?.(result.pitch, pitch)
          }
        }
      }
    }

    // 保存当前帧的 code -> pitch 映射，供下一帧使用
    this.previousCodeToPitch = codeToPitch
    this.previousActiveKeys = new Set(activeKeys)
  }

  /**
   * @description: 获取按键日志
   * @return {KeyLogEntry[]} 按键日志数组
   */
  getKeyLog(): KeyLogEntry[] {
    return [...this.keyLog]
  }

  /**
   * @description: 按章节分割按键日志
   * @param {Array<{start_ms: number, name?: string}>} sections 章节列表（可选的章节名称）
   * @param {number} durationMs 总时长
   * @return {KeyLogChapter[]} 章节化的日志
   */
  getKeyLogByChapters(
    sections?: Array<{ start_ms: number; name?: string }>,
    durationMs?: number
  ): KeyLogChapter[] {
    if (!sections || sections.length === 0) {
      // 如果没有章节信息，按时间自动分段（每 30 秒一段）
      const chunkDuration = 30000 // 30 秒
      const chapters: KeyLogChapter[] = []
      let currentChapter: KeyLogChapter | null = null

      for (const entry of this.keyLog) {
        const chapterIndex = Math.floor(entry.time / chunkDuration)
        const chapterStart = chapterIndex * chunkDuration
        const chapterEnd = chapterStart + chunkDuration

        if (!currentChapter || currentChapter.startTime !== chapterStart) {
          if (currentChapter) {
            chapters.push(currentChapter)
          }
          currentChapter = {
            name: `第 ${chapterIndex + 1} 段`,
            startTime: chapterStart,
            endTime: chapterEnd,
            entries: [],
          }
        }

        currentChapter.entries.push(entry)
      }

      if (currentChapter && currentChapter.entries.length > 0) {
        chapters.push(currentChapter)
      }

      return chapters
    }

    // 使用提供的章节信息
    const chapters: KeyLogChapter[] = []

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const nextSection = sections[i + 1]
      const chapter: KeyLogChapter = {
        name: section.name || `第 ${i + 1} 章`,
        startTime: section.start_ms,
        endTime: nextSection ? nextSection.start_ms : durationMs || section.start_ms + 30000,
        entries: [],
      }

      // 筛选属于该章节的日志
      for (const entry of this.keyLog) {
        if (entry.time >= chapter.startTime && entry.time < chapter.endTime) {
          chapter.entries.push(entry)
        }
      }

      chapters.push(chapter)
    }

    return chapters
  }

  /**
   * @description: 清除按键日志
   */
  clearKeyLog(): void {
    this.keyLog = []
    this.previousActiveKeys.clear()
    this.previousCodeToPitch.clear()
  }

  /**
   * @description: 将 MIDI pitch 移调并量化到 C 大调白键，然后映射到键盘按键
   * @param {number} originalPitch 原始 MIDI 音符号（0-127）
   * @return {MappingResult | null} 映射结果
   */
  mapPitch(originalPitch: number): MappingResult | null {
    // 检查缓存
    if (this.pitchCache.has(originalPitch)) {
      return this.pitchCache.get(originalPitch)!
    }

    // 步骤 1：移调到 C 大调
    const transposedPitch = originalPitch + this.transposeSemitones

    // 步骤 2：确保在有效范围内（0-127），超出则八度平移
    let boundedPitch = transposedPitch
    while (boundedPitch < 0) {
      boundedPitch += 12
    }
    while (boundedPitch > 127) {
      boundedPitch -= 12
    }

    // 步骤 3：白键量化 - 映射到最近的 C 大调白键
    const whiteKeyPitch = this.quantizeToWhiteKey(boundedPitch)

    // 步骤 4：确保在键盘音域范围内，超出则八度平移
    let finalPitch = whiteKeyPitch
    if (finalPitch < this.minPitch) {
      const octavesNeeded = Math.ceil((this.minPitch - finalPitch) / 12)
      finalPitch += octavesNeeded * 12
    } else if (finalPitch > this.maxPitch) {
      const octavesNeeded = Math.floor((finalPitch - this.maxPitch) / 12)
      finalPitch -= octavesNeeded * 12
    }

    // 步骤 5：从模板查找按键
    if (this.template) {
      const mapping = this.findBestMapping(finalPitch)
      if (mapping) {
        const upperKey = mapping.key.toUpperCase()
        // 数字键使用 Digit 前缀，字母键使用 Key 前缀
        const code = /^[0-9]$/.test(mapping.key) ? `Digit${upperKey}` : `Key${upperKey}`
        const result: MappingResult = {
          key: upperKey,
          code,
          pitch: mapping.pitch,
          originalPitch,
          wasTransposed: this.transposeSemitones !== 0 || mapping.pitch !== whiteKeyPitch,
        }
        this.pitchCache.set(originalPitch, result)
        return result
      }
    }

    return null
  }

  /**
   * @description: 重置缓存（切换歌曲时调用）
   */
  reset(): void {
    this.pitchCache.clear()
    this.keyLog = []
    this.previousActiveKeys.clear()
    this.previousCodeToPitch.clear()
    this.template = null
  }

  // ==================== 私有方法 ====================

  /**
   * @description: 将音高量化到最近的 C 大调白键
   * @param {number} pitch MIDI 音符号
   * @return {number} 最近的 C 大调白键音符号
   */
  private quantizeToWhiteKey(pitch: number): number {
    const octave = Math.floor(pitch / 12)
    const noteInOctave = pitch % 12

    // 计算与每个白键的距离
    let minDist = 12
    let nearestWhiteKey = 0

    for (const offset of WHITE_KEY_SEMITONE_OFFSETS) {
      const dist = Math.abs(noteInOctave - offset)
      // 距离相等时，优先向上映射（C# -> D）
      if (
        dist < minDist ||
        (dist === minDist && offset > WHITE_KEY_SEMITONE_OFFSETS[nearestWhiteKey])
      ) {
        minDist = dist
        nearestWhiteKey = offset
      }
    }

    return octave * 12 + nearestWhiteKey
  }

  /**
   * @description: 找到最接近目标音高的模板映射
   * @param {number} targetPitch 目标音符号
   * @return {KeyMapping | null} 最接近的映射
   */
  private findBestMapping(targetPitch: number): KeyMapping | null {
    if (!this.template || this.template.mappings.length === 0) {
      return null
    }

    let minDist = Infinity
    let nearest: KeyMapping | null = null

    for (const mapping of this.template.mappings) {
      const dist = Math.abs(mapping.pitch - targetPitch)
      if (dist < minDist) {
        minDist = dist
        nearest = mapping
      }
    }

    return nearest
  }

  /**
   * @description: 将 MIDI pitch 转换为音符名称
   * @param {number} pitch MIDI 音符号
   * @return {string} 音符名称（如 "C4"）
   */
  private pitchToNoteName(pitch: number): string {
    const octave = Math.floor(pitch / 12) - 1
    const noteInOctave = pitch % 12
    const noteIndex = WHITE_KEY_SEMITONE_OFFSETS.indexOf(
      noteInOctave as (typeof WHITE_KEY_SEMITONE_OFFSETS)[number]
    )
    if (noteIndex === -1) {
      return `${WHITE_KEY_NAMES[0]}${octave}`
    }
    return `${WHITE_KEY_NAMES[noteIndex]}${octave}`
  }
}

/**
 * @description: 创建键盘映射器实例
 * @param {KeyboardMapperOptions} options 配置
 * @return {KeyboardMapper} 键盘映射器实例
 */
export function createKeyboardMapper(options?: KeyboardMapperOptions): KeyboardMapper {
  return new KeyboardMapper(options)
}
