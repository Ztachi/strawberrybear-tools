<script setup lang="ts">
/**
 * @description: AppHeader - 应用顶部导航
 * @description 对齐 sensitive-word-checker 的结构：左侧品牌与标题，右侧语言下拉和个人中心入口。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import appLogo from '@/assets/images/logo.png'
import { getActiveDraft } from '@/db/repositories/draftRepository'
import LanguageSwitcher from './components/LanguageSwitcher/LanguageSwitcher.vue'

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
    <v-app-bar-title class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          class="inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-[10px] border-0 bg-[#fff0f5] p-0"
          data-sound="nav"
          :aria-label="t('common.action.backHome')"
          @click="openHome"
        >
          <img :src="appLogo" alt="ZTachi" class="block h-7 w-7 object-contain" />
        </button>
        <span
          class="min-w-0 max-w-[min(48vw,460px)] overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-[var(--color-foreground)] max-[720px]:max-w-[52vw] max-[720px]:text-[14px] max-[420px]:max-w-[56vw]"
        >
          {{ t('app.fullTitle') }}
        </span>
      </div>
    </v-app-bar-title>

    <template #append>
      <div class="flex min-w-0 items-center gap-1">
        <nav class="flex items-center gap-0.5 max-[520px]:hidden">
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

nav .v-btn {
  color: var(--color-primary-active);
}

@media (max-width: 960px) {
  nav .v-btn span {
    display: none;
  }
}
</style>
