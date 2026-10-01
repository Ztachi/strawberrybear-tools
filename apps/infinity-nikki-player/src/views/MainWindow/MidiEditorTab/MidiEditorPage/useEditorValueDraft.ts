import { computed, shallowRef, watch } from 'vue'

/**
 * 连续控件先维护本地显示值，完成一次交互后才提交业务动作。
 * 外部值变化（撤销、重做或切换选区）会丢弃旧草稿，避免提交到新的编辑对象。
 */
export function useEditorValueDraft<T>(source: () => T, submit: (value: T) => void) {
  const draft = shallowRef<{ value: T } | null>(null)
  const value = computed(() => (draft.value ? draft.value.value : source()))
  function update(next: T): void {
    draft.value = { value: next }
  }
  function cancel(): void {
    draft.value = null
  }
  function commit(): void {
    const pending = draft.value
    cancel()
    // 先清空再提交，避免 Enter 后的 blur 或框架重复完成事件再次入栈。
    if (pending) submit(pending.value)
  }
  watch(source, cancel, { flush: 'sync' })
  return { value, update, commit, cancel }
}
