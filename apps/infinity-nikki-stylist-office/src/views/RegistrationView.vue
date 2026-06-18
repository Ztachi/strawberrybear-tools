<script setup lang="ts">
/**
 * @description: RegistrationView - 登记资料页骨架
 * @description 建立响应式登记表单、证书语言选择和预览区域，具体保存服务后续接入。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BottomActionBar from '@/components/BottomActionBar.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { UI_LOCALE_OPTIONS } from '@/i18n'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const uiStore = useUiStore()
const stylistName = ref('')
const selectedTitleId = ref(associationCatalogSeed.titleOptions[0]?.id ?? '')

/** 证书语言与 UI 语言分离，创建草稿时默认值来自 uiStore.lastCertificateLocale。 */
const certificateLocale = computed({
  get: () => uiStore.lastCertificateLocale,
  set: (value) => uiStore.setLastCertificateLocale(value),
})

/** 语言选择项复用统一语言数据源，避免登记页手写语言集合。 */
const certificateLocaleItems = computed(() =>
  UI_LOCALE_OPTIONS.map((option) => ({
    title: t(option.labelKey),
    value: option.value,
  }))
)

/** 称号 seed 当前只有中文内容，非中文 UI 下先按资料库回退策略显示中文。 */
const titleItems = computed(() =>
  associationCatalogSeed.titleOptions.map((option) => ({
    ...option,
    displayName: resolveLocalizedText(option.name, uiStore.uiLocale),
    displayDescription: resolveLocalizedText(option.description, uiStore.uiLocale),
  }))
)
</script>

<template>
  <ResponsivePageShell :title="t('registration.title')" :subtitle="t('registration.subtitle')">
    <div class="office-page-grid">
      <section class="registration-form">
        <v-card variant="flat" class="registration-card">
          <v-card-text class="registration-card__body">
            <v-text-field
              v-model="stylistName"
              :label="t('registration.stylistName')"
              :hint="t('registration.stylistNameHint')"
              maxlength="14"
              counter="14"
              variant="outlined"
              color="primary"
            />

            <v-select
              v-model="certificateLocale"
              :items="certificateLocaleItems"
              :label="t('registration.certificateLanguage')"
              variant="outlined"
              color="primary"
            />

            <div class="title-grid" :aria-label="t('registration.titleOption')">
              <v-card
                v-for="option in titleItems"
                :key="option.id"
                :class="['title-option', { 'title-option--active': option.id === selectedTitleId }]"
                variant="flat"
                @click="selectedTitleId = option.id"
              >
                <span class="title-option__symbol">{{ option.symbol }}</span>
                <strong>{{ option.displayName }}</strong>
                <span>{{ option.displayDescription }}</span>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </section>

      <aside class="registration-preview">
        <v-card variant="flat" class="registration-card">
          <v-card-title>{{ t('registration.previewTitle') }}</v-card-title>
          <v-card-text>
            <div class="certificate-aspect-box registration-preview__box">
              <span>{{ t('registration.previewDescription') }}</span>
            </div>
          </v-card-text>
        </v-card>
      </aside>
    </div>

    <BottomActionBar :primary-label="t('registration.confirm')" @primary="() => undefined" />
  </ResponsivePageShell>
</template>

<style scoped>
.registration-card {
  border: 1px solid var(--border-primary-20);
  background: var(--bg-white-90);
  box-shadow: var(--shadow-card);
}

.registration-card__body {
  display: grid;
  gap: 18px;
}

.title-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.title-option {
  display: grid;
  min-height: 128px;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border-primary-20);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.title-option--active {
  border-color: var(--color-primary-active);
  background: var(--bg-primary-10);
}

.title-option__symbol {
  color: var(--color-gold);
  font-size: 24px;
  line-height: 1;
}

.title-option span:last-child {
  color: var(--color-muted-dark);
  font-size: 13px;
  line-height: 1.55;
}

.registration-preview__box {
  display: grid;
  place-items: center;
  padding: 22px;
  color: var(--color-muted-dark);
  text-align: center;
}
</style>
