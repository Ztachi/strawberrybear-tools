<script setup lang="ts">
/**
 * @description: AppHeader - 应用顶部导航
 * @description 对齐 sensitive-word-checker 的结构：左侧品牌与标题，右侧语言下拉和个人中心入口。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import appLogo from '@/assets/images/logo.png'
import LanguageSwitcher from './LanguageSwitcher.vue'

const { t } = useI18n()
const router = useRouter()
const homeUrl = 'https://ztachi.com'

/**
 * @description: 打开个人中心
 * @return {void} 无返回值
 */
function openProfile(): void {
  void router.push({ name: 'profile' })
}
</script>

<template>
  <v-app-bar flat border="b" color="surface" class="app-header px-2">
    <v-app-bar-title>
      <div class="app-header__brand">
        <a :href="homeUrl" class="app-header__logo-link" :aria-label="t('common.action.backHome')">
          <img :src="appLogo" alt="ZTachi" class="app-header__logo" />
        </a>
        <span class="app-header__title">{{ t('app.fullTitle') }}</span>
      </div>
    </v-app-bar-title>

    <template #append>
      <div class="app-header__actions">
        <LanguageSwitcher />
        <v-btn
          :aria-label="t('common.action.openProfile')"
          icon="mdi-account-circle-outline"
          variant="text"
          size="small"
          @click="openProfile"
        />
      </div>
    </template>
  </v-app-bar>
</template>

<style scoped>
.app-header__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.app-header__logo-link {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

.app-header__logo {
  display: block;
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.app-header__title {
  min-width: 0;
  overflow: hidden;
  color: var(--color-foreground);
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

@media (max-width: 720px) {
  .app-header__title {
    max-width: 42vw;
    font-size: 14px;
  }
}

@media (max-width: 420px) {
  .app-header__title {
    max-width: 31vw;
  }
}
</style>
