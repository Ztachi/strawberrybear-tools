<script setup lang="ts">
/** @description: 共用目录与正文滚动容器；Anchor 负责定位和滚动同步，不修改路由历史。 */
import { nextTick, ref, watch } from 'vue'
import { Anchor } from 'antdv-next'

interface DocumentItem {
  key: string
  href: string
  title: string
}

const props = withDefaults(defineProps<{
  items: DocumentItem[]
  contentsLabel: string
  showContentsTitle?: boolean
  initialHref?: string
  navigationKey?: number
}>(), { showContentsTitle: true })
const content = ref<HTMLElement | null>(null)
const contents = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const navigation = ref<{ href: string; target: number; pending: boolean } | null>(null)

// 外部定位也走已有目录链接，让 Anchor 统一处理动画和高亮，避免两套滚动互相覆盖。
watch(
  [() => props.initialHref, contents, () => props.navigationKey],
  async ([href, container]) => {
    if (!href || !container) return
    await nextTick()
    if (props.initialHref !== href || !container.isConnected) return
    const link = Array.from(container.querySelectorAll<HTMLAnchorElement>('a'))
      .find((item) => item.getAttribute('href') === href)
    link?.click()
  },
  { flush: 'post' }
)

/** @return 当前弹窗的正文容器，避免目录错误地滚动主页面。 */
function getContentContainer(): HTMLElement {
  return content.value ?? document.documentElement
}

/** @param {MouseEvent} event - 目录点击事件 @return 不给桌面导航栈新增 hash 记录。 */
function preventHistoryChange(event: MouseEvent, link: { href: string }): void {
  event.preventDefault()
  const container = content.value
  const href = link.href
  const target = container?.querySelector<HTMLElement>(href)
  if (!container || !target) return
  const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8
  const clamped = Math.min(Math.max(top, 0), container.scrollHeight - container.clientHeight)
  navigation.value = { href, target: clamped, pending: Math.abs(container.scrollTop - clamped) > 1 }
}

/** 自然高度的末节不能总是滚到顶端；通过 Anchor 的扩展接口保留已定位的章节。 */
function currentAnchor(href: string): string {
  const container = content.value
  if (!container) return href
  const request = navigation.value
  if (request && (request.pending || Math.abs(scrollTop.value - request.target) <= 1)) return request.href
  if (container.scrollHeight > container.clientHeight && scrollTop.value >= container.scrollHeight - container.clientHeight - 1) return props.items.at(-1)?.href ?? href
  return href
}
function contentScrolled(): void {
  scrollTop.value = content.value?.scrollTop ?? 0
  const request = navigation.value
  if (!request) return
  if (Math.abs(scrollTop.value - request.target) <= 1) request.pending = false
  else if (!request.pending) navigation.value = null
}

/** @param {string} href - Anchor 已确认的当前正文位置 @return 仅滚动目录，让当前项完整可见。 */
async function keepActiveVisible(href: string): Promise<void> {
  await nextTick()
  const container = contents.value
  const link = container && Array.from(container.querySelectorAll('a')).find((item) => item.getAttribute('href') === href)
  if (!container || !link) return
  const viewport = container.getBoundingClientRect()
  const item = link.getBoundingClientRect()
  const offset = item.top < viewport.top ? item.top - viewport.top - 8
    : item.bottom > viewport.bottom ? item.bottom - viewport.bottom + 8 : 0
  if (offset === 0) return
  // 避免 scrollIntoView 连带滚动正文或外层弹窗；减少动态效果时直接定位。
  container.scrollTo({
    top: container.scrollTop + offset,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}
</script>

<template>
  <div
    data-text-selectable
    class="section-document grid h-full min-h-0 grid-cols-[168px_minmax(0,1fr)] text-sm leading-6 text-[var(--color-foreground)] max-[560px]:grid-cols-[124px_minmax(0,1fr)]"
  >
    <aside
      ref="contents"
      class="min-h-0 overflow-y-auto border-r border-primary/15 pr-4 max-[560px]:pr-2"
    >
      <h3
        v-if="showContentsTitle"
        class="mb-3 mt-0 text-xs font-semibold text-[var(--color-muted-dark)]"
      >
        {{ contentsLabel }}
      </h3>
      <nav :aria-label="contentsLabel">
        <Anchor
          :affix="false"
          :get-container="getContentContainer"
          :items="items"
          :target-offset="8"
          :get-current-anchor="currentAnchor"
          :styles="{ itemTitle: { whiteSpace: 'normal' } }"
          @click="preventHistoryChange"
          @change="keepActiveVisible"
        >
          <template #item="item">
            <slot name="item" :item="item">
              {{ item.title }}
            </slot>
          </template>
        </Anchor>
      </nav>
    </aside>
    <div
      ref="content"
      class="section-document-content min-h-0 overflow-y-auto pl-5 pr-1 max-[560px]:pl-3"
      @scroll="contentScrolled"
    >
      <slot />
    </div>
  </div>
</template>
