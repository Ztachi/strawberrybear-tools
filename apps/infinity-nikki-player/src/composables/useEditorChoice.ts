/** 编辑器与录制工作区共用的异步选择状态。关闭或新问题会结束旧的等待。 */
import { shallowRef } from 'vue'
import type { EditorChoiceOption } from '@/components/EditorChoiceModal.vue'

export function useEditorChoice() {
  const choice = shallowRef({
    open: false,
    title: '',
    description: '',
    options: [] as readonly EditorChoiceOption[],
  })
  let pending: ((key: string) => void) | undefined
  function resolveChoice(key: string): void {
    const resolve = pending
    pending = undefined
    choice.value = { ...choice.value, open: false }
    resolve?.(key)
  }
  function ask(
    title: string,
    description: string,
    options: readonly EditorChoiceOption[]
  ): Promise<string> {
    resolveChoice('cancel')
    return new Promise((resolve) => {
      pending = resolve
      choice.value = { open: true, title, description, options }
    })
  }
  /** 草稿入口统一使用加载、丢弃、取消三个动作。 */
  function askDraft(
    t: (key: string) => string,
    title = t('midiEditor.draftFound'),
    description = t('midiEditor.loadDraftPrompt')
  ): Promise<string> {
    return ask(title, description, [
      { key: 'cancel', label: t('actions.cancel') },
      { key: 'discard', label: t('midiEditor.discardDraft'), danger: true },
      { key: 'load', label: t('midiEditor.loadDraft'), primary: true },
    ])
  }
  return { choice, ask, askDraft, resolveChoice }
}
