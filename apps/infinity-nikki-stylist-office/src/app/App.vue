<script setup lang="ts">
/**
 * @description: App - 应用根组件
 * @description 负责挂载顶部导航和路由出口，页面级响应式布局由各 view 的 PageShell 承担。
 */
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader/AppHeader.vue'
import AppScrollFab from '@/components/AppScrollFab/AppScrollFab.vue'
import { useScrollTopControl } from '@/composables/useScrollTopControl'

useScrollTopControl({ scopeId: 'app-window', threshold: 260 })

/**
 * @description: 获取页面过渡 key
 * @description 证书办理流程共用稳定 shell，步骤切换只在流程页底部内容区过渡。
 * @param {{ fullPath: string; meta: Record<string, unknown> }} route - 当前路由对象
 * @return {string} 过渡 key
 */
function getRouteViewKey(route: { fullPath: string; meta: Record<string, unknown> }): string {
  return String(route.meta.shellKey ?? route.fullPath)
}
</script>

<template>
  <v-app>
    <AppHeader />
    <v-main class="bg-background">
      <RouterView v-slot="{ Component, route }">
        <Transition name="office-route" mode="out-in" appear>
          <component :is="Component" :key="getRouteViewKey(route)" />
        </Transition>
      </RouterView>
    </v-main>
    <AppScrollFab />
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
