<script setup lang="ts">
/** @description: 共用目录与正文滚动容器；Anchor 负责定位和滚动同步，不修改路由历史。 */
import { nextTick, ref } from 'vue'
import { Anchor } from 'antdv-next'

interface DocumentItem {
  key: string
  href: string
  title: string
}

defineProps<{
  items: DocumentItem[]
  contentsLabel: string
}>()
const content = ref<HTMLElement | null>(null)
const contents = ref<HTMLElement | null>(null)

/** @return 当前弹窗的正文容器，避免目录错误地滚动主页面。 */
function getContentContainer(): HTMLElement {
  return content.value ?? document.documentElement
}

/** @param {MouseEvent} event - 目录点击事件 @return 不给桌面导航栈新增 hash 记录。 */
function preventHistoryChange(event: MouseEvent): void {
  event.preventDefault()
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
      <h3 class="mb-3 mt-0 text-xs font-semibold text-[var(--color-muted-dark)]">
        {{ contentsLabel }}
      </h3>
      <nav :aria-label="contentsLabel">
        <Anchor
          :affix="false"
          :get-container="getContentContainer"
          :items="items"
          :target-offset="8"
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
    >
      <slot />
    </div>
  </div>
</template>
