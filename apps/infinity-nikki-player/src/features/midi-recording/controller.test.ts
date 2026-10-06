import { describe, expect, it, vi } from 'vitest'
import { createProject, encodeMidi, decodeMidi } from '@strawberrybear/midi-editor'
import { TrackRecorder } from './controller'
import type { TrackRecorderInput, RecorderAudio } from './types'

function setup() {
  let clock = 0
  const audio: RecorderAudio = {
    prepare: async () => {},
    now: () => clock,
    note: vi.fn(() => ({ stop: vi.fn() })),
    stopAccompaniment: vi.fn(),
    startAccompaniment: vi.fn(),
  }
  const project = createProject()
  const input: TrackRecorderInput = {
    project,
    trackId: 'track-1',
    startTick: 0,
    baseRevision: 'base',
    templates: [
      {
        id: 't',
        name: 'Test',
        is_builtin: false,
        mappings: [
          { key: 'A', pitch: 61 },
          { key: 'S', pitch: 108 },
        ],
      },
    ],
    templateId: 't',
  }
  const recorder = new TrackRecorder(input, audio)
  return {
    recorder,
    audio,
    project,
    input,
    time: (n: number) => {
      clock = n
    },
  }
}

describe('键盘录制会话', () => {
  it('首键前等待及停止前空白不入曲，保留内部休止和准确模板音高', async () => {
    const { recorder: r, time, project } = setup()
    await r.start()
    time(20)
    r.press('A', 'kbd:A')
    time(20.5)
    r.release('kbd:A')
    time(22)
    r.press('S', 'kbd:S')
    time(22.25)
    r.release('kbd:S')
    time(30)
    r.stop()
    expect(
      r.editor.getState().document.notes.map((n) => [n.pitch, n.startTick, n.endTick])
    ).toEqual([
      [61, 0, 480],
      [108, 1920, 2160],
    ])
    expect(r.result().endTick).toBe(2160)
    expect(project.document.notes).toHaveLength(0)
    const decoded = decodeMidi(encodeMidi(r.editor.getState().document))
    expect(decoded.notes.map((n) => [n.pitch, n.startTick, n.endTick])).toEqual([
      [61, 0, 480],
      [108, 1920, 2160],
    ])
  })
  it('暂停释放长音，继续首键接末尾，整次停止一次撤销', async () => {
    const { recorder: r, time } = setup()
    await r.start()
    r.press('A', 'kbd:A')
    time(1)
    r.pause()
    time(30)
    await r.resume()
    time(40)
    r.press('S', 'kbd:S')
    time(40.5)
    r.release('kbd:S')
    r.stop()
    expect(r.editor.getState().document.notes.map((n) => [n.startTick, n.endTick])).toEqual([
      [0, 960],
      [960, 1440],
    ])
    r.dispatch({ type: 'undo' })
    expect(r.editor.getState().document.notes).toHaveLength(0)
  })
  it('同一键的物理和鼠标来源合并，重复按下不会重复录音', async () => {
    const { recorder: r, time } = setup()
    await r.start()
    r.press('A', 'kbd:A')
    r.press('A', 'kbd:A')
    r.press('A', 'mouse:1')
    time(1)
    r.release('kbd:A')
    time(2)
    r.release('mouse:1')
    r.stop()
    expect(r.editor.getState().document.notes).toHaveLength(1)
    expect(r.editor.getState().document.notes[0]!.endTick).toBe(1920)
  })
  it('倒数中的按住键不跨界录入，结束后保留空拍', async () => {
    const { recorder: r, time } = setup()
    r.countIn = true
    await r.start()
    r.press('A', 'kbd:A')
    time(2)
    r.advance()
    time(3)
    r.release('kbd:A')
    r.press('S', 'kbd:S')
    time(3.5)
    r.release('kbd:S')
    r.stop()
    expect(
      r.editor.getState().document.notes.map((n) => [n.pitch, n.startTick, n.endTick])
    ).toEqual([[108, 960, 1440]])
  })
  it('重录跨界长音保留两侧，范围到期自动结束，空重录不删除', async () => {
    const { input, audio, time } = setup()
    input.project.document.notes = [
      { id: 'long', trackId: input.trackId, pitch: 60, velocity: 90, startTick: 0, endTick: 1920 },
    ]
    input.range = { startTick: 480, endTick: 1440 }
    const r = new TrackRecorder(input, audio)
    r.mode = 'replace'
    await r.start()
    r.stop()
    expect(r.editor.getState().document.notes).toHaveLength(1)
    await r.start()
    r.press('A', 'kbd:A')
    time(2)
    r.advance()
    expect(r.status).toBe('stopped')
    expect(
      r.editor.getState().document.notes.map((n) => [n.pitch, n.startTick, n.endTick])
    ).toEqual([
      [60, 0, 480],
      [60, 1440, 1920],
      [61, 480, 1440],
    ])
    r.dispatch({ type: 'undo' })
    expect(r.editor.getState().document.notes).toHaveLength(1)
  })
  it('准备音频时取消不会迟到启动；失败允许重试', async () => {
    const { input, audio } = setup()
    let resolve!: () => void
    audio.prepare = () =>
      new Promise<void>((r) => {
        resolve = r
      })
    const r = new TrackRecorder(input, audio)
    const preparing = r.start()
    r.dispose()
    resolve()
    await preparing
    expect(r.status).toBe('disposed')
    audio.prepare = async () => {
      throw new Error('load')
    }
    const retry = new TrackRecorder(input, audio)
    await expect(retry.start()).rejects.toThrow('load')
    expect(retry.status).toBe('idle')
  })
})

