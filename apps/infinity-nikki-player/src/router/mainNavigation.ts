/**
 * @fileOverview 主窗口页面栈导航工具
 * @description 用 Vue Router history state 区分“重新进入栏目”和“返回历史页面”。
 */
import type { HistoryState, RouteLocationRaw, Router } from 'vue-router'

/** 当前历史记录中的主页面实例标识。 */
export const MAIN_PAGE_ENTRY_STATE_KEY = 'infinityNikkiMainPageEntry'

let mainPageEntrySequence = 0

/**
 * 为一次新的栏目进入生成实例标识。
 * @return {string} 可写入 History API 的字符串标识
 */
function createMainPageEntryKey(): string {
  mainPageEntrySequence += 1
  return `${Date.now().toString(36)}-${mainPageEntrySequence.toString(36)}`
}

/**
 * 把普通路由目标声明为一次新的栏目进入。
 *
 * state 会跟随浏览器历史记录保存：push 创建新页面，back 则自动恢复原记录的 key。
 * @param {RouteLocationRaw} target - 原始路由目标
 * @param {{ replace?: boolean }} options - 是否替换当前历史记录
 * @return {RouteLocationRaw} 带独立历史记录标识的路由目标
 */
export function freshMainPageLocation(
  target: RouteLocationRaw,
  options: { replace?: boolean } = {}
): RouteLocationRaw {
  const location = typeof target === 'string' ? { path: target } : target
  return {
    ...location,
    force: true,
    replace: options.replace ?? location.replace,
    state: {
      ...(location.state ?? {}),
      [MAIN_PAGE_ENTRY_STATE_KEY]: createMainPageEntryKey(),
    },
  } as RouteLocationRaw
}

/**
 * 读取当前历史记录关联的主页面实例标识。
 * @param {HistoryState} historyState - Vue Router 当前 history state
 * @return {string | null} 合法标识；普通首次加载没有标识时返回 null
 */
export function getMainPageEntryKey(historyState: HistoryState): string | null {
  const entryKey = historyState[MAIN_PAGE_ENTRY_STATE_KEY]
  return typeof entryKey === 'string' && entryKey.length > 0 ? entryKey : null
}

/**
 * 返回上一条应用路由；直接打开子页面时以全新的栏目页替换当前记录。
 * @param {Router} router - Vue Router 实例
 * @param {RouteLocationRaw} fallback - 没有上一条记录时的栏目页
 * @return {Promise<void>} 导航请求完成
 */
export async function backOrReplaceWithFreshMainPage(
  router: Router,
  fallback: RouteLocationRaw
): Promise<void> {
  if (router.options.history.state.back != null) {
    router.back()
    return
  }
  await router.replace(freshMainPageLocation(fallback, { replace: true }))
}
