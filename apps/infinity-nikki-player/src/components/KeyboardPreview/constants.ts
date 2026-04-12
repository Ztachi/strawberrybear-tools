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

/** 标准键（字母）按行排列 */
const NORMAL_KEYS: string[] = [
  // Q-P 行（中间八度）
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
  // A-L 行（高音八度）
  'A',
  'S',
  'D',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  // Z-M 行（高音+八度）
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
 * 行顺序：F1-F12（功能键）, 0-9（数字键）, Q-P（中间八度）, A-L（高音八度）, Z-M（高音+八度）
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

/**
 * @description: 将模板的按键名称转换为键盘 code
 * @param key 模板中的按键名称，如 "Q", "1", "F1"
 * @return 键盘 code，如 "KeyQ", "Digit1", "KeyF1"
 */
export function keyToCode(key: string): string {
  // 数字键用 Digit 前缀
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`
  }
  // 其他都用 Key 前缀（包括 F1-F12）
  return `Key${key}`
}

/**
 * @description: 将键盘 code 转换为模板的按键名称
 * @param code 键盘 code，如 "KeyQ", "Digit1"
 * @return 模板中的按键名称，如 "Q", "1"
 */
export function codeToKey(code: string): string {
  if (code.startsWith('Digit')) {
    return code.slice(5) // 去掉 "Digit" 前缀
  }
  if (code.startsWith('Key')) {
    return code.slice(3) // 去掉 "Key" 前缀
  }
  return code
}
