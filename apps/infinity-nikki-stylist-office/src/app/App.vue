<script setup lang="ts">
/**
 * @description: App - 应用根组件
 * @description 负责挂载顶部导航和路由出口，页面级响应式布局由各 view 的 PageShell 承担。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader/AppHeader.vue'
import AppScrollFab from '@/components/AppScrollFab/AppScrollFab.vue'
import { useScrollTopControl } from '@/composables/useScrollTopControl'
import { preloadOfflineResourcesForRoute } from '@/domain/offline/preload'
import {
  OFFLINE_UPDATE_READY_EVENT,
  type OfflineUpdateReadyEventDetail,
} from '@/plugins/offlineCache'

const { t } = useI18n()
const currentRoute = useRoute()
useScrollTopControl({ scopeId: 'app-window', threshold: 260 })

/** 离线资源包更新提示。 */
const isOfflineUpdateVisible = ref(false)
/** 应用等待中的离线资源更新。 */
let applyOfflineUpdate: () => void = () => {
  window.location.reload()
}

/**
 * @description: 获取页面过渡 key
 * @description 证书办理流程共用稳定 shell，步骤切换只在流程页底部内容区过渡。
 * @param {{ fullPath: string; meta: Record<string, unknown> }} route - 当前路由对象
 * @return {string} 过渡 key
 */
function getRouteViewKey(route: { fullPath: string; meta: Record<string, unknown> }): string {
  return String(route.meta.shellKey ?? route.fullPath)
}

/**
 * @description: 接收离线资源更新通知
 * @param {Event} event - 自定义更新事件
 * @return {void} 无返回值
 */
function handleOfflineUpdateReady(event: Event): void {
  const detail = (event as CustomEvent<OfflineUpdateReadyEventDetail>).detail

  applyOfflineUpdate = detail.apply
  isOfflineUpdateVisible.value = true
}

/**
 * @description: 应用离线资源更新
 * @return {void} 无返回值
 */
function updateOfflineResources(): void {
  isOfflineUpdateVisible.value = false
  applyOfflineUpdate()
}

onMounted(() => {
  window.addEventListener(OFFLINE_UPDATE_READY_EVENT, handleOfflineUpdateReady)
  preloadOfflineResourcesForRoute(currentRoute.name)

  watch(() => currentRoute.name, preloadOfflineResourcesForRoute)
})

onBeforeUnmount(() => {
  window.removeEventListener(OFFLINE_UPDATE_READY_EVENT, handleOfflineUpdateReady)
})
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
    <v-snackbar
      v-model="isOfflineUpdateVisible"
      location="bottom center"
      :timeout="-1"
      class="app-update-snackbar"
    >
      {{ t('preload.updateReady') }}
      <template #actions>
        <v-btn color="primary" variant="text" data-sound="primary" @click="updateOfflineResources">
          {{ t('preload.updateNow') }}
        </v-btn>
      </template>
    </v-snackbar>
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