it('未录制时先准备音色再试听，迟到的准备不能重新按住已释放或取消的键', async () => {
  const { recorder, audio } = setup()
  let ready!: () => void
  audio.prepare = () =>
    new Promise<void>((resolve) => {
      ready = resolve
    })
  const pending = recorder.auditionPress('A', 'kbd:A')
  expect(audio.note).not.toHaveBeenCalled()
  recorder.release('kbd:A')
  ready()
  await pending
  expect(audio.note).not.toHaveBeenCalled()
  const active = recorder.auditionPress('A', 'kbd:A')
  ready()
  await active
  expect(audio.note).toHaveBeenCalledWith(61, 80)
  expect(recorder.dirty).toBe(false)
  recorder.releaseAll()
  expect(recorder.activeKeys()).toEqual([])
})

it('跨速度变化换算、超过原曲末尾、和弦与1 tick最短音符', async () => {
  const { input, audio, time } = setup()
  input.project.document.tempoMap = [
    { tick: 0, microsecondsPerQuarter: 500000 },
    { tick: 480, microsecondsPerQuarter: 1000000 },
  ]
  const r = new TrackRecorder(input, audio)
  await r.start()
  r.press('A', 'kbd:A')
  r.press('S', 'kbd:S')
  time(1.5)
  r.release('kbd:A')
  r.release('kbd:S')
  r.press('A', 'kbd:A')
  r.release('kbd:A')
  time(100)
  r.press('S', 'kbd:S')
  time(101)
  r.release('kbd:S')
  r.stop()
  expect(
    r
      .result()
      .notes.slice(0, 3)
      .map((n) => [n.startTick, n.endTick])
  ).toEqual([
    [0, 960],
    [0, 960],
    [960, 961],
  ])
  expect(r.result().endTick).toBeGreaterThan(input.project.document.durationTicks)
})

it('恢复录制检查点保留未释放音符和模板，不能越界修改其他音轨', async () => {
  const { recorder: r, input, audio, time } = setup()
  input.project.document.tracks.push({
    id: 'other',
    name: 'Other',
    enabled: true,
    isPercussion: false,
    endTick: 480,
  })
  await r.start()
  r.press('A', 'kbd:A')
  time(0.5)
  r.advance()
  const draft = r.checkpoint()
  r.dispose()
  const restored = new TrackRecorder(input, audio)
  restored.restoreDraft(draft)
  expect(restored.result().notes[0]!.endTick).toBe(480)
  expect(restored.result().endTick).toBe(480)
  expect(restored.dirty).toBe(true)
  restored.dispatch({
    type: 'add-note',
    trackId: 'other',
    startTick: 480,
    durationTicks: 480,
    pitch: 62,
    velocity: 80,
  })
  expect(restored.result().notes).toHaveLength(2)
  expect(restored.editor.getState().document.notes.every((n) => n.trackId === input.trackId)).toBe(
    true
  )
})

