<script setup lang="ts">
/**
 * @description: AppHeader - 应用顶部导航
 * @description 对齐 sensitive-word-checker 的结构：左侧品牌与标题，右侧语言下拉和个人中心入口。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import appLogo from '@/assets/images/logo.png'
import { getActiveDraft } from '@/db/repositories/draftRepository'
import LanguageSwitcher from './LanguageSwitcher.vue'

const { t } = useI18n()
const router = useRouter()

/**
 * @description: 返回应用首页
 * @return {void} 无返回值
 */
function openHome(): void {
  void router.push({ name: 'home' })
}

/**
 * @description: 继续当前办理流程
 * @description 顶部导航不创建新草稿，只有已有办理档案时才直接回到对应阶段。
 * @return {Promise<void>} 无返回值
 */
async function openCurrentDraft(): Promise<void> {
  const activeDraft = await getActiveDraft()

  if (!activeDraft) {
    await router.push({ name: 'home' })
    return
  }

  await router.push({ name: activeDraft.stage })
}

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
        <button
          type="button"
          class="app-header__logo-link"
          data-sound="nav"
          :aria-label="t('common.action.backHome')"
          @click="openHome"
        >
          <img :src="appLogo" alt="ZTachi" class="app-header__logo" />
        </button>
        <span class="app-header__title">{{ t('app.fullTitle') }}</span>
      </div>
    </v-app-bar-title>

    <template #append>
      <div class="app-header__actions">
        <nav class="app-header__nav">
          <v-btn
            color="primary"
            variant="text"
            prepend-icon="mdi-home-heart"
            data-sound="nav"
            @click="openHome"
          >
            <span>{{ t('common.action.home') }}</span>
          </v-btn>
          <v-btn
            color="primary"
            variant="text"
            prepend-icon="mdi-file-document-edit-outline"
            data-sound="nav"
            @click="openCurrentDraft"
          >
            <span>{{ t('common.action.currentDraft') }}</span>
          </v-btn>
        </nav>
        <LanguageSwitcher />
        <v-btn
          :aria-label="t('common.action.openProfile')"
          icon="mdi-account-circle-outline"
          variant="text"
          size="small"
          data-sound="nav"
          @click="openProfile"
        />
      </div>
    </template>
  </v-app-bar>
</template>

<style scoped>
.app-header {
  border-bottom-color: rgba(239, 95, 143, 0.18);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.94), rgba(255, 239, 247, 0.94)),
    repeating-linear-gradient(
      90deg,
      rgba(239, 95, 143, 0.06) 0,
      rgba(239, 95, 143, 0.06) 1px,
      transparent 1px,
      transparent 18px
    );
  backdrop-filter: blur(18px);
}

.app-header__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.app-header__logo-link {
  padding: 0;
  border: 0;
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #fff0f5;
  cursor: pointer;
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

.app-header__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.app-header__nav .v-btn {
  color: var(--color-primary-active);
}

@media (max-width: 960px) {
  .app-header__nav .v-btn span {
    display: none;
  }
}

@media (max-width: 720px) {
  .app-header__title {
    max-width: 34vw;
    font-size: 14px;
  }
}

@media (max-width: 420px) {
  .app-header__title {
    max-width: 24vw;
  }
}
</style>
