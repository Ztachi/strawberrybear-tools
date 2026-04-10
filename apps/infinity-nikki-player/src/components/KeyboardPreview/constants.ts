/**
 * @description: 键盘映射预览常量配置
 * 可配置的键盘布局，便于后续更新键位
 */

/** 键盘按键定义 */
export interface KeyDefinition {
  key: string // 显示名称
  code: string // 键盘事件 code
  type: 'normal' | 'function' // 普通键或功能键
}

/** 标准键（字母、数字、符号） */
const NORMAL_KEYS: string[] = [
  'Q',
  'W',
  'E',
  'R',
  'T',
  'Y',
  'U',
  'I',
  'O',
  'P',
  'A',
  'S',
  'D',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'Z',
  'X',
  'C',
  'V',
  'B',
  'N',
  'M',
]

/** 功能键 */
const FUNCTION_KEYS: string[] = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]

/** 数字键 */
const NUMBER_KEYS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

/**
 * 构建键盘布局
 * @description 返回按行组织的键盘按键数组
 */
export function buildKeyboardLayout(): KeyDefinition[][] {
  return [
    FUNCTION_KEYS.map((key) => ({ key, code: `Key${key}`, type: 'function' as const })),
    NUMBER_KEYS.map((key) => ({ key, code: `Digit${key}`, type: 'normal' as const })),
    NORMAL_KEYS.slice(0, 10).map((key) => ({ key, code: `Key${key}`, type: 'normal' as const })),
    NORMAL_KEYS.slice(10, 19).map((key) => ({ key, code: `Key${key}`, type: 'normal' as const })),
    NORMAL_KEYS.slice(19, 26).map((key) => ({ key, code: `Key${key}`, type: 'normal' as const })),
  ]
}

/** 键盘布局常量 */
export const KEYBOARD_LAYOUT = buildKeyboardLayout()

/** 所有按键的 code 集合（用于快速查找） */
export const ALL_KEY_CODES = new Set(KEYBOARD_LAYOUT.flat().map((k) => k.code))
