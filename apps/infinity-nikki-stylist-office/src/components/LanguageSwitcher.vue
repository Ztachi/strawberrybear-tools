<script setup lang="ts">
/**
 * @description: LanguageSwitcher - 顶部语言切换下拉菜单
 * @description 只切换 UI 语言，不改变当前草稿的证书语言，避免界面操作触发证书重绘。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UI_LOCALE_OPTIONS, setUiLocale } from '@/i18n'
import { useUiStore } from '@/stores/ui'
import type { LocaleCode } from '@/domain/catalog/types'

const { t } = useI18n()
const uiStore = useUiStore()

/** 当前语言展示项，用于按钮上显示图标和文字。 */
const currentOption = computed(() => {
  return UI_LOCALE_OPTIONS.find((option) => option.value === uiStore.uiLocale) ?? UI_LOCALE_OPTIONS[0]
})

/**
 * @description: 切换 UI 语言
 * @description UI store 负责持久化，vue-i18n 负责即时刷新界面文案。
 * @param {LocaleCode} locale - 目标 UI 语言
 * @return {void} 无返回值
 */
function handleSelect(locale: LocaleCode): void {
  uiStore.setUiLocale(locale)
  setUiLocale(locale)
}
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        :aria-label="t('common.language.label')"
        variant="text"
        class="language-switcher"
      >
        <v-icon :icon="currentOption.icon" size="18" />
        <span class="language-switcher__label">{{ t(currentOption.labelKey) }}</span>
        <v-icon icon="mdi-chevron-down" size="16" />
      </v-btn>
    </template>

    <v-list density="compact" min-width="180">
      <v-list-item
        v-for="option in UI_LOCALE_OPTIONS"
        :key="option.value"
        :active="option.value === uiStore.uiLocale"
        color="primary"
        @click="handleSelect(option.value)"
      >
        <template #prepend>
          <v-icon :icon="option.icon" size="18" />
        </template>
        <v-list-item-title>{{ t(option.labelKey) }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<style scoped>
.language-switcher {
  min-width: 0;
  padding-inline: 8px;
}

.language-switcher__label {
  display: inline-block;
  max-width: 92px;
  margin-inline: 6px 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 599px) {
  .language-switcher__label {
    max-width: 54px;
  }
}
</style>
