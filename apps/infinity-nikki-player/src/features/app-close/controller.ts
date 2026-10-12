/** 关闭请求只负责选择、持久化和调度；窗口、弹窗和编辑器由宿主注入。 */
export type CloseAction = 'tray' | 'quit'
export interface ClosePreferences {
  action: CloseAction
  confirmed: boolean
}
export interface CloseChoice {
  action: CloseAction
  remember: boolean
}
export interface AppClosePorts {
  preferences(): ClosePreferences
  choose(): Promise<CloseChoice | null>
  remember(action: CloseAction, confirmed: boolean): Promise<void>
  prepareQuit(): Promise<boolean>
  hide(): Promise<void>
  quit(): Promise<void>
}
export function createAppCloseController(ports: AppClosePorts) {
  let pending: Promise<void> | null = null
  function request(explicit?: CloseAction): Promise<void> {
    if (pending) return pending
    pending = (async () => {
      let action = explicit ?? ports.preferences().action
      if (!explicit && !ports.preferences().confirmed) {
        const choice = await ports.choose()
        if (!choice) return
        await ports.remember(choice.action, choice.remember)
        action = choice.action
      }
      if (action === 'tray') await ports.hide()
      else if (await ports.prepareQuit()) await ports.quit()
    })().finally(() => {
      pending = null
    })
    return pending
  }
  return { request }
}
const guards = new Set<() => Promise<boolean>>()
/** KeepAlive 编辑页面继续参与退出确认，避免切到其他页后忽略未保存工程。 */
export function registerAppCloseGuard(guard: () => Promise<boolean>): () => void {
  guards.add(guard)
  return () => {
    guards.delete(guard)
  }
}
export async function prepareAppQuit(): Promise<boolean> {
  for (const guard of guards) if (!(await guard())) return false
  return true
}
