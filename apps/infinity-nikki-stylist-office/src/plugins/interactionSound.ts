/**
 * @fileOverview 交互音效插件
 * @description 使用 howler 按交互类型播放轻量反馈，让按钮、卡片、菜单和拖拽更活泼。
 */
import { Howl } from 'howler'

/** 当前支持的交互音效类型。 */
type InteractionSoundName = 'primary' | 'nav' | 'back' | 'select' | 'open' | 'random' | 'drag'

/** 单个合成音的参数。 */
interface SoundPreset {
  /** 音效长度，单位秒 */
  duration: number
  /** 主频列表，多个频率会混合成更柔和的音色 */
  frequencies: number[]
  /** 采样音量，Howler 还会再做整体音量控制 */
  gain: number
  /** 包络衰减速度 */
  decay: number
  /** 音高走势 */
  shape: 'tap' | 'rise' | 'fall' | 'sparkle' | 'drop'
}

/** 可触发点击音效的交互元素选择器。 */
const INTERACTIVE_SELECTOR = [
  '[data-sound]',
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="combobox"]',
  '[role="slider"]',
  '.v-list-item',
  '.v-tab',
  '.v-slider',
  '.title-option',
  '.asset-picker-option',
  '.asset-summary__item',
  '.proofing-asset-button',
  '.certificate-template-preview__layer',
].join(',')

/** 不同交互类型对应不同音高、长度和走势。 */
const SOUND_PRESETS: Record<InteractionSoundName, SoundPreset> = {
  primary: {
    duration: 0.34,
    frequencies: [1340, 720, 360],
    gain: 0.58,
    decay: 5.2,
    shape: 'drop',
  },
  nav: {
    duration: 0.16,
    frequencies: [660, 990],
    gain: 0.38,
    decay: 7.4,
    shape: 'rise',
  },
  back: {
    duration: 0.17,
    frequencies: [740, 520],
    gain: 0.34,
    decay: 7.2,
    shape: 'fall',
  },
  select: {
    duration: 0.13,
    frequencies: [1040, 1560],
    gain: 0.28,
    decay: 9.8,
    shape: 'tap',
  },
  open: {
    duration: 0.18,
    frequencies: [780, 1170, 1560],
    gain: 0.33,
    decay: 7.8,
    shape: 'rise',
  },
  random: {
    duration: 0.24,
    frequencies: [990, 1485, 1980],
    gain: 0.32,
    decay: 5.8,
    shape: 'sparkle',
  },
  drag: {
    duration: 0.09,
    frequencies: [620, 930],
    gain: 0.15,
    decay: 12,
    shape: 'tap',
  },
}

/**
 * @description: 编码 16-bit PCM 写入 WAV 数据
 * @description 用代码合成一组极短 UI 音，避免维护额外二进制音频文件。
 * @param {SoundPreset} preset - 音色参数
 * @return {string} 可直接交给 Howl 的 data URI
 */
function createSoundDataUri(preset: SoundPreset): string {
  const sampleRate = 44100
  const sampleCount = Math.floor(sampleRate * preset.duration)
  const headerSize = 44
  const bytes = new Uint8Array(headerSize + sampleCount * 2)
  const view = new DataView(bytes.buffer)

  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, sampleCount * 2, true)

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount
    const envelope =
      preset.shape === 'drop'
        ? Math.exp(-progress * preset.decay) * (1 - Math.min(0.32, progress * 0.36))
        : Math.exp(-progress * preset.decay)
    const attack = Math.min(1, progress / 0.08)
    const sparkleGate =
      preset.shape === 'sparkle' ? 0.65 + Math.sin(progress * Math.PI * 18) * 0.35 : 1
    const pitchBend =
      preset.shape === 'rise'
        ? 1 + progress * 0.08
        : preset.shape === 'fall'
          ? 1 - progress * 0.08
          : preset.shape === 'drop'
            ? 1.42 - progress * 0.38
            : 1
    const mixedSample =
      preset.frequencies.reduce((sum, frequency, frequencyIndex) => {
        if (preset.shape === 'drop') {
          const impactEnvelope = Math.exp(-progress * 32)
          const pondEnvelope = Math.max(0, Math.sin(progress * Math.PI)) * Math.exp(-progress * 4.8)
          const rippleEnvelope =
            progress > 0.18
              ? Math.sin((progress - 0.18) * Math.PI * 7) * Math.exp(-progress * 5)
              : 0
          const chirp = Math.sin(
            (2 *
              Math.PI *
              (frequency * pitchBend + 42 * Math.sin(progress * Math.PI * 5)) *
              index) /
              sampleRate
          )
          const pond = Math.sin((2 * Math.PI * 270 * index) / sampleRate)
          const ripple = Math.sin((2 * Math.PI * 520 * index) / sampleRate)
          return (
            sum +
            chirp * impactEnvelope +
            pond * pondEnvelope * 0.42 +
            ripple * rippleEnvelope * 0.18
          )
        }

        const partialGain = 1 / (frequencyIndex + 1)
        return (
          sum + Math.sin((2 * Math.PI * frequency * pitchBend * index) / sampleRate) * partialGain
        )
      }, 0) / preset.frequencies.length
    const sample = Math.max(
      -1,
      Math.min(
        1,
        mixedSample *
          envelope *
          (preset.shape === 'drop' ? Math.min(1, progress / 0.018) : attack) *
          sparkleGate *
          preset.gain
      )
    )
    view.setInt16(headerSize + index * 2, sample * 0x7fff, true)
  }

  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return `data:audio/wav;base64,${window.btoa(binary)}`
}

