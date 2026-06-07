/**
 * @fileOverview 自定义模板键位工具
 * @description 统一维护自定义模板编辑器、前端保存逻辑与后端校验保持一致的键位范围、排除规则和映射归一化方法
 */
import type { KeyMapping } from '@/types'

/** 模板编辑器可视化钢琴的最低 MIDI 音高（A0） */
export const TEMPLATE_MIN_PITCH = 21
/** 模板编辑器可视化钢琴的最高 MIDI 音高（C8） */
export const TEMPLATE_MAX_PITCH = 108

/** 支持映射的字母键，和 Rust 键盘模拟器支持范围保持一致 */
export const LETTER_MAPPING_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
/** 支持映射的数字行按键，和 Rust 键盘模拟器支持范围保持一致 */
export const NUMBER_MAPPING_KEYS = '0123456789'.split('')
/** 支持映射的功能键范围，和 Rust 键盘模拟器支持范围保持一致 */
export const FUNCTION_MAPPING_KEYS = Array.from({ length: 12 }, (_, index) => `F${index + 1}`)
/** 支持映射的常用标点键，按物理键位保存为键帽字符。 */
export const PUNCTUATION_MAPPING_KEYS = [
  '`',
  '-',
  '=',
  '[',
  ']',
  '\\',
  ';',
  "'",
  ',',
  '.',
  '/',
] as const
/** 支持映射的非系统控制键。 */
export const CONTROL_MAPPING_KEYS = [
  'SPACE',
  'TAB',
  'ENTER',
  'BACKSPACE',
  'DELETE',
  'ARROWUP',
  'ARROWDOWN',
  'ARROWLEFT',
  'ARROWRIGHT',
] as const

/** 可保存到模板 JSON 的完整按键白名单 */
export const SUPPORTED_MAPPING_KEYS = [
  ...LETTER_MAPPING_KEYS,
  ...NUMBER_MAPPING_KEYS,
  ...FUNCTION_MAPPING_KEYS,
  ...PUNCTUATION_MAPPING_KEYS,
  ...CONTROL_MAPPING_KEYS,
] as const

/** 可保存按键白名单 Set，用于编辑器和保存前校验 */
export const SUPPORTED_MAPPING_KEY_SET = new Set<string>(SUPPORTED_MAPPING_KEYS)

/** 模板按键名到 KeyboardEvent.code / 预览 code 的映射。 */
const MAPPING_KEY_TO_CODE: Record<string, string> = {
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  SPACE: 'Space',
  TAB: 'Tab',
  ENTER: 'Enter',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  ARROWUP: 'ArrowUp',
  ARROWDOWN: 'ArrowDown',
  ARROWLEFT: 'ArrowLeft',
  ARROWRIGHT: 'ArrowRight',
}

/** KeyboardEvent.code / 预览 code 到模板按键名的反向映射。 */
const CODE_TO_MAPPING_KEY = Object.fromEntries(
  Object.entries(MAPPING_KEY_TO_CODE).map(([key, code]) => [code, key])
) as Record<string, string>

/**
 * @description: 键盘捕获时明确排除的 KeyboardEvent.key / KeyboardEvent.code
 * @description 这些键通常是控制键、修饰键、导航键、系统键或 IME 状态键，不应写入游戏演奏模板
 */
export const EXCLUDED_CAPTURE_KEYS = new Set([
  'Escape',
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Pause',
  'ContextMenu',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Dead',
  'Process',
  'Compose',
  'Convert',
  'NonConvert',
  'Accept',
  'ModeChange',
  'AudioVolumeUp',
  'AudioVolumeDown',
  'AudioVolumeMute',
  'MediaPlayPause',
  'MediaStop',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'BrowserBack',
  'BrowserForward',
  'BrowserHome',
  'BrowserRefresh',
  'BrowserSearch',
  'LaunchApplication1',
  'LaunchApplication2',
  'LaunchMail',
  'PrintScreen',
])

/**
 * @description: 将 MIDI 音高转换为音名
 * @param {number} pitch - MIDI 音高，范围通常为 0-127
 * @return {string} 音名，例如 C4、F#5
 */
