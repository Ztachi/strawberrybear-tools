import { sound } from '@pixi/sound'

export type SfxId =
  | 'charge'
  | 'launch'
  | 'flipper'
  | 'bumper'
  | 'target'
  | 'event'
  | 'inspection'
  | 'rescue'
  | 'end'

interface ToneSpec {
  startHz: number
  endHz: number
  duration: number
  volume: number
  wave: 'sine' | 'triangle' | 'square'
}

const SFX_PREFIX = 'myy:'
const SFX: Record<SfxId, ToneSpec> = {
  charge: { startHz: 240, endHz: 480, duration: 0.18, volume: 0.28, wave: 'sine' },
  launch: { startHz: 380, endHz: 920, duration: 0.24, volume: 0.38, wave: 'triangle' },
  flipper: { startHz: 190, endHz: 135, duration: 0.08, volume: 0.22, wave: 'square' },
  bumper: { startHz: 520, endHz: 760, duration: 0.12, volume: 0.25, wave: 'sine' },
  target: { startHz: 460, endHz: 260, duration: 0.16, volume: 0.3, wave: 'triangle' },
  event: { startHz: 480, endHz: 960, duration: 0.3, volume: 0.3, wave: 'triangle' },
  inspection: { startHz: 620, endHz: 1240, duration: 0.34, volume: 0.3, wave: 'sine' },
  rescue: { startHz: 280, endHz: 820, duration: 0.38, volume: 0.34, wave: 'triangle' },
  end: { startHz: 420, endHz: 150, duration: 0.48, volume: 0.3, wave: 'sine' },
}

/**
 * @description 生成浏览器可直接解码的 16-bit 单声道 WAV，作为第一版离线音效
 * @param {ToneSpec} spec 音高、时长与波形
 * @return {ArrayBuffer} WAV 文件内容
 */
export function createToneWav(spec: ToneSpec): ArrayBuffer {
  const sampleRate = 22_050
  const samples = createToneSamples(spec, sampleRate)
  const sampleCount = samples.length
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, sampleCount * 2, true)

  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(44 + index * 2, samples[index] * 0x7fff, true)
  }
  return buffer
}

/** @description 生成带起音和衰减包络的单声道 PCM 样本 @return {Float32Array} PCM 样本 */
function createToneSamples(spec: ToneSpec, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.ceil(sampleRate * spec.duration))
  let phase = 0
  for (let index = 0; index < samples.length; index += 1) {
    const progress = index / Math.max(1, samples.length - 1)
    const frequency = spec.startHz + (spec.endHz - spec.startHz) * progress
    phase += (Math.PI * 2 * frequency) / sampleRate
    const raw =
      spec.wave === 'square'
        ? Math.sign(Math.sin(phase))
        : spec.wave === 'triangle'
          ? (2 / Math.PI) * Math.asin(Math.sin(phase))
          : Math.sin(phase)
    const attack = Math.min(1, progress / 0.08)
    const release = Math.pow(1 - progress, 1.7)
    samples[index] = Math.max(-1, Math.min(1, raw * attack * release * spec.volume))
  }
  return samples
}

/** @description 播放受全局音量和静音设置控制的本地合成音效 @return {void} */
export function playSfx(id: SfxId): void {
  const alias = `${SFX_PREFIX}${id}`
  try {
    if (!sound.exists(alias)) {
      const context = sound.context as typeof sound.context & { audioContext?: AudioContext }
      if (!context.audioContext) return
      const sampleRate = context.audioContext.sampleRate
      const samples = createToneSamples(SFX[id], sampleRate)
      const buffer = context.audioContext.createBuffer(1, samples.length, sampleRate)
      buffer.getChannelData(0).set(samples)
      // 直接注册 AudioBuffer，绕开浏览器对临时 WAV 的异步解码差异。
      sound.add(alias, { source: buffer, singleInstance: id === 'charge' })
    }
    void Promise.resolve(sound.play(alias)).catch(() => undefined)
  } catch {
    // 音频解码或浏览器自动播放策略失败不能中断物理和业务流程。
  }
}
