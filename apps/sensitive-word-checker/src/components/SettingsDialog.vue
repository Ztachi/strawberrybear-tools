<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:22:40
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 19:39:26
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/components/SettingsDialog.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: SettingsDialog - 扫描设置弹窗，配置大小写和标点忽略规则
 */
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'

const model = defineModel<boolean>({ default: false })

const { t } = useI18n()
const settings = useSettingsStore()
</script>

<template>
  <v-dialog v-model="model" max-width="420" :persistent="false">
    <v-card rounded="xl">
      <v-card-title class="pt-5 pb-2 px-6 font-semibold">
        {{ t('settings.title') }}
      </v-card-title>

      <v-divider />

      <v-card-text class="px-6 py-4">
        <v-list lines="two" density="compact" class="pa-0 overflow-visible">
          <!-- 区分大小写 -->
          <v-list-item class="px-0 rounded-lg mb-2">
            <template #title>
              <span class="text-sm font-medium">{{ t('settings.caseSensitive') }}</span>
            </template>
            <template #subtitle>
              <span
                class="text-xs text-medium-emphasis"
                >{{ t('settings.caseSensitiveHint') }}</span
              >
            </template>
            <template #append>
              <v-switch
                v-model="settings.caseSensitive"
                color="primary"
                hide-details
                density="compact"
              />
            </template>
          </v-list-item>

          <!-- 忽略标点 -->
          <v-list-item class="px-0 rounded-lg">
            <template #title>
              <span class="text-sm font-medium">{{ t('settings.ignorePunctuation') }}</span>
            </template>
            <template #subtitle>
              <span
                class="text-xs text-medium-emphasis"
                >{{ t('settings.ignorePunctuationHint') }}</span
              >
            </template>
            <template #append>
              <v-switch
                v-model="settings.ignorePunctuation"
                color="primary"
                hide-details
                density="compact"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="px-6 pb-5 pt-0 justify-end">
        <v-btn variant="tonal" color="primary" rounded="lg" @click="model = false">
          {{ t('common.button.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
