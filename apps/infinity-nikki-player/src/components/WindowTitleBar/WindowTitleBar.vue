<script setup lang="ts">
/** 主窗口和独立窗口共用的沉浸式标题栏：平台按钮、拖动留白与可选居中操作区。 */
import { computed, useSlots } from 'vue'
import WindowsWindowControls from './components/WindowsWindowControls.vue'
withDefaults(defineProps<{ snapLayouts?: boolean }>(), { snapLayouts: true })
const isWindows = computed(() => /Windows/i.test(navigator.userAgent))
const slots = useSlots()
</script>

<template>
  <header
    class="window-title-bar"
    :class="{ windows: isWindows, 'has-center': !!slots.center }"
    data-tauri-drag-region
  >
    <div
      class="window-title-bar__title"
      data-tauri-drag-region
    >
      <slot name="title" />
    </div>
    <div
      v-if="slots.center"
      class="window-title-bar__center"
    >
      <slot name="center" />
    </div>
    <div
      class="window-title-bar__actions"
      data-tauri-drag-region
    >
      <slot name="actions" />
      <WindowsWindowControls
        v-if="isWindows"
        :snap-layouts="snapLayouts"
      />
    </div>
  </header>
</template>

<style scoped>
.window-title-bar {
  @apply relative z-30 flex shrink-0 select-none items-center justify-between gap-3 pr-4 pl-[90px];
  height: var(--global-menu-height, 46px);
}
.window-title-bar.windows { @apply pl-4 pr-0; }
.window-title-bar__title { @apply flex min-w-0 items-center gap-2.5; }
.window-title-bar__actions { @apply flex h-full shrink-0 items-center justify-end gap-3; }
.window-title-bar.has-center { @apply grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] pr-[90px]; }
.window-title-bar.has-center.windows { @apply px-0; }
.window-title-bar.has-center.windows .window-title-bar__title { @apply pl-4; }
.window-title-bar__center { @apply flex items-center justify-center; -webkit-app-region: no-drag; }
</style>
