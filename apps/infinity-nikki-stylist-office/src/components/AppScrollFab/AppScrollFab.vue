<script setup lang="ts">
/**
 * @description: AppScrollFab - 全局返回顶部浮动按钮
 * @description 按钮只发起请求，具体滚动容器由当前页面注册的 hook 决定。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollTopStore } from '@/stores/scrollTop'

const { t } = useI18n()
const scrollTopStore = useScrollTopStore()

const isVisible = computed(() => scrollTopStore.isBackTopVisible)
</script>

<template>
  <v-scale-transition>
    <div
      v-if="isVisible"
      class="fixed bottom-[calc(24px+var(--safe-bottom))] right-6 z-[1200] max-[640px]:bottom-[calc(86px+var(--safe-bottom))] max-[640px]:right-4"
    >
      <v-tooltip location="left">
        <template #activator="{ props }">
          <v-fab
            v-bind="props"
            :aria-label="t('common.action.backTop')"
            color="primary"
            icon="mdi-arrow-up"
            size="large"
            data-sound="primary"
            @click="scrollTopStore.requestScrollTop()"
          />
        </template>
        <span>{{ t('common.action.backTop') }}</span>
      </v-tooltip>
    </div>
  </v-scale-transition>
</template>
