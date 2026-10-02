import type { MidiProject } from '@strawberrybear/midi-editor'
import type { RouteLocationNormalized } from 'vue-router'

/** 编辑入口是草稿的归属；项目名称可修改，不能用作草稿标识。 */
export type MidiEditorEntry =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | { kind: 'song'; filename: string }
  | { kind: 'copy'; id: string }

/** 草稿文件端口，复用项目 store 的原生持久化，不持有第二份草稿缓存。 */
export interface MidiDraftPort {
  /** 读取完整草稿，不存在时返回 null。 */
  loadDraft(key: string): Promise<MidiProject | null>
  /** 写入成功后才允许删除迁移来源。 */
  saveDraft(key: string, project: MidiProject): Promise<void>
  /** 只删除指定入口的草稿。 */
  deleteDraft(key: string): Promise<void>
}

/**
 * @description: 在异步载入前捕获入口，避免解析 A 时路由已切换到 B。
 * @param {RouteLocationNormalized} route 当前路由
 * @return {MidiEditorEntry} 不依赖可变路由的入口快照
 */
export function midiEditorEntry(
  route: Pick<RouteLocationNormalized, 'name' | 'params' | 'query'>
): MidiEditorEntry {
  if (route.name === 'midi-editor-edit') return { kind: 'edit', id: String(route.params.id ?? '') }
  if (typeof route.query.from === 'string' && route.query.from)
    return { kind: 'song', filename: route.query.from }
  if (typeof route.query.fromProject === 'string' && route.query.fromProject)
    return { kind: 'copy', id: route.query.fromProject }
  return { kind: 'create' }
}

/**
 * @description: 判断两个入口是否属于同一个编辑会话，独立窗口还原也遵循此规则。
 * @param {MidiEditorEntry} left 当前入口
 * @param {MidiEditorEntry} right 目标入口
 * @return {boolean} 是否相同
 */
export function sameMidiEditorEntry(left: MidiEditorEntry, right: MidiEditorEntry): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'create') return true
  if (left.kind === 'song') return right.kind === 'song' && left.filename === right.filename
  return (right.kind === 'edit' || right.kind === 'copy') && left.id === right.id
}

/**
 * @description: 为各入口生成固定长度的文件安全键；完整文件名参与 SHA-256，长名称和中文不截断。
 * @param {MidiEditorEntry} entry 编辑入口
 * @return {Promise<string>} 草稿文件键
 */
export async function midiDraftKey(entry: MidiEditorEntry): Promise<string> {
  if (entry.kind === 'create') return 'create'
  if (entry.kind !== 'song') return `${entry.kind}-${entry.id}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entry.filename))
  return `source-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * @description: 读取入口自己的草稿；把旧版共用 create 中的歌曲草稿迁移到对应歌曲，成功落盘后才删除旧文件。
 * @param {MidiDraftPort} port 草稿持久化端口
 * @param {MidiEditorEntry} entry 编辑入口
 * @param {MidiProject} project 当前初始项目，用于核对已保存项目的身份
 * @return {Promise<MidiProject | null>} 匹配此入口的草稿
 */
export async function loadScopedMidiDraft(
  port: MidiDraftPort,
  entry: MidiEditorEntry,
  project: MidiProject
): Promise<MidiProject | null> {
  const legacy = await port.loadDraft('create')
  if (legacy?.source?.filename) {
    const sourceKey = await midiDraftKey({ kind: 'song', filename: legacy.source.filename })
    const scoped = await port.loadDraft(sourceKey)
    // 已有较新的歌曲草稿优先，升级迁移不能覆盖用户之后的编辑。
    if (
      !scoped ||
      scoped.source?.filename !== legacy.source.filename ||
      legacy.updatedAt > scoped.updatedAt
    )
      await port.saveDraft(sourceKey, legacy)
    await port.deleteDraft('create')
  }
  const draft = await port.loadDraft(await midiDraftKey(entry))
  if (!draft) return null
  if (entry.kind === 'create' && draft.source?.filename) return null
  if (entry.kind === 'song' && draft.source?.filename !== entry.filename) return null
  if (entry.kind === 'edit' && draft.id !== project.id) return null
  return draft
}
