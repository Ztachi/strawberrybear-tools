/** 历史栈中的一条记录。 */
interface HistoryEntry<T> {
  state: T
  label: string
  coalesceKey?: string
}

/** 线性撤销/重做栈；状态本身不可变，栈只保存引用。 */
export interface History<T> {
  /** 当前状态。 */
  readonly present: T
  readonly canUndo: boolean
  readonly canRedo: boolean
  /**
   * 提交新状态。若 `coalesceKey` 与栈顶一致则原地替换栈顶，
   * 连续拖动只留下一条撤销记录。
   */
  commit(state: T, label: string, coalesceKey?: string): void
  /** 替换当前状态但不产生历史（例如保存后写回 updatedAt）。 */
  replace(state: T): void
  undo(): T | null
  redo(): T | null
  /** 结束一次合并序列，之后相同 key 的提交将成为新记录。 */
  breakCoalescing(): void
}

/**
 * @description: 创建有上限的撤销栈。
 * @param {T} initial 初始状态
 * @param {number} limit 最多保留的历史条数（不含当前）
 * @return {History<T>} 历史栈
 */
export function createHistory<T>(initial: T, limit = 200): History<T> {
  const entries: HistoryEntry<T>[] = [{ state: initial, label: 'initial' }]
  let index = 0
  let coalescing = true
  return {
    get present() {
      return entries[index]!.state
    },
    get canUndo() {
      return index > 0
    },
    get canRedo() {
      return index < entries.length - 1
    },
    commit(state, label, coalesceKey) {
      const top = entries[index]!
      if (coalescing && coalesceKey && top.coalesceKey === coalesceKey && index > 0) {
        // 同一拖动序列内只替换栈顶，重做分支已在首个提交时截断。
        entries[index] = { state, label, coalesceKey }
        return
      }
      entries.length = index + 1
      entries.push({ state, label, coalesceKey })
      // 超出上限时丢弃最早记录；限制针对可撤销步数，因此允许 limit+1 条。
      while (entries.length > limit + 1) entries.shift()
      index = entries.length - 1
      coalescing = true
    },
    replace(state) {
      entries[index] = { ...entries[index]!, state }
    },
    undo() {
      if (index <= 0) return null
      index -= 1
      coalescing = false
      return entries[index]!.state
    },
    redo() {
      if (index >= entries.length - 1) return null
      index += 1
      coalescing = false
      return entries[index]!.state
    },
    breakCoalescing() {
      coalescing = false
    },
  }
}
