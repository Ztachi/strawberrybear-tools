<script setup lang="ts">
/**
 * @description: 右下角悬浮操作按钮组
 * @description 统一提供返回顶部和刷新入口，具体滚动行为由调用方控制。
 */
import { Button } from 'antdv-next'
import { ArrowUp, Crosshair, RefreshCw } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    showBackToTop?: boolean
    showLocateCurrent?: boolean
    backToTopTitle: string
    locateCurrentTitle?: string
    refreshTitle: string
    position?: 'absolute' | 'fixed'
  }>(),
  {
    showBackToTop: false,
    showLocateCurrent: false,
    locateCurrentTitle: '',
    position: 'absolute',
  }
)

const emit = defineEmits<{
  backToTop: []
  locateCurrent: []
  refresh: []
}>()
</script>

<template>
  <div class="floating-action-group" :class="`floating-action-group-${props.position}`">
    <Button
      v-show="showBackToTop"
      shape="square"
      size="small"
      color="primary"
      variant="filled"
      class="floating-action-btn"
      :title="backToTopTitle"
      @click="emit('backToTop')"
    >
      <template #icon>
        <ArrowUp :size="16" />
      </template>
    </Button>

    <Button
      v-show="showLocateCurrent"
      shape="square"
      size="small"
      color="primary"
      variant="filled"
      class="floating-action-btn"
      :title="locateCurrentTitle"
      @click="emit('locateCurrent')"
    >
      <template #icon>
        <Crosshair :size="16" />
      </template>
    </Button>

    <Button
      shape="square"
      size="small"
      color="primary"
      variant="filled"
      class="floating-action-btn refresh-btn"
      :title="refreshTitle"
      @click="emit('refresh')"
    >
      <template #icon>
        <RefreshCw :size="16" />
      </template>
    </Button>
  </div>
</template>

<style scoped>
.floating-action-group {
  @apply pointer-events-none z-[80] flex flex-col items-end;
  gap: 5px;
  right: 5px;
  bottom: 20px;
}

.floating-action-group-absolute {
  @apply absolute;
}

.floating-action-group-fixed {
  @apply fixed;
}

.floating-action-btn {
  @apply pointer-events-auto;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
  color: var(--color-primary-active);
  box-shadow: 0 8px 28px rgba(201, 67, 127, 0.12);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.floating-action-btn:hover {
  background: var(--color-primary);
  border-color: transparent;
  color: #fff;
  box-shadow: var(--shadow-pink-sm);
}

.refresh-btn:hover {
  transform: rotate(180deg);
}
</style>
