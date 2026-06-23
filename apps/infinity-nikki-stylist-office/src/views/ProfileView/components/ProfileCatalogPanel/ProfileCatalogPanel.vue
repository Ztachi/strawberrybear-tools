<script setup lang="ts">
/**
 * @description: ProfileCatalogPanel - 个人中心协会资料库页签
 * @description 该组件只服务 ProfileView，封装资料库说明与本地 seed 概览。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'

const { t } = useI18n()

/** 当前资料库来源仍是本地 seed；只在个人中心展示管理信息。 */
const catalogRows = computed(() => [
  { label: t('profile.associationDossierNo'), value: import.meta.env.VITE_APP_VERSION },
  { label: t('profile.catalogVersion'), value: associationCatalogSeed.catalogVersion },
  { label: t('profile.titleCount'), value: String(associationCatalogSeed.titleOptions.length) },
  { label: t('profile.templateCount'), value: String(associationCatalogSeed.templates.length) },
])
</script>

<template>
  <div class="grid gap-[22px]">
    <div class="max-w-[680px]">
      <p class="mb-2 mt-0 text-[12px] font-[780] text-[var(--color-gold)]">
        {{ t('profile.catalogEyebrow') }}
      </p>
      <h2 class="m-0 text-[24px] font-[820] text-[var(--color-primary-active)]">
        {{ t('profile.catalogTitle') }}
      </h2>
      <p class="mb-0 mt-2.5 leading-[1.8]">
        {{ t('profile.catalogDescription') }}
      </p>
    </div>

    <dl class="m-0 grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[760px]:grid-cols-1">
      <div
        v-for="row in catalogRows"
        :key="row.label"
        class="min-h-24 rounded-2xl border border-[#c48a2c]/20 bg-white/60 p-[18px]"
      >
        <dt class="text-[13px] text-[var(--color-muted-dark)]">
          {{ row.label }}
        </dt>
        <dd class="mb-0 mt-2.5 text-[22px] font-[780] text-[var(--color-foreground)]">
          {{ row.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
