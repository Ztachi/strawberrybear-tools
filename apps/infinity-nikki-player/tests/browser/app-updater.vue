<script setup lang="ts">
/** 使用真实主题、顶部入口、更新面板和官方组件验收布局与交互。 */
import { App as AntApp, ConfigProvider } from 'antdv-next'
import { onMounted } from 'vue'
import { emit } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import AppUpdateStatus from '@/components/AppUpdateStatus.vue'
import AppUpdateButton from '@/components/AppUpdateButton.vue'
import AboutDialog from '@/components/AboutDialog/index.vue'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
import { getAntdvLocale } from '@/i18n'
const { locale } = useI18n()
const showAbout = new URLSearchParams(location.search).has('about')
onMounted(() => { if (showAbout) void emit('show_about') })
</script>
<template>
  <ConfigProvider v-bind="infinityNikkiConfigProviderProps" :locale="getAntdvLocale(locale)">
    <AntApp>
      <main class="fixture">
        <header>无限暖暖自动演奏 <AppUpdateButton /></header>
        <AboutDialog v-if="showAbout" />
        <article v-else>
          <h1>关于 · v1.2.0</h1>
          <AppUpdateStatus />
        </article>
      </main>
    </AntApp>
  </ConfigProvider>
</template>
<style scoped>
.fixture { min-height: 100vh; padding: 32px; background: #fff6f7; color: #493a41; }
header { display: flex; align-items: center; gap: 24px; }
article { margin: 40px auto; width: min(420px, 100%); padding: 24px; background: white; border-radius: 20px; }
h1 { font-size: 20px; margin: 0 0 20px; }
</style>
