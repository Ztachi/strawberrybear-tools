<script setup lang="ts">
/**
 * @description: App - 应用根组件
 * @description 负责挂载顶部导航和路由出口，页面级响应式布局由各 view 的 PageShell 承担。
 */
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
</script>

<template>
  <v-app>
    <AppHeader />
    <v-main class="bg-background">
      <RouterView />
    </v-main>
  </v-app>
</template>
