/**
 * @description: 国际化语言包
 */
export const I18N = {
  'zh-CN': {
    title: 'DQ7 对对碰洗牌记录工具',
    phase: { define: '定义阶段', exchange: '交换阶段' },
    progress: '已点击 {current} / {total}',
    reset: '重置',
    difficulty: { easy: '简单', normal: '普通', hard: '困难', expert: '超难' },
    hint: {
      define: '依次点击格子，记录卡牌顺序',
      exchange: '拖拽 / 点击 / 空格键 三种方式交换卡牌',
    },
  },
  'en-US': {
    title: 'DQ7 Memory Match Shuffle Recorder',
    phase: { define: 'Define Phase', exchange: 'Exchange Phase' },
    progress: 'Clicked {current} / {total}',
    reset: 'Reset',
    difficulty: { easy: 'Easy', normal: 'Normal', hard: 'Hard', expert: 'Expert' },
    hint: {
      define: 'Tap cells in order to record card sequence',
      exchange: 'Drag / Click / Space key to swap cards',
    },
  },
} as const

export type Locale = keyof typeof I18N

/**
 * @description: 检测当前语言
 * @return {Locale} 当前语言
 */
export function detectLocale(): Locale {
  return window.location.pathname.includes('/en') ? 'en-US' : 'zh-CN'
}

const currentLocale = detectLocale()

/**
 * @description: 获取当前语言
 * @return {Locale} 当前语言
 */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * @description: 获取翻译文本
 * @param {string} key 点分隔的key路径
 * @return {string} 翻译后的文本
 */
export function t(key: string): string {
  const keys = key.split('.')
  let value: unknown = I18N[currentLocale]
  for (const k of keys) {
    value = (value as Record<string, unknown>)[k]
  }
  return (value as string) || key
}

/**
 * @description: 格式化翻译文本
 * @param {string} key 点分隔的key路径
 * @param {Object} params 格式化参数
 * @return {string} 翻译后的文本
 */
export function tf(key: string, params: Record<string, string | number>): string {
  let text = t(key)
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v))
  }
  return text
}
