/**
 * @fileOverview MIDI 编辑器项目列表状态
 * @description 持有项目摘要列表并封装 Rust 持久化命令；完整文档只在编辑页按需载入。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type { MidiProject, MidiProjectMeta } from '@strawberrybear/midi-editor'

/** 列表页使用的项目摘要，与 Rust `MidiProjectSummary` 一致。 */
export interface MidiProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  source?: { filename?: string }
  meta: MidiProjectMeta
}

export const useMidiProjectStore = defineStore('midiProjects', () => {
  /** 项目摘要，后端按 updatedAt 倒序返回。 */
  const projects = ref<MidiProjectSummary[]>([])
  const isLoading = ref(false)
  let loaded = false

  /**
   * @description: 拉取全部项目摘要
   * @return {Promise<void>}
   */
  async function loadProjects(): Promise<void> {
    isLoading.value = true
    try {
      projects.value = await invoke<MidiProjectSummary[]>('get_midi_projects')
      loaded = true
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @description: 首次访问时加载，之后复用缓存
   * @return {Promise<void>}
   */
  async function ensureLoaded(): Promise<void> {
    if (!loaded) await loadProjects()
  }

  /** 用后端返回的摘要替换/插入列表项并保持倒序。 */
  function upsert(summary: MidiProjectSummary): void {
    const rest = projects.value.filter((item) => item.id !== summary.id)
    projects.value = [summary, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * @description: 载入完整项目
   * @param {string} id 项目 ID
   * @return {Promise<MidiProject>}
   */
  function loadProject(id: string): Promise<MidiProject> {
    return invoke<MidiProject>('load_midi_project', { id })
  }

  /**
   * @description: 保存项目（新建或覆盖）
   * @param {MidiProject} project 完整项目
   * @return {Promise<MidiProjectSummary>} 写盘后的摘要
   */
  async function saveProject(project: MidiProject): Promise<MidiProjectSummary> {
    const summary = await invoke<MidiProjectSummary>('save_midi_project', { project })
    upsert(summary)
    return summary
  }

  /**
   * @description: 删除项目
   * @param {string} id 项目 ID
   * @return {Promise<void>}
   */
  async function deleteProject(id: string): Promise<void> {
    await invoke('delete_midi_project', { id })
    projects.value = projects.value.filter((item) => item.id !== id)
  }

  /**
   * @description: 重命名项目
   * @param {string} id 项目 ID
   * @param {string} newName 新名称
   * @return {Promise<MidiProjectSummary>}
   */
  async function renameProject(id: string, newName: string): Promise<MidiProjectSummary> {
    const summary = await invoke<MidiProjectSummary>('rename_midi_project', { id, newName })
    upsert(summary)
    return summary
  }

  /**
   * @description: 从 .json / .zip 导入项目
   * @param {string} sourcePath 文件路径
   * @return {Promise<MidiProjectSummary[]>} 导入结果
   */
  async function importProjects(sourcePath: string): Promise<MidiProjectSummary[]> {
    const imported = await invoke<MidiProjectSummary[]>('import_midi_projects', { sourcePath })
    for (const summary of imported) upsert(summary)
    return imported
  }

  /**
   * @description: 导出单个项目为 JSON
   * @param {string} id 项目 ID
   * @param {string} targetPath 目标路径
   * @return {Promise<void>}
   */
  function exportProject(id: string, targetPath: string): Promise<void> {
    return invoke('export_midi_project', { id, targetPath })
  }

  /**
   * @description: 批量导出 ZIP
   * @param {string[]} ids 项目 ID 列表
   * @param {string} targetPath 目标路径
   * @return {Promise<void>}
   */
  function exportProjectsArchive(ids: string[], targetPath: string): Promise<void> {
    return invoke('export_midi_projects_archive', { ids, targetPath })
  }

  /** 草稿读写；key 形如 `create` / `edit-{id}`。 */
  function saveDraft(key: string, project: MidiProject): Promise<void> {
    return invoke('save_midi_project_draft', { key, project })
  }
  function loadDraft(key: string): Promise<MidiProject | null> {
    return invoke<MidiProject | null>('load_midi_project_draft', { key })
  }
  function deleteDraft(key: string): Promise<void> {
    return invoke('delete_midi_project_draft', { key })
  }

  /**
   * @description: 把二进制内容写到用户选择的路径（导出 .mid）
   * @param {string} path 目标路径
   * @param {Uint8Array} data 文件字节
   * @return {Promise<void>}
   */
  function saveBinaryFile(path: string, data: Uint8Array): Promise<void> {
    return invoke('save_binary_file', { path, data: Array.from(data) })
  }

  return {
    projects,
    isLoading,
    loadProjects,
    ensureLoaded,
    loadProject,
    saveProject,
    deleteProject,
    renameProject,
    importProjects,
    exportProject,
    exportProjectsArchive,
    saveDraft,
    loadDraft,
    deleteDraft,
    saveBinaryFile,
  }
})
