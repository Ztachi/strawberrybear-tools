<script setup lang="ts">
/**
 * @description: App - 应用根组件
 * @description 负责挂载顶部导航和路由出口，页面级响应式布局由各 view 的 PageShell 承担。
 */
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader/AppHeader.vue'
</script>

<template>
  <v-app>
    <AppHeader />
    <v-main class="bg-background">
      <RouterView v-slot="{ Component, route }">
        <Transition name="office-route" mode="out-in" appear>
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </v-main>
  </v-app>
</template>

<style scoped>
.office-route-enter-active,
.office-route-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease,
    filter 0.22s ease;
}

.office-route-enter-from {
  opacity: 0;
  filter: saturate(0.92);
  transform: translateY(12px) scale(0.992);
}

.office-route-leave-to {
  opacity: 0;
  filter: saturate(0.96);
  transform: translateY(-8px) scale(0.996);
}

@media (prefers-reduced-motion: reduce) {
  .office-route-enter-active,
  .office-route-leave-active {
    transition: opacity 0.12s ease;
  }

  .office-route-enter-from,
  .office-route-leave-to {
    opacity: 0;
    filter: none;
    transform: none;
  }
}
</style>
