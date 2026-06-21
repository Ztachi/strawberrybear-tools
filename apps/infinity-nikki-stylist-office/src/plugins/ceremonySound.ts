/**
 * @fileOverview 签发仪式音效
 * @description 使用 Howler 合成短音，避免引入大型音频资源，同时配合 GSAP 阶段触发。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { Howl } from 'howler'

/** 仪式音效类型。 */
export type CeremonySoundName = 'start' | 'phase' | 'seal' | 'complete' | 'failed'

interface CeremonySoundPreset {
  /** 音效长度，单位秒 */
  duration: number
  /** 混合音频率 */
  frequencies: number[]
  /** 音量系数 */
  gain: number
  /** 包络衰减 */
  decay: number
  /** 音高走势 */
  shape: 'bell' | 'sparkle' | 'seal' | 'chord' | 'fall'
}

/** 仪式阶段使用的轻量合成音色。 */
const CEREMONY_SOUND_PRESETS: Record<CeremonySoundName, CeremonySoundPreset> = {
  start: {
    duration: 0.62,
    frequencies: [784, 1174, 1568],
    gain: 0.42,
    decay: 3.6,
    shape: 'bell',
  },
  phase: {
    duration: 0.24,
    frequencies: [1046, 1568, 2093],
    gain: 0.34,
    decay: 6.8,
    shape: 'sparkle',
  },
  seal: {
    duration: 0.48,
    frequencies: [220, 440, 880],
    gain: 0.52,
    decay: 4.4,
    shape: 'seal',
  },
  complete: {
    duration: 0.86,
    frequencies: [523, 659, 784, 1046],
    gain: 0.44,
    decay: 3.2,
    shape: 'chord',
  },
  failed: {
    duration: 0.32,
    frequencies: [440, 330],
    gain: 0.32,
    decay: 6.2,
    shape: 'fall',
  },
}

let sounds: Record<CeremonySoundName, Howl> | null = null

/**
 * @description: 编码 WAV 数据 URI
 * @description 仪式音效由代码生成，不需要维护额外二进制素材。
 * @param {CeremonySoundPreset} preset - 音色参数
 * @return {string} WAV data URI
 */
function createCeremonySoundDataUri(preset: CeremonySoundPreset): string {
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
    const attack = Math.min(1, progress / 0.06)
    const envelope = attack * Math.exp(-progress * preset.decay)
    const sparkleGate =
      preset.shape === 'sparkle' ? 0.62 + Math.sin(progress * Math.PI * 22) * 0.38 : 1
    const pitchBend =
      preset.shape === 'fall'
        ? 1 - progress * 0.18
        : preset.shape === 'bell'
          ? 1 + Math.sin(progress * Math.PI) * 0.04
          : preset.shape === 'seal'
            ? 1.22 - progress * 0.26
            : 1
    const mixed =
      preset.frequencies.reduce((sum, frequency, frequencyIndex) => {
        const partialGain = 1 / (frequencyIndex + 1)
        const tone = Math.sin((2 * Math.PI * frequency * pitchBend * index) / sampleRate)
        const shimmer =
          preset.shape === 'chord'
            ? Math.sin((2 * Math.PI * frequency * 2.01 * index) / sampleRate) * 0.15
            : 0
        const sealBody =
          preset.shape === 'seal'
            ? Math.sin((2 * Math.PI * 164 * index) / sampleRate) * Math.exp(-progress * 12)
            : 0

        return sum + tone * partialGain + shimmer + sealBody
      }, 0) / preset.frequencies.length
    const sample = Math.max(-1, Math.min(1, mixed * envelope * sparkleGate * preset.gain))

    view.setInt16(headerSize + index * 2, sample * 0x7fff, true)
  }

  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return `data:audio/wav;base64,${window.btoa(binary)}`
}

/**
 * @description: 获取仪式音效实例
 * @return {Record<CeremonySoundName, Howl>} Howler 音效表
 */
function getCeremonySounds(): Record<CeremonySoundName, Howl> {
  if (!sounds) {
    sounds = Object.fromEntries(
      Object.entries(CEREMONY_SOUND_PRESETS).map(([name, preset]) => [
        name,
        new Howl({
          src: [createCeremonySoundDataUri(preset)],
          preload: true,
          volume: 0.28,
        }),
      ])
    ) as Record<CeremonySoundName, Howl>
  }

  return sounds
}

/**
 * @description: 播放仪式音效
 * @description 只会在用户点击正式签发后由页面调用，符合浏览器自动播放限制。
 * @param {CeremonySoundName} soundName - 音效类型
 * @return {void} 无返回值
 */
export function playCeremonySound(soundName: CeremonySoundName): void {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    return
  }

  getCeremonySounds()[soundName].play()
}
