<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:22:40
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 21:25:01
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/components/AppHeader.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: AppHeader - 顶部导航栏，包含应用标题、语言切换和设置入口
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale, type Locale } from '../i18n'
import appLogo from '../assets/images/logo.png'
import SettingsDialog from './SettingsDialog.vue'

const { t, locale } = useI18n()
const showSettings = ref(false)
const homeUrl = 'https://ztachi.com'
const toolDetailsUrl = 'https://ztachi.com/tools/sensitive-word-checker'

const localeOptions: { label: string; value: Locale }[] = [
  { label: '中文', value: 'zh-CN' },
  { label: 'EN', value: 'en-US' },
]

function onLocaleChange(value: string) {
  if (value === 'zh-CN' || value === 'en-US') {
    setLocale(value)
  }
}
</script>

<template>
  <v-app-bar flat color="surface" border="b" class="px-2">
    <v-app-bar-title>
      <div class="flex items-center gap-2">
        <a :href="homeUrl" class="logo-link" :aria-label="t('common.button.backToMainSite')">
          <img :src="appLogo" alt="ZTachi" class="app-logo" />
        </a>
        <span class="font-semibold text-base">{{ t('app.title') }}</span>
      </div>
    </v-app-bar-title>

    <template #append>
      <div class="flex items-center gap-1 mr-2">
        <v-btn
          :href="toolDetailsUrl"
          prepend-icon="mdi-home-export-outline"
          variant="flat"
          rounded="lg"
          size="small"
          color="primary"
          class="mr-1 primary-action-btn"
        >
          {{ t('common.button.backToMainSite') }}
        </v-btn>

        <!-- 语言切换 -->
        <v-btn-toggle
          :model-value="locale"
          density="compact"
          rounded="lg"
          color="primary"
          @update:model-value="onLocaleChange"
        >
          <v-btn
            v-for="opt in localeOptions"
            :key="opt.value"
            :value="opt.value"
            size="small"
            variant="text"
          >
            {{ opt.label }}
          </v-btn>
        </v-btn-toggle>

        <!-- 设置 -->
        <v-btn
          :aria-label="t('common.button.settings')"
          icon="mdi-cog-outline"
          variant="text"
          size="small"
          @click="showSettings = true"
        />
      </div>
    </template>
  </v-app-bar>

  <SettingsDialog v-model="showSettings" />
</template>

<style scoped>
.logo-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

.app-logo {
  width: 28px;
  height: 28px;
  display: block;
  object-fit: contain;
}

.primary-action-btn {
  color: #ffffff !important;
}

.primary-action-btn :deep(.v-btn__content),
.primary-action-btn :deep(.v-btn__prepend),
.primary-action-btn :deep(.v-btn__append),
.primary-action-btn :deep(.v-icon) {
  color: #ffffff !important;
}
</style>