it('倒数和节拍器按音频锚点提前调度，帧刷新迟到不会漂移拍点', async () => {
  const { recorder: r, audio, time } = setup()
  audio.click = vi.fn()
  r.countIn = true
  r.metronome = true
  await r.start()
  r.advance()
  expect(audio.click).toHaveBeenCalledWith(true, 0)
  time(0.42)
  r.advance()
  expect(audio.click).toHaveBeenCalledWith(false, 0.5)
  time(2.08)
  r.advance()
  expect(audio.click).toHaveBeenCalledWith(true, 2)
})

it('暂停后可以修改刚录音符，先收尾录音再形成独立编辑撤销', async () => {
  const { recorder: r, time } = setup()
  await r.start()
  r.press('A', 'kbd:A')
  time(0.5)
  r.pause()
  const id = r.preview().document.notes[0]!.id
  r.dispatch({ type: 'select', mode: 'replace', noteIds: [id] })
  r.dispatch({ type: 'set-velocity', changes: [{ noteId: id, velocity: 100 }] })
  expect(r.status).toBe('stopped')
  expect(r.result().notes[0]!.velocity).toBe(100)
  r.dispatch({ type: 'undo' })
  expect(r.result().notes[0]!.velocity).toBe(80)
  r.dispatch({ type: 'undo' })
  expect(r.result().notes).toHaveLength(0)
})

it('空轨提前停止重录保留全部区间留白，检查点和恢复保持同一边界', async () => {
  const { input, audio, time } = setup()
  input.project.document.tracks[0]!.endTick = 100
  input.range = { startTick: 480, endTick: 1440 }
  const r = new TrackRecorder(input, audio)
  r.mode = 'replace'
  await r.start()
  r.press('A', 'kbd:A')
  time(0.1)
  r.release('kbd:A')
  const checkpoint = r.checkpoint()
  expect(checkpoint.document.tracks[0]!.endTick).toBe(1440)
  r.stop()
  expect(r.result().endTick).toBe(1440)
  const restored = new TrackRecorder(input, audio)
  restored.restoreDraft(checkpoint)
  expect(restored.result().endTick).toBe(1440)
})

it('暂停的录音必须收尾后才能改变录制方式与范围，保留既有音乐', async () => {
  const { input, audio, time } = setup()
  input.project.document.notes = [
    { id: 'old', trackId: 'track-1', pitch: 60, velocity: 80, startTick: 0, endTick: 480 },
  ]
  input.range = { startTick: 0, endTick: 480 }
  const r = new TrackRecorder(input, audio)
  await r.start()
  r.press('A', 'kbd:A')
  time(0.1)
  r.pause()
  r.configureMode('replace', { startTick: 0, endTick: 480 })
  expect(r.status).toBe('stopped')
  expect(r.result().notes.map((n) => [n.startTick, n.endTick])).toEqual([
    [0, 480],
    [480, 576],
  ])
  expect(r.mode).toBe('replace')
})

it('跟拍录制保留计时启动后的尾部空拍', async () => {
  const { recorder: r, time } = setup()
  r.countIn = true
  await r.start()
  time(3)
  r.press('A', 'kbd:A')
  time(3.5)
  r.release('kbd:A')
  time(4)
  r.stop()
  expect(r.result().notes.map((n) => [n.startTick, n.endTick])).toEqual([[960, 1440]])
  expect(r.result().endTick).toBe(1920)
})

it('工作区可编辑当前音轨区域边界，其他音轨的区域仍隔离', () => {
  const { input, audio } = setup()
  input.project.document.tracks.push({
    id: 'other',
    name: 'Other',
    enabled: true,
    isPercussion: false,
    endTick: 960,
  })
  const r = new TrackRecorder(input, audio)
  r.dispatch({ type: 'resize-track-region', trackId: 'track-1', endTick: 240 })
  r.dispatch({ type: 'resize-track-region', trackId: 'other', endTick: 240 })
  expect(r.result().endTick).toBe(240)
  expect(r.editor.getState().document.tracks[1]!.endTick).toBe(960)
})
