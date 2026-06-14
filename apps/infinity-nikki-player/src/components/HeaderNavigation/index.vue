<script setup lang="ts">
/**
 * @description: Header 导航按钮组（后退/前进/刷新）
 * @description 复用于 Windows 与 macOS 自定义标题栏，按钮可用状态与浏览器原生前进/后退按钮完全一致。
 *
 * 浏览器原生 History API 没有公开「当前栈位置」与「是否还能前进」的概念，
 * `window.history.length` 在同会话内只增不减；vue-router 4 没有暴露任何「前进栈」API。
 * 但 vue-router 在 `window.history.state` 中维护了它自己的栈状态——`back`、`current`、
 * `forward` 三个字段。其中 `state.forward === null` 表示当前位置已处于栈顶（不能前进），
 * `state.back === null` 表示已处于栈底（不能后退）。本组件直接消费这两个字段，
 * 并通过 `router.options.history.listen` 在 vue-router 每次处理 popstate 时同步刷新按钮。
 *
 * 这种做法的优点：
 * - 用户的「前进/后退」按钮和我们组件的按钮完全使用同一份 vue-router 维护的状态；
 * - 即使用户使用浏览器键盘 Alt+← / Alt+→、手势返回、操作系统级导航，
 *   按钮也会因为 popstate 触发 `listen` 回调而即时刷新；
 * - 不需要自己维护栈指针，避免重复造轮子。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Tooltip } from 'antdv-next'
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-vue-next'

/** i18n 文案在此组件内直接获取，避免逐层透传 t 函数。 */
const { t } = useI18n()
/** vue-router 实例，用于读取当前路由与触发前进/后退。 */
const router = useRouter()

/**
 * 后退按钮是否可用：vue-router 在 state 中写入的 `back` 字段为 null 表示处于栈底。
 * 该字段是 vue-router 内部维护的栈状态，不依赖 `history.length` 这种不可靠的计数器。
 */
const canGoBack = ref(false)
/**
 * 前进按钮是否可用：vue-router 在 state 中写入的 `forward` 字段为 null 表示处于栈顶。
 */
const canGoForward = ref(false)

/**
 * @description: vue-router 在 history.state 上维护的内部结构（仅用到 back/forward）
 * @description 完整字段还包括 current/replaced/position/scroll，但本组件只需要判断是否还能前后穿越
 */
interface RouterHistoryState {
  /** 上一个历史 entry 的路径；为 null 表示已位于栈底 */
  back?: string | null
  /** 当前 entry 的路径 */
  current?: string
  /** 下一个历史 entry 的路径；为 null 表示已位于栈顶 */
  forward?: string | null
}

/**
 * @description: 从 window.history.state 同步按钮可用状态
 * @description 启动时、popstate 后、push/replace 后都可以调用此函数刷新
 * @return {void}
 */
function syncFromHistoryState(): void {
  // vue-router 把栈状态写进 window.history.state；其他代码不要绕过 vue-router 调原生 history API，
  // 否则这个 state 会被破坏，按钮可用性也会不可靠。
  const rawState = (window.history.state ?? {}) as RouterHistoryState
  // back 是上一个 entry 的路径，null 表示栈底
  canGoBack.value = rawState.back != null
  // forward 是下一个 entry 的路径，null 表示栈顶
  canGoForward.value = rawState.forward != null
}

/**
 * @description: 注册 vue-router 的历史监听
 * @description `router.options.history.listen` 回调仅在 popstate 触发（浏览器前进/后退或
 * `router.back/forward/go`），会带上精确的方向（back/forward）与位移量（delta）。
 * 我们利用这个回调作为刷新按钮状态的可靠入口，避免被普通 push/replace 干扰。
 * @return {() => void} 解绑函数
 */
function registerHistoryListener(): () => void {
  // listen 回调签名：(to, from, info) -> void
  // info.direction: 'back' | 'forward' | 'unknown'
  // info.delta: number（正数表示前进的位移量，负数表示后退的位移量）
  const unlisten = router.options.history.listen((_to, _from, info) => {
    // 只在真正的穿越历史场景刷新；unknown 通常是初始化等异常路径，跳过以免闪烁。
    if (info.direction === 'back' || info.direction === 'forward') {
      syncFromHistoryState()
    }
  })
  return unlisten
}

