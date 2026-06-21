<script setup lang="ts">
/**
 * @description: SigningProgressRail - 正本签发时间轴
 * @description 以交错时间轴展示六个仪式阶段，并在阶段变化时平滑滚动到当前节点。
 */
import { nextTick, ref, watch } from 'vue'
import type { SigningProgressItem } from '../../types'

const props = defineProps<{
  /** 六阶段配置 */
  items: SigningProgressItem[]
  /** 当前阶段索引 */
  activeIndex: number
  /** 是否已经完成签发 */
  complete: boolean
  /** 是否处于失败状态 */
  failed: boolean
}>()

/** 时间轴节点引用，用于阶段变化时滚动到当前步骤。 */
const itemRefs = ref<HTMLElement[]>([])

/**
 * @description: 判断阶段展示状态
 * @param {number} index - 阶段索引
 * @return {'done' | 'active' | 'pending' | 'failed'} 阶段状态
 */
function resolveItemState(index: number): 'done' | 'active' | 'pending' | 'failed' {
  if (props.failed && index === props.activeIndex) {
    return 'failed'
  }

  if (props.complete || index < props.activeIndex) {
    return 'done'
  }

  if (index === props.activeIndex) {
    return 'active'
  }

  return 'pending'
}

/**
 * @description: 记录时间轴节点
 * @param {Element | null} element - DOM 节点
 * @param {number} index - 阶段索引
 * @return {void} 无返回值
 */
function setItemRef(element: Element | null, index: number): void {
  if (element instanceof HTMLElement) {
    itemRefs.value[index] = element
  }
}

/**
 * @description: 滚动到当前阶段
 * @description 完成态滚动到最后一步，方便用户看到仪式收束。
 * @return {Promise<void>} 无返回值
 */
async function scrollActiveItemIntoView(): Promise<void> {
  await nextTick()

  const nextIndex = props.complete
    ? props.items.length - 1
    : Math.min(Math.max(props.activeIndex, 0), props.items.length - 1)
  const element = itemRefs.value[nextIndex]

  if (!element) {
    return
  }

  element.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  })
}

watch(
  [() => props.activeIndex, () => props.complete],
  () => {
    void scrollActiveItemIntoView()
  },
  { immediate: true }
)
</script>

<template>
  <ol class="signing-progress-rail" aria-live="polite">
    <li
      v-for="(item, index) in items"
      :key="item.id"
      :ref="(element) => setItemRef(element as Element | null, index)"
      :class="[
        'signing-progress-rail__item',
        `signing-progress-rail__item--${resolveItemState(index)}`,
      ]"
    >
      <article class="signing-progress-rail__card">
        <strong>{{ item.title }}</strong>
        <small>{{ item.description }}</small>
      </article>

      <span class="signing-progress-rail__spine" aria-hidden="true">
        <span class="signing-progress-rail__track" />
        <span class="signing-progress-rail__flow" />
        <span class="signing-progress-rail__icon">
          <v-icon
            :icon="
              resolveItemState(index) === 'done'
                ? 'mdi-check'
                : resolveItemState(index) === 'failed'
                  ? 'mdi-alert'
                  : item.icon
            "
            size="18"
          />
        </span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.signing-progress-rail {
  display: grid;
  gap: 0;
  max-width: 920px;
  padding: 0;
  margin: 0 auto;
  list-style: none;
}

.signing-progress-rail__item {
  display: grid;
  min-height: 118px;
  grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr);
  align-items: center;
}

.signing-progress-rail__card {
  display: grid;
  width: min(100%, 388px);
  gap: 5px;
  padding: 16px 18px;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--color-muted-dark);
  box-shadow: 0 14px 34px rgba(122, 78, 98, 0.08);
  transition:
    border-color 0.24s ease,
    background-color 0.24s ease,
    box-shadow 0.24s ease,
    transform 0.24s ease;
}

