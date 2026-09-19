let counter = 0

/**
 * @description: 生成进程内唯一的 ID；时间戳保证跨会话大致有序，计数器避免同毫秒冲突。
 * @param {string} prefix ID 前缀
 * @return {string} 形如 `note-1700000000000-12` 的 ID
 */
function nextId(prefix: string): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

/**
 * @description: 生成音符 ID，并保证不与文档现有 ID 重复。
 * @param {ReadonlySet<string>} existing 文档现有音符 ID 集合
 * @return {string} 新音符 ID
 */
export function createNoteId(existing?: ReadonlySet<string>): string {
  let id = nextId('note')
  while (existing?.has(id)) id = nextId('note')
  return id
}

/**
 * @description: 生成轨道 ID，并保证不与文档现有 ID 重复。
 * @param {ReadonlySet<string>} existing 文档现有轨道 ID 集合
 * @return {string} 新轨道 ID
 */
export function createTrackId(existing?: ReadonlySet<string>): string {
  let id = nextId('track')
  while (existing?.has(id)) id = nextId('track')
  return id
}

/**
 * @description: 生成项目 ID，只包含文件名安全字符。
 * @return {string} 形如 `project-1700000000000` 的 ID
 */
export function createProjectId(): string {
  return `project-${Date.now()}`
}
