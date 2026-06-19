<script setup lang="ts">
/**
 * @description: AppHeader - 应用顶部导航
 * @description 左侧品牌区整体回到首页，右侧只保留语言和个人中心等高频入口。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import appLogo from '@/assets/images/logo.png'
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
      <button
        type="button"
        class="flex max-w-[min(62vw,520px)] min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left max-[520px]:max-w-[54vw]"
        data-sound="nav"
        :aria-label="t('common.action.backHome')"
        @click="openHome"
      >
        <span
          class="inline-flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-[#fff0f5] shadow-[0_8px_18px_rgba(239,95,143,0.14)] max-[520px]:h-9 max-[520px]:w-9"
        >
          <img
            :src="appLogo"
            alt="ZTachi"
            class="block h-9 w-9 object-contain max-[520px]:h-8 max-[520px]:w-8"
          />
        </span>
        <span class="grid min-w-0 gap-0.5">
          <span
            class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-[780] leading-tight text-[var(--color-foreground)] max-[520px]:text-[14px]"
          >
            {{ t('app.agency') }}
          </span>
          <span
            class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold leading-tight text-[var(--color-primary-active)] max-[520px]:text-[11px]"
          >
            {{ t('app.title') }}
          </span>
        </span>
      </button>
    </v-app-bar-title>

    <template #append>
      <div class="flex min-w-0 items-center gap-1">
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
</style>
