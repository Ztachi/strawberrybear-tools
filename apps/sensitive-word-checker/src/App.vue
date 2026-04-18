<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:23:51
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:23:53
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/App.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: App - 根组件，包含顶部导航和主内容区域
 */
import AppHeader from './components/AppHeader.vue'
import HomeView from './views/HomeView.vue'
</script>

<template>
  <v-app>
    <AppHeader />
    <v-main class="bg-background">
      <HomeView />
    </v-main>
  </v-app>
</template>
