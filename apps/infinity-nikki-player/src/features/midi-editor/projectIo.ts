/**
 * @fileOverview MIDI 编辑器项目的输入输出胶水
 * @description 把曲库 MIDI / 本地 .mid 转成项目，或把项目导出为 .mid / 加入播放器；列表页与编辑页共用。
 */
import { invoke } from '@tauri-apps/api/core'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { computeProjectMeta, createProject, encodeMidi } from '@strawberrybear/midi-editor'
import type { MidiProject } from '@strawberrybear/midi-editor'
import { adaptMidiToPianoRoll } from '@/views/MainWindow/FilesTab/pages/MidiDetailPage/pianoRollAdapter'
import { getMidiDisplayTitle } from '@/lib/midiDisplay'
import { useMidiProjectStore } from '@/stores/midiProjects'
import { usePlayerStore } from '@/stores/player'
import type { MidiInfo } from '@/types'

/** 项目名称上限，与 Rust 端文件名校验一致。 */
export const PROJECT_NAME_MAX_LENGTH = 30

/**
 * @description: 把名称裁到合法长度，并在与已有项目重名时追加序号
 * @param {string} name 期望名称
 * @param {ReadonlySet<string>} existing 已存在的名称集合
 * @param {string} fallback 名称为空时的兜底
 * @return {string} 唯一且长度合法的名称
 */
export function uniqueProjectName(
  name: string,
  existing: ReadonlySet<string>,
  fallback: string
): string {
  const base = Array.from(name.trim() || fallback)
    .slice(0, PROJECT_NAME_MAX_LENGTH)
    .join('')
    .trim()
  if (!existing.has(base)) return base
  for (let index = 2; ; index += 1) {
    const suffix = ` (${index})`
    const candidate =
      Array.from(base).slice(0, PROJECT_NAME_MAX_LENGTH - suffix.length).join('').trimEnd() + suffix
    if (!existing.has(candidate)) return candidate
  }
}

/**
 * @description: 由曲库 MidiInfo 构造新项目；名称取显示标题并自动去重
 * @param {MidiInfo} midi 已解析的 MIDI（需包含 events）
 * @param {(index: number) => string} trackName 缺省轨名生成器
 * @return {MidiProject} 未保存的新项目
 */
export function createProjectFromMidi(
  midi: MidiInfo,
  trackName: (index: number) => string
): MidiProject {
  const projectStore = useMidiProjectStore()
  const existing = new Set(projectStore.projects.map((item) => item.name))
  return createProject({
    name: uniqueProjectName(getMidiDisplayTitle(midi), existing, 'Untitled'),
    document: adaptMidiToPianoRoll(midi, trackName),
    source: { filename: midi.filename },
  })
}

/**
 * @description: 解析磁盘上的 .mid 文件为项目（不落盘）
 * @param {string} path 文件绝对路径
 * @param {(index: number) => string} trackName 缺省轨名生成器
 * @return {Promise<MidiProject>} 新项目
 */
export async function createProjectFromMidiFile(
  path: string,
  trackName: (index: number) => string
): Promise<MidiProject> {
  const [midi] = await invoke<[MidiInfo, unknown[]]>('parse_midi_file', { path })
  return createProjectFromMidi(midi, trackName)
}

/**
 * @description: 复制项目为新建项目（新 ID、名称加“副本”后缀、时间戳重置）
 * @param {MidiProject} source 源项目
 * @param {(name: string) => string} copyName 副本命名规则
 * @return {MidiProject} 新项目
 */
export function duplicateProject(
  source: MidiProject,
  copyName: (name: string) => string
): MidiProject {
  const projectStore = useMidiProjectStore()
  const existing = new Set(projectStore.projects.map((item) => item.name))
  return {
    ...createProject({
      name: uniqueProjectName(copyName(source.name), existing, source.name),
      document: source.document,
      source: source.source,
    }),
    loop: source.loop ?? null,
    meta: computeProjectMeta(source.document),
  }
}

/**
 * @description: 编码项目为标准 MIDI 字节
 * @param {MidiProject} project 项目
 * @return {Uint8Array} SMF 字节
 */
export function projectToMidiBytes(project: MidiProject): Uint8Array {
  return encodeMidi(project.document, { name: project.name })
}

/**
 * @description: 弹出保存对话框并导出 .mid
 * @param {MidiProject} project 项目
 * @return {Promise<boolean>} 是否完成写盘；用户取消返回 false
 */
export async function exportProjectAsMidi(project: MidiProject): Promise<boolean> {
  const target = await saveDialog({
    defaultPath: `${project.name}.mid`,
    filters: [{ name: 'MIDI', extensions: ['mid'] }],
  })
  if (!target) return false
  await useMidiProjectStore().saveBinaryFile(target, projectToMidiBytes(project))
  return true
}

/**
 * @description: 把项目编码后加入播放器曲库（不自动切换当前曲目）
 * @param {MidiProject} project 项目
 * @return {Promise<boolean>} 导入是否成功
 */
export function addProjectToLibrary(project: MidiProject): Promise<boolean> {
  return usePlayerStore().importMidiBuffer(`${project.name}.mid`, projectToMidiBytes(project), {
    autoSelect: false,
  })
}