/**
 * @description: 触发路由后退
 * @description 按钮禁用时不会触发；委托给 vue-router，让它统一处理守卫、滚动恢复等
 * @return {void}
 */
function goBack(): void {
  if (!canGoBack.value) return
  void router.back()
}

/**
 * @description: 触发路由前进
 * @description 按钮禁用时不会触发；委托给 vue-router
 * @return {void}
 */
function goForward(): void {
  if (!canGoForward.value) return
  void router.forward()
}

/**
 * @description: 刷新当前页面
 * @description 与历史栈无关，直接调用 location.reload 重置前端状态
 * @return {void}
 */
function refreshPage(): void {
  window.location.reload()
}

/** 三个按钮的 tooltip 文案集中派生，避免在模板中重复三元。 */
const backTitle = computed(() => t('headerNav.back'))
const forwardTitle = computed(() => t('headerNav.forward'))
const refreshTitle = computed(() => t('headerNav.refresh'))

/** 当前路由的 fullPath，作为 popstate 同步的兜底，避免 vue-router 异步触发 listen 时按钮短暂滞后。 */
const currentFullPath = computed(() => router.currentRoute.value.fullPath)

/** listen 返回的解绑函数，组件卸载时调用。 */
let removeHistoryListener: (() => void) | null = null

onMounted(() => {
  // 首次进入时立即读一次 state；此时 vue-router 已经在 state 中写入了 back/forward。
  syncFromHistoryState()
  removeHistoryListener = registerHistoryListener()
})

onBeforeUnmount(() => {
  removeHistoryListener?.()
  removeHistoryListener = null
})

// 路由变化（push/replace）后，vue-router 也会更新 history.state；通过监听 currentFullPath 兜底刷新。
// 这样即便 listen 因为某些原因没触发（例如内存 history），按钮也能正确反映新状态。
watch(currentFullPath, () => syncFromHistoryState())
</script>

<template>
  <div class="header-nav" data-tauri-drag-region>
    <Tooltip :title="backTitle">
      <button
        type="button"
        class="header-nav-btn"
        :disabled="!canGoBack"
        :aria-label="backTitle"
        @click="goBack"
      >
        <ArrowLeft class="header-nav-icon" />
      </button>
    </Tooltip>

    <Tooltip :title="forwardTitle">
      <button
        type="button"
        class="header-nav-btn"
        :disabled="!canGoForward"
        :aria-label="forwardTitle"
        @click="goForward"
      >
        <ArrowRight class="header-nav-icon" />
      </button>
    </Tooltip>

    <Tooltip :title="refreshTitle">
      <button
        type="button"
        class="header-nav-btn header-nav-refresh"
        :aria-label="refreshTitle"
        @click="refreshPage"
      >
        <RefreshCw class="header-nav-icon" />
      </button>
    </Tooltip>
  </div>
</template>

<style scoped>
.header-nav {
  /* 与 HeaderActions 一起放在标题栏右侧，需要继承 drag region 属性让非按钮区域可拖动窗口 */
  @apply flex h-full shrink-0 items-center gap-1;
}

.header-nav-btn {
  /* 单纯图标入口使用原生 button 承载，配合 Tooltip 提供提示，避免引入 Button 边框 */
  @apply flex h-8 w-8 items-center justify-center rounded-full transition-colors;
  color: var(--color-primary);
}

.header-nav-btn:hover:not(:disabled) {
  background: var(--bg-primary-10);
}

.header-nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.header-nav-icon {
  width: 17px;
  height: 17px;
  stroke-width: 2.25;
}

/* 刷新按钮 hover 时图标旋转 180 度，参考 QQ 音乐 / Chrome 的交互反馈 */
.header-nav-refresh:hover:not(:disabled) .header-nav-icon {
  transform: rotate(180deg);
  transition: transform 0.4s ease;
}
</style>
