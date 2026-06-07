/**
 * @description: 键盘映射预览常量配置
 * @description 布局基于模板编辑器和模拟器共同支持的完整按键范围生成
 */
import { codeToMappingKey, mappingKeyToCode, SUPPORTED_MAPPING_KEY_SET } from '@/lib/templateKeys'

/** 键盘按键定义 */
export interface KeyDefinition {
  key: string
  code: string
  type: 'normal' | 'function' | 'control'
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'space'
}

const KEYBOARD_ROWS: Array<Array<Omit<KeyDefinition, 'code'>>> = [
  [
    { key: 'F1', type: 'function' },
    { key: 'F2', type: 'function' },
    { key: 'F3', type: 'function' },
    { key: 'F4', type: 'function' },
    { key: 'F5', type: 'function' },
    { key: 'F6', type: 'function' },
    { key: 'F7', type: 'function' },
    { key: 'F8', type: 'function' },
    { key: 'F9', type: 'function' },
    { key: 'F10', type: 'function' },
    { key: 'F11', type: 'function' },
    { key: 'F12', type: 'function' },
  ],
  [
    { key: '`', type: 'normal' },
    { key: '1', type: 'normal' },
    { key: '2', type: 'normal' },
    { key: '3', type: 'normal' },
    { key: '4', type: 'normal' },
    { key: '5', type: 'normal' },
    { key: '6', type: 'normal' },
    { key: '7', type: 'normal' },
    { key: '8', type: 'normal' },
    { key: '9', type: 'normal' },
    { key: '0', type: 'normal' },
    { key: '-', type: 'normal' },
    { key: '=', type: 'normal' },
    { key: 'BACKSPACE', type: 'control', width: 'xl' },
  ],
  [
    { key: 'TAB', type: 'control', width: 'lg' },
    { key: 'Q', type: 'normal' },
    { key: 'W', type: 'normal' },
    { key: 'E', type: 'normal' },
    { key: 'R', type: 'normal' },
    { key: 'T', type: 'normal' },
    { key: 'Y', type: 'normal' },
    { key: 'U', type: 'normal' },
    { key: 'I', type: 'normal' },
    { key: 'O', type: 'normal' },
    { key: 'P', type: 'normal' },
    { key: '[', type: 'normal' },
    { key: ']', type: 'normal' },
    { key: '\\', type: 'normal', width: 'md' },
  ],
  [
    { key: 'A', type: 'normal' },
    { key: 'S', type: 'normal' },
    { key: 'D', type: 'normal' },
    { key: 'F', type: 'normal' },
    { key: 'G', type: 'normal' },
    { key: 'H', type: 'normal' },
    { key: 'J', type: 'normal' },
    { key: 'K', type: 'normal' },
    { key: 'L', type: 'normal' },
    { key: ';', type: 'normal' },
    { key: "'", type: 'normal' },
    { key: 'ENTER', type: 'control', width: 'xl' },
  ],
  [
    { key: 'Z', type: 'normal' },
    { key: 'X', type: 'normal' },
    { key: 'C', type: 'normal' },
    { key: 'V', type: 'normal' },
    { key: 'B', type: 'normal' },
    { key: 'N', type: 'normal' },
    { key: 'M', type: 'normal' },
    { key: ',', type: 'normal' },
    { key: '.', type: 'normal' },
    { key: '/', type: 'normal' },
  ],
  [
    { key: 'SPACE', type: 'control', width: 'space' },
    { key: 'DELETE', type: 'control', width: 'xl' },
    { key: 'ARROWLEFT', type: 'control', width: 'xl' },
    { key: 'ARROWDOWN', type: 'control', width: 'xl' },
    { key: 'ARROWUP', type: 'control', width: 'xl' },
    { key: 'ARROWRIGHT', type: 'control', width: 'xl' },
  ],
]

/**
 * @description: 构建键盘布局
 * @return {KeyDefinition[][]} 按物理键盘行组织的支持按键
 */
export function buildKeyboardLayout(): KeyDefinition[][] {
  return KEYBOARD_ROWS.map((row) =>
    row
      .filter((key) => SUPPORTED_MAPPING_KEY_SET.has(key.key))
      .map((key) => ({ ...key, code: mappingKeyToCode(key.key) }))
  )
}

/** 键盘布局常量 */
export const KEYBOARD_LAYOUT = buildKeyboardLayout()

/** 所有按键的 code 集合（用于快速查找） */
export const ALL_KEY_CODES = new Set(KEYBOARD_LAYOUT.flat().map((key) => key.code))

export { codeToMappingKey, mappingKeyToCode }

/** @deprecated use mappingKeyToCode */
export const keyToCode = mappingKeyToCode

/** @deprecated use codeToMappingKey */
export const codeToKey = codeToMappingKey