.signing-progress-rail__item:nth-child(odd) .signing-progress-rail__card {
  grid-column: 1;
  justify-self: end;
  text-align: right;
}

.signing-progress-rail__item:nth-child(even) .signing-progress-rail__card {
  grid-column: 3;
  justify-self: start;
}

.signing-progress-rail__card strong {
  overflow: hidden;
  color: inherit;
  font-size: 16px;
  font-weight: 840;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signing-progress-rail__card small {
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signing-progress-rail__spine {
  position: relative;
  display: grid;
  align-self: stretch;
  grid-column: 2;
  grid-row: 1;
  place-items: center;
}

.signing-progress-rail__track,
.signing-progress-rail__flow {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  border-radius: 999px;
  transform: translateX(-50%);
}

.signing-progress-rail__track {
  background: linear-gradient(180deg, transparent, rgba(239, 95, 143, 0.2), transparent);
}

.signing-progress-rail__flow {
  opacity: 0;
  background:
    radial-gradient(circle, rgba(255, 255, 255, 0.95) 0 22%, transparent 24%),
    linear-gradient(180deg, transparent 0%, rgba(255, 214, 109, 0.95) 46%, transparent 100%);
  background-size:
    100% 34px,
    100% 54px;
  animation: signing-timeline-flow 1.1s linear infinite;
}

.signing-progress-rail__icon {
  position: relative;
  z-index: 1;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 234, 242, 0.9);
  color: var(--color-primary-active);
  box-shadow: 0 0 0 6px rgba(255, 249, 252, 0.96);
  transition:
    background-color 0.24s ease,
    color 0.24s ease,
    transform 0.24s ease,
    box-shadow 0.24s ease;
}

.signing-progress-rail__item--active .signing-progress-rail__card {
  border-color: rgba(196, 138, 44, 0.56);
  background: rgba(255, 250, 236, 0.9);
  color: var(--color-foreground);
  box-shadow: 0 18px 40px rgba(196, 138, 44, 0.16);
  transform: translateY(-2px);
}

.signing-progress-rail__item--active .signing-progress-rail__icon {
  color: #7a5135;
  background: linear-gradient(135deg, #fff2c5, #ffd66d);
  box-shadow:
    0 0 0 6px rgba(255, 249, 252, 0.96),
    0 0 0 12px rgba(255, 214, 109, 0.18);
  transform: scale(1.08);
}

.signing-progress-rail__item--active .signing-progress-rail__flow {
  opacity: 1;
}

.signing-progress-rail__item--done .signing-progress-rail__card {
  border-color: rgba(85, 188, 169, 0.34);
  background: rgba(240, 255, 250, 0.78);
}

.signing-progress-rail__item--done .signing-progress-rail__icon {
  color: var(--color-mint);
  background: rgba(85, 188, 169, 0.16);
}

.signing-progress-rail__item--failed .signing-progress-rail__card {
  border-color: rgba(217, 54, 112, 0.42);
  background: rgba(255, 234, 242, 0.84);
}

.signing-progress-rail__item--failed .signing-progress-rail__icon {
  color: #b6245d;
  background: rgba(255, 234, 242, 0.94);
}

@keyframes signing-timeline-flow {
  from {
    background-position:
      0 -34px,
      0 -54px;
  }

  to {
    background-position:
      0 34px,
      0 54px;
  }
}

@media (max-width: 760px) {
  .signing-progress-rail {
    max-width: 100%;
  }

  .signing-progress-rail__item {
    min-height: 102px;
    grid-template-columns: 58px minmax(0, 1fr);
  }

  .signing-progress-rail__spine {
    grid-column: 1;
  }

  .signing-progress-rail__item:nth-child(odd) .signing-progress-rail__card,
  .signing-progress-rail__item:nth-child(even) .signing-progress-rail__card {
    grid-column: 2;
    justify-self: stretch;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .signing-progress-rail__flow {
    animation: none;
  }
}
</style>
