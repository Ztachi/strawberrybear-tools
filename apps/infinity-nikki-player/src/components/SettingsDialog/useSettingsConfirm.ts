/** 复用框架的上下文确认框，确保异步确认遵循设置当前语言和主题。 */
import { App } from 'antdv-next'
import { useI18n } from 'vue-i18n'
import type { VNode } from 'vue'

export function useSettingsConfirm() {
  const { modal } = App.useApp()
  const { t } = useI18n()
  return (title: string, content: string | VNode, dangerous = false): Promise<boolean> =>
    new Promise((resolve) => {
      modal.confirm({
        title,
        content,
        centered: true,
        okText: t('actions.confirm'),
        cancelText: t('actions.cancel'),
        okButtonProps: { danger: dangerous, autoInsertSpace: false },
        cancelButtonProps: { autoInsertSpace: false },
        onOk: () => {
          resolve(true)
        },
        onCancel: () => {
          resolve(false)
        },
      })
    })
}