export function pitchToNoteName(pitch: number): string {
  // MIDI 标准按 12 个半音循环，因此音名数组顺序必须和 pitch % 12 对齐。
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  // MIDI 中 C4 是 60，因此八度计算需要先除以 12 再减 1。
  const octave = Math.floor(pitch / 12) - 1
  // pitch % 12 得到当前八度内的半音位置。
  const noteIndex = pitch % 12
  return `${noteNames[noteIndex]}${octave}`
}

/**
 * @description: 判断 MIDI 音高是否对应钢琴黑键
 * @param {number} pitch - MIDI 音高
 * @return {boolean} true 表示该音高为黑键
 */
export function isBlackKey(pitch: number): boolean {
  // 黑键在一个八度中的半音偏移固定为 C#/D#/F#/G#/A#。
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

/**
 * @description: 从键盘事件归一化模板按键名
 * @description 优先使用 KeyboardEvent.code 识别物理字母/数字键，避免键盘布局或大小写影响；功能键用 key 识别
 * @param {KeyboardEvent} event - 键盘按下事件
 * @return {string | null} 归一化后的按键名，无法识别为模板按键时返回 null
 */
export function normalizeMappingKeyFromEvent(event: KeyboardEvent): string | null {
  // key 可能带空格或受键盘布局影响，先做基础清理。
  const key = event.key.trim()
  // code 表示物理键位，比 key 更适合识别字母和数字行。
  const code = event.code
  const codeMapping: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'SPACE',
    Tab: 'TAB',
    Enter: 'ENTER',
    NumpadEnter: 'ENTER',
    Backspace: 'BACKSPACE',
    Delete: 'DELETE',
    ArrowUp: 'ARROWUP',
    ArrowDown: 'ARROWDOWN',
    ArrowLeft: 'ARROWLEFT',
    ArrowRight: 'ARROWRIGHT',
  }

  // 字母键优先按物理键位识别，避免非英文键盘布局导致 key 不是 A-Z。
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toUpperCase()
  }

  // 数字行也按物理键位识别，避免 Shift 后 key 变成符号。
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5)
  }

  // 功能键没有 Key/Digit 前缀，直接使用标准 key 值识别。
  if (/^F([1-9]|1[0-2])$/.test(key)) {
    return key.toUpperCase()
  }

  if (codeMapping[code]) {
    return codeMapping[code]
  }

  // 浏览器环境下如果 code 不可用，仍允许单字母 key 回退。
  if (/^[a-zA-Z]$/.test(key)) {
    return key.toUpperCase()
  }

  // 浏览器环境下如果 code 不可用，仍允许单数字 key 回退。
  if (/^[0-9]$/.test(key)) {
    return key
  }

  if ((PUNCTUATION_MAPPING_KEYS as readonly string[]).includes(key)) {
    return key
  }

  // 其他按键交给捕获排除或非法按键提示处理。
  return null
}

/**
 * @description: 将模板保存的按键名转换为键盘预览和日志使用的 code
 * @param {string} key - 模板按键名，如 Q、1、F1、SPACE、-
 * @return {string} KeyboardEvent.code 风格的按键 code
 */
export function mappingKeyToCode(key: string): string {
  const normalizedKey = key.trim().toUpperCase()
  if (/^[A-Z]$/.test(normalizedKey)) return `Key${normalizedKey}`
  if (/^[0-9]$/.test(normalizedKey)) return `Digit${normalizedKey}`
  if (/^F([1-9]|1[0-2])$/.test(normalizedKey)) return normalizedKey
  return MAPPING_KEY_TO_CODE[normalizedKey] ?? key
}

/**
 * @description: 将键盘预览和日志使用的 code 转换回模板按键名
 * @param {string} code - KeyboardEvent.code 风格的按键 code
 * @return {string} 模板按键名
 */
export function codeToMappingKey(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  return CODE_TO_MAPPING_KEY[code] ?? code
}

/**
 * @description: 判断按键名是否可保存到模板
 * @param {string} key - 待校验按键名
 * @return {boolean} true 表示按键在当前模拟器支持范围内
 */
