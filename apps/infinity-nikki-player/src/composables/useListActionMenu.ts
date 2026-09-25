import { ref } from 'vue'
import type { Ref } from 'vue'

/** 列表菜单的打开方式，用于区分右键菜单与“更多操作”按钮。 */
export type ListActionMenuTrigger = 'context' | 'click'

/**
 * @description: 列表操作菜单控制器
 * @description 统一约束同一列表内菜单的打开、关闭和状态查询。
 */
export interface ListActionMenuController {
  /** 当前打开菜单的组合键，没有打开菜单时为 null。 */
  openMenuKey: Ref<string | null>
  /** 查询指定入口的菜单是否打开。 */
  isMenuOpen: (trigger: ListActionMenuTrigger, itemKey: string) => boolean
  /** 更新指定入口的菜单状态。 */
  setMenuOpen: (trigger: ListActionMenuTrigger, itemKey: string, open: boolean) => void
  /** 关闭当前列表内已打开的菜单。 */
  closeMenu: () => void
}

/**
 * @description: 列表项“右键菜单 / 更多按钮”共用的受控打开状态。
 * @description: 同一列表始终只显示一个菜单，避免两个入口的浮层同时残留。
 * @return {ListActionMenuController} 列表菜单状态与操作方法
 */
export function useListActionMenu(): ListActionMenuController {
  const openMenuKey = ref<string | null>(null)

  /**
   * @description: 生成菜单入口的唯一键
   * @param {ListActionMenuTrigger} trigger - 菜单打开方式
   * @param {string} itemKey - 列表项唯一键
   * @return {string} 菜单入口唯一键
   */
  function buildMenuKey(trigger: ListActionMenuTrigger, itemKey: string): string {
    return `${trigger}:${itemKey}`
  }

  /**
   * @description: 查询指定列表项入口是否处于打开状态
   * @param {ListActionMenuTrigger} trigger - 菜单打开方式
   * @param {string} itemKey - 列表项唯一键
   * @return {boolean} 是否打开
   */
  function isMenuOpen(trigger: ListActionMenuTrigger, itemKey: string): boolean {
    return openMenuKey.value === buildMenuKey(trigger, itemKey)
  }

  /**
   * @description: 更新指定列表项入口的打开状态
   * @param {ListActionMenuTrigger} trigger - 菜单打开方式
   * @param {string} itemKey - 列表项唯一键
   * @param {boolean} open - 是否打开
   * @return {void}
   */
  function setMenuOpen(trigger: ListActionMenuTrigger, itemKey: string, open: boolean): void {
    const key = buildMenuKey(trigger, itemKey)
    if (open) {
      // 使用单一组合键保存状态，打开新菜单时会自然关闭上一个菜单。
      openMenuKey.value = key
      return
    }
    // 浮层延迟发出的关闭事件只能关闭自身，避免误关刚打开的另一菜单。
    if (openMenuKey.value === key) openMenuKey.value = null
  }

  /**
   * @description: 关闭当前列表内已打开的菜单
   * @return {void}
   */
  function closeMenu(): void {
    openMenuKey.value = null
  }

  return {
    openMenuKey,
    isMenuOpen,
    setMenuOpen,
    closeMenu,
  }
}
