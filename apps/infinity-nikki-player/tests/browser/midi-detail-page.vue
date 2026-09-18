<script setup lang="ts">
import { mainPageIdentity } from '@/router/pageIdentity'
/** 仅提供真实详情页需要的根级上下文，不复制页面模板或工具栏。 */
import { App as AntApp, ConfigProvider } from 'antdv-next'
import GlobalMusicPlayer from '@/components/GlobalMusicPlayer/index.vue'
import { RouterView } from 'vue-router'
import { getAntdvLocale, i18n } from '@/i18n'
import { infinityNikkiConfigProviderProps } from '@/theme/infinityNikkiTheme'
const showGlobalPlayer = new URLSearchParams(location.search).has('controls')
</script>

<template>
  <ConfigProvider
    v-bind="infinityNikkiConfigProviderProps"
    :locale="getAntdvLocale(i18n.global.locale.value)"
  >
    <AntApp>
      <main style="height: 100vh; padding: 12px; background: var(--color-background)">
        <RouterView v-slot="{ Component, route }">
          <section
            :key="mainPageIdentity(route)"
            style="height: 100%"
          >
            <component :is="Component" />
          </section>
        </RouterView>
        <GlobalMusicPlayer v-if="showGlobalPlayer" />
      </main>
    </AntApp>
  </ConfigProvider>
</template>