export function isSupportedMappingKey(key: string): boolean {
  // 保存前统一大写，保证 a/A、f1/F1 都按同一个按键处理。
  return SUPPORTED_MAPPING_KEY_SET.has(key.trim().toUpperCase())
}

/**
 * @description: 判断键盘事件是否属于映射捕获排除项
 * @param {KeyboardEvent} event - 键盘按下事件
 * @return {boolean} true 表示该键应被拒绝映射
 */
export function isExcludedCaptureKey(event: KeyboardEvent): boolean {
  // 部分浏览器用 key 表达控制键，部分场景 code 更稳定，因此两个字段都检查。
  return EXCLUDED_CAPTURE_KEYS.has(event.key) || EXCLUDED_CAPTURE_KEYS.has(event.code)
}

/**
 * @description: 归一化模板映射列表
 * @description 会清理超出 88 键编辑范围的音高、非法按键和重复按键；同一物理键只保留最后一次映射
 * @param {KeyMapping[]} mappings - 原始映射列表
 * @return {KeyMapping[]} 按 pitch 升序排列的合法映射列表
 */
export function normalizeTemplateMappings(mappings: KeyMapping[]): KeyMapping[] {
  // 按音高索引最终映射，保证同一 pitch 只保留一条记录。
  const byPitch = new Map<number, KeyMapping>()
  // 按物理键索引已占用音高，保证同一 key 不会同时映射多个 pitch。
  const usedKeys = new Map<string, number>()

  for (const mapping of mappings) {
    // pitch 可能来自 JSON 或旧数据，先转为 number 再校验。
    const pitch = Number(mapping.pitch)
    // key 统一去空格和大写，避免同一按键出现 a/A 两种形式。
    const key = mapping.key.trim().toUpperCase()
    // 编辑器只允许 88 键范围内的音高，且按键必须是当前模拟器支持的白名单。
    if (pitch < TEMPLATE_MIN_PITCH || pitch > TEMPLATE_MAX_PITCH || !isSupportedMappingKey(key)) {
      continue
    }

    // 同一按键只能对应一个音高，新映射会替换此前占用该按键的音高。
    const previousPitch = usedKeys.get(key)
    if (previousPitch !== undefined) {
      byPitch.delete(previousPitch)
    }

    // 记录当前按键的新占用音高。
    usedKeys.set(key, pitch)
    // 记录当前音高的最终映射；同 pitch 后写入的映射会覆盖先前映射。
    byPitch.set(pitch, { pitch, key })
  }

  // 按音高排序能让编辑、保存和导出的 JSON 保持稳定顺序。
  return Array.from(byPitch.values()).sort((a, b) => a.pitch - b.pitch)
}

/**
 * @description: 设置或清除指定音高的映射
 * @description 设置新按键时会自动移除其他音高中已占用的同一按键，确保模板不会出现一键多音
 * @param {KeyMapping[]} mappings - 当前映射列表
 * @param {number} pitch - 要修改的 MIDI 音高
 * @param {string | null} key - 新按键名；传 null 表示清除该音高映射
 * @return {KeyMapping[]} 更新后的合法映射列表
 */
export function setMappingForPitch(
  mappings: KeyMapping[],
  pitch: number,
  key: string | null
): KeyMapping[] {
  // 空字符串也视为清除映射，因此这里归一化为 null。
  const normalizedKey = key?.trim().toUpperCase() || null
  // 先移除当前音高的旧映射，避免同一 pitch 出现重复记录。
  const next = mappings.filter((mapping) => mapping.pitch !== pitch)

  if (!normalizedKey) {
    // 清除映射后仍走统一归一化，顺便清理旧数据中的非法项。
    return normalizeTemplateMappings(next)
  }

  // 设置新按键时，先移除其他音高中同 key 的映射，保持一键一音。
  return normalizeTemplateMappings([
    ...next.filter((mapping) => mapping.key.trim().toUpperCase() !== normalizedKey),
    { pitch, key: normalizedKey },
  ])
}
