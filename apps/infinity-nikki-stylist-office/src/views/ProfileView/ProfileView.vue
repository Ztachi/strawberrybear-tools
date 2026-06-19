<script setup lang="ts">
/**
 * @description: ProfileView - 个人中心页骨架
 * @description 统一管理正在办理、我的证书、自定义资料、本地数据和协会资料库入口。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResponsivePageShell from '@/components/ResponsivePageShell/ResponsivePageShell.vue'
import { useUiStore, type ProfileTab } from '@/stores/ui'
import ProfileCatalogPanel from './components/ProfileCatalogPanel/ProfileCatalogPanel.vue'

const { t } = useI18n()
const uiStore = useUiStore()

/** tab 数据统一集中，避免模板复制标题和 value。 */
const tabs = computed<Array<{ value: ProfileTab; label: string }>>(() => [
  { value: 'activeDraft', label: t('profile.activeDraft') },
  { value: 'certificates', label: t('profile.certificates') },
  { value: 'customAssets', label: t('profile.customAssets') },
  { value: 'localData', label: t('profile.localData') },
  { value: 'catalog', label: t('profile.catalog') },
])
</script>

<template>
  <ResponsivePageShell :title="t('profile.title')" :subtitle="t('profile.subtitle')">
    <v-card variant="flat" class="profile-card">
      <v-tabs
        :model-value="uiStore.profileTab"
        color="primary"
        show-arrows
        @update:model-value="(value) => uiStore.setProfileTab(value as ProfileTab)"
      >
        <v-tab v-for="tab in tabs" :key="tab.value" :value="tab.value">
          {{ tab.label }}
        </v-tab>
      </v-tabs>

      <v-divider />

      <v-card-text class="profile-card__content">
        <ProfileCatalogPanel v-if="uiStore.profileTab === 'catalog'" />
        <p v-else>
          {{ t('profile.noDraft') }}
        </p>
      </v-card-text>
    </v-card>
  </ResponsivePageShell>
</template>

<style scoped>
.profile-card {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 246, 250, 0.9)),
    repeating-linear-gradient(
      135deg,
      rgba(239, 95, 143, 0.05) 0,
      rgba(239, 95, 143, 0.05) 1px,
      transparent 1px,
      transparent 18px
    );
  box-shadow: var(--shadow-card);
}

.profile-card__content {
  min-height: 220px;
  color: var(--color-muted-dark);
}
</style>