/**
 * @description: 判断交互目标的音效类型
 * @description 禁用控件、输入控件和非交互区域不播放，避免干扰表单输入。
 * @param {EventTarget | null} target - 原始点击目标
 * @return {InteractionSoundName | null} 音效类型
 */
function resolveInteractionSound(target: EventTarget | null): InteractionSoundName | null {
  if (!(target instanceof Element)) {
    return null
  }

  const interactiveElement = target.closest<HTMLElement>(INTERACTIVE_SELECTOR)

  if (!interactiveElement) {
    return null
  }

  if (interactiveElement.closest('[disabled], [aria-disabled="true"], .v-btn--disabled')) {
    return null
  }

  if (target.closest('input, textarea, select, [contenteditable="true"]')) {
    return null
  }

  const explicitSound = interactiveElement.closest<HTMLElement>('[data-sound]')?.dataset.sound

  if (explicitSound && explicitSound in SOUND_PRESETS) {
    return explicitSound as InteractionSoundName
  }

  const text = interactiveElement.textContent?.trim() ?? ''

  if (
    interactiveElement.matches('.certificate-template-preview__layer, .v-slider, [role="slider"]')
  ) {
    return 'drag'
  }

  if (interactiveElement.matches('.title-option, .asset-picker-option, .v-list-item, .v-tab')) {
    return 'select'
  }

  if (
    interactiveElement.matches('.asset-summary__item, .proofing-asset-button, [role="combobox"]')
  ) {
    return 'open'
  }

  if (/随机|Random|ランダム/i.test(text)) {
    return 'random'
  }

  if (/返回|取消|关闭|Back|Cancel|Return|戻|キャンセル/i.test(text)) {
    return 'back'
  }

  if (interactiveElement.matches('.bg-primary, .v-btn--variant-flat')) {
    return 'primary'
  }

  if (
    interactiveElement.closest('.app-header') ||
    interactiveElement.matches('.v-btn--variant-text')
  ) {
    return 'nav'
  }

  return 'select'
}

/**
 * @description: 注册全局点击音效
 * @description 应用启动时通过捕获阶段监听所有页面，后续新增按钮无需逐个接入。
 * @return {void} 无返回值
 */
export function installInteractionSound(): void {
  const soundWindow = window as Window & { __nikkiInteractionSoundInstalled?: boolean }

  if (soundWindow.__nikkiInteractionSoundInstalled) {
    return
  }

  soundWindow.__nikkiInteractionSoundInstalled = true
  document.documentElement.dataset.interactionSound = 'multi-ready'
  document.documentElement.dataset.interactionSoundTypes = Object.keys(SOUND_PRESETS).join(',')

  const sounds = Object.fromEntries(
    Object.entries(SOUND_PRESETS).map(([name, preset]) => [
      name,
      new Howl({
        src: [createSoundDataUri(preset)],
        volume: 0.28,
        preload: true,
      }),
    ])
  ) as Record<InteractionSoundName, Howl>

  const playSound = (soundName: InteractionSoundName): void => {
    document.documentElement.dataset.lastInteractionSound = soundName
    sounds[soundName].play()
  }

  let lastPointerSoundAt = 0
  let lastPointerSoundName: InteractionSoundName | null = null

  document.addEventListener(
    'click',
    (event) => {
      const soundName = resolveInteractionSound(event.target)

      if (
        soundName &&
        !(soundName === lastPointerSoundName && Date.now() - lastPointerSoundAt < 140)
      ) {
        playSound(soundName)
      }
    },
    { capture: true }
  )

  document.addEventListener(
    'pointerdown',
    (event) => {
      const soundName = resolveInteractionSound(event.target)

      if (soundName === 'drag') {
        lastPointerSoundAt = Date.now()
        lastPointerSoundName = soundName
        playSound(soundName)
      }
    },
    { capture: true }
  )
}
