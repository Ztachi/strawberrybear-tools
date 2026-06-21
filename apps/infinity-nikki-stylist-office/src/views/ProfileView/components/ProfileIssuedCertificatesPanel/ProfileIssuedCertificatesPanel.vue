<script setup lang="ts">
/**
 * @description: ProfileIssuedCertificatesPanel - 个人中心登记历史
 * @description 展示已签发证书历史，行点击弹窗查看登记详情，正本图片进入证书页即时生成。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import PickerDialogFrame from '@/components/PickerDialogFrame/PickerDialogFrame.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { resolveAvatarDisplaySource } from '@/db/repositories/avatarDisplayRepository'
import {
  deleteIssuedCertificate,
  getIssuedCertificate,
  listIssuedCertificates,
} from '@/db/repositories/issuedCertificateRepository'
import { resolveLocalizedText } from '@/domain/catalog/text'
import { useNavigationIntentStore } from '@/stores/navigationIntent'
import type { LocaleCode } from '@/domain/catalog/types'
import type { IssuedCertificate } from '@/domain/certificate/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const navigationIntent = useNavigationIntentStore()

/** 历史证书列表。 */
const certificates = ref<IssuedCertificate[]>([])
/** 搜索关键字。 */
const searchText = ref('')
/** 当前详情证书 ID。 */
const selectedCertificateId = ref('')
/** 当前待删除证书。 */
const deletingCertificate = ref<IssuedCertificate | null>(null)
/** 详情弹窗开关。 */
const isDetailDialogOpen = ref(false)
/** 删除确认弹窗开关。 */
const isDeleteDialogOpen = ref(false)
/** 加载状态。 */
const isLoading = ref(true)
/** 删除状态。 */
const isDeleting = ref(false)
/** 详情头像预览图。 */
const detailAvatarImageSrc = ref('')
/** 详情头像展示名。 */
const detailAvatarName = ref('')
/** 详情头像临时 URL 清理函数。 */
let cleanupDetailAvatar: () => void = () => {}

/** 表格默认排序，最新签发在最前。 */
const defaultSortBy = [{ key: 'issuedAt', order: 'desc' as const }]

/** 表格列配置。 */
const tableHeaders = computed(() => [
  { title: t('profile.historyCertificateNo'), key: 'certificateNo', sortable: true },
  { title: t('profile.historyStylistName'), key: 'stylistName', sortable: true },
  { title: t('profile.historyTitle'), key: 'titleName', sortable: true },
  { title: t('profile.historyIssuedAt'), key: 'issuedAt', sortable: true },
  { title: t('profile.historyActions'), key: 'actions', sortable: false, align: 'end' as const },
])

/** 当前详情证书。 */
const selectedCertificate = computed(
  () => certificates.value.find((certificate) => certificate.id === selectedCertificateId.value) ?? null
)

/**
 * @description: 解析登记地区展示名
 * @param {IssuedCertificate} certificate - 证书记录
 * @return {string} 地区名
 */
function resolveRegionDisplayName(certificate: IssuedCertificate): string {
  const region = associationCatalogSeed.regions.find((item) => item.id === certificate.regionId)

  return region ? resolveLocalizedText(region.name, certificate.certificateLocale) : certificate.regionCode
}

/**
 * @description: 解析证书模板展示名
 * @param {IssuedCertificate} certificate - 证书记录
 * @return {string} 模板名
 */
function resolveTemplateDisplayName(certificate: IssuedCertificate): string {
  const template = associationCatalogSeed.templates.find((item) => item.id === certificate.templateId)

  return template ? resolveLocalizedText(template.name, certificate.certificateLocale) : certificate.templateId
}

/**
 * @description: 解析语言展示名
 * @param {LocaleCode} locale - 语言代码
 * @return {string} 语言名
 */
function resolveLanguageDisplayName(locale: LocaleCode): string {
  const languageMap: Record<LocaleCode, string> = {
    'zh-CN': t('common.language.zhCN'),
    'zh-TW': t('common.language.zhTW'),
    'en-US': t('common.language.enUS'),
    'ja-JP': t('common.language.jaJP'),
  }

  return languageMap[locale]
}

/** 过滤后的历史列表。 */
const filteredCertificates = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  if (!keyword) {
    return certificates.value
  }

  return certificates.value.filter((certificate) =>
    [
      certificate.certificateNo,
      certificate.stylistName,
      certificate.titleName,
      resolveRegionDisplayName(certificate),
      resolveLanguageDisplayName(certificate.certificateLocale),
      certificate.issuedDateText,
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  )
})

/** 详情字段。 */
const detailRows = computed(() => {
  const certificate = selectedCertificate.value

  if (!certificate) {
    return []
  }

  return [
    { label: t('profile.historyCertificateNo'), value: certificate.certificateNo },
    { label: t('registration.stylistName'), value: certificate.stylistName },
    { label: t('registration.titleOption'), value: certificate.titleName },
    { label: t('registration.region'), value: resolveRegionDisplayName(certificate) },
    { label: t('common.language.label'), value: resolveLanguageDisplayName(certificate.certificateLocale) },
    { label: t('profile.historyTemplate'), value: resolveTemplateDisplayName(certificate) },
    { label: t('signing.issuedDatePreview'), value: certificate.issuedDateText },
  ]
})

/**
 * @description: 格式化历史时间
 * @param {string} value - ISO 时间字符串
 * @return {string} 本地展示时间
 */
function formatHistoryDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/**
 * @description: 清理详情头像 URL
 * @return {void} 无返回值
 */
function cleanupDetailAvatarSource(): void {
  cleanupDetailAvatar()
  cleanupDetailAvatar = () => {}
  detailAvatarImageSrc.value = ''
  detailAvatarName.value = ''
}

/**
 * @description: 解析详情头像
 * @return {Promise<void>} 无返回值
 */
async function resolveDetailAvatar(): Promise<void> {
  cleanupDetailAvatarSource()

  if (!selectedCertificate.value?.avatarId) {
    return
  }

  const source = await resolveAvatarDisplaySource(
    selectedCertificate.value.avatarId,
    selectedCertificate.value.certificateLocale
  )
  detailAvatarImageSrc.value = source.imageSrc
  detailAvatarName.value = source.name
  cleanupDetailAvatar = source.cleanup
}

/**
 * @description: 按证书 ID 打开登记详情
 * @param {string} certificateId - 已签发证书 ID
 * @return {Promise<void>} 无返回值
 */
async function openDetailByCertificateId(certificateId: string): Promise<void> {
  const certificate =
    certificates.value.find((item) => item.id === certificateId) ?? (await getIssuedCertificate(certificateId))

  if (!certificate) {
    return
  }

  selectedCertificateId.value = certificate.id
  isDetailDialogOpen.value = true
}

/**
 * @description: 消费登记详情打开意图
 * @description 优先使用 Pinia 一次性意图；旧版 issuedId query 会打开一次后移除。
 * @return {Promise<void>} 无返回值
 */
async function consumeDetailNavigationIntent(): Promise<void> {
  const intendedCertificateId = navigationIntent.consumeProfileIssuedDetail()

  if (intendedCertificateId) {
    await openDetailByCertificateId(intendedCertificateId)
    return
  }

  if (typeof route.query.issuedId !== 'string') {
    return
  }

  await openDetailByCertificateId(route.query.issuedId)

  const nextQuery = { ...route.query }
  delete nextQuery.issuedId
  await router.replace({ name: 'profile', query: nextQuery })
}

/**
 * @description: 读取证书历史
 * @return {Promise<void>} 无返回值
 */
async function loadCertificates(): Promise<void> {
  isLoading.value = true
  certificates.value = await listIssuedCertificates()
  await consumeDetailNavigationIntent()
  isLoading.value = false
}

/**
 * @description: 打开登记详情
 * @param {IssuedCertificate} certificate - 证书记录
 * @return {void} 无返回值
 */
function openDetailDialog(certificate: IssuedCertificate): void {
  selectedCertificateId.value = certificate.id
  isDetailDialogOpen.value = true
}

/**
 * @description: 点击表格行时打开详情弹窗
 * @param {Event} _event - Vuetify 行点击事件
 * @param {{ item: IssuedCertificate }} row - 当前表格行
 * @return {void} 无返回值
 */
function openDetailRow(_event: Event, row: { item: IssuedCertificate }): void {
  openDetailDialog(row.item)
}

/**
 * @description: 查看证书正本
 * @param {IssuedCertificate} certificate - 证书记录
 * @return {Promise<void>} 无返回值
 */
async function viewCertificate(certificate: IssuedCertificate): Promise<void> {
  await router.push({
    name: 'certificate',
    query: {
      issuedId: certificate.id,
    },
  })
}

/**
 * @description: 请求删除历史记录
 * @param {IssuedCertificate} certificate - 待删除证书
 * @return {void} 无返回值
 */
function requestDelete(certificate: IssuedCertificate): void {
  deletingCertificate.value = certificate
  isDeleteDialogOpen.value = true
}

/**
 * @description: 确认删除历史记录
 * @return {Promise<void>} 无返回值
 */
async function confirmDelete(): Promise<void> {
  if (!deletingCertificate.value) {
    return
  }

  isDeleting.value = true

  try {
    const certificateId = deletingCertificate.value.id
    await deleteIssuedCertificate(certificateId)
    certificates.value = certificates.value.filter((certificate) => certificate.id !== certificateId)

    if (selectedCertificateId.value === certificateId) {
      selectedCertificateId.value = ''
      isDetailDialogOpen.value = false
    }

    isDeleteDialogOpen.value = false
    deletingCertificate.value = null
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadCertificates()
})

watch(
  () => route.query.issuedId,
  async (issuedId) => {
    if (typeof issuedId !== 'string') {
      return
    }

    await openDetailByCertificateId(issuedId)
    const nextQuery = { ...route.query }
    delete nextQuery.issuedId
    await router.replace({ name: 'profile', query: nextQuery })
  }
)

watch(
  [() => selectedCertificate.value?.avatarId, () => selectedCertificate.value?.certificateLocale],
  () => {
    void resolveDetailAvatar()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  cleanupDetailAvatarSource()
})
</script>

<template>
  <section class="profile-issued-certificates">
    <div class="profile-issued-certificates__toolbar">
      <v-text-field
        v-model="searchText"
        :label="t('profile.historySearchLabel')"
        :placeholder="t('profile.historySearchPlaceholder')"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        color="primary"
        hide-details
      />
    </div>

    <v-data-table
      :headers="tableHeaders"
      :items="filteredCertificates"
      :loading="isLoading"
      :sort-by="defaultSortBy"
      item-value="id"
      density="comfortable"
      hover
      fixed-header
      hide-default-footer
      :items-per-page="-1"
      class="profile-issued-certificates__table"
      @click:row="openDetailRow"
    >
      <template #[`item.certificateNo`]="{ item }">
        <button
          type="button"
          class="profile-issued-certificates__link"
          data-sound="open"
          @click.stop="openDetailDialog(item)"
        >
          {{ item.certificateNo }}
        </button>
      </template>

      <template #[`item.issuedAt`]="{ item }">
        {{ formatHistoryDate(item.issuedAt) }}
      </template>

      <template #[`item.actions`]="{ item }">
        <v-menu location="bottom end" open-on-hover :close-on-content-click="false">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              icon="mdi-dots-vertical"
              variant="text"
              color="primary"
              size="small"
              :aria-label="t('profile.historyActions')"
              data-sound="open"
              @click.stop
            />
          </template>
          <v-list density="compact" min-width="148" class="profile-issued-certificates__menu">
            <v-list-item
              class="profile-issued-certificates__menu-item"
              data-sound="open"
              @click="viewCertificate(item)"
            >
              <template #prepend>
                <v-icon icon="mdi-certificate-outline" size="18" />
              </template>
              <v-list-item-title>{{ t('profile.viewCertificate') }}</v-list-item-title>
            </v-list-item>
            <v-list-item
              class="profile-issued-certificates__menu-item profile-issued-certificates__menu-item--danger"
              data-sound="danger"
              @click="requestDelete(item)"
            >
              <template #prepend>
                <v-icon icon="mdi-delete-outline" size="18" />
              </template>
              <v-list-item-title>{{ t('profile.historyDelete') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </template>

      <template #no-data>
        <div class="profile-issued-certificates__empty">
          <v-icon icon="mdi-certificate-outline" size="28" />
          <strong>{{ t('profile.historyEmptyTitle') }}</strong>
          <span>{{ t('profile.historyEmptyDescription') }}</span>
        </div>
      </template>
    </v-data-table>

    <PickerDialogFrame
      v-model="isDetailDialogOpen"
      :title="t('profile.historyDetailTitle')"
      :intro="selectedCertificate?.certificateNo ?? ''"
      max-width="720"
    >
      <template v-if="selectedCertificate">
        <div class="profile-issued-certificates__detail-avatar">
          <v-avatar color="primary" variant="tonal" size="76">
            <img v-if="detailAvatarImageSrc" :src="detailAvatarImageSrc" alt="" />
            <v-icon v-else icon="mdi-account-circle-outline" size="38" />
          </v-avatar>
          <div class="min-w-0">
            <strong>{{ detailAvatarName || t('assets.customAvatarFallbackName') }}</strong>
            <small>{{ t('registration.avatar') }}</small>
          </div>
        </div>

        <dl class="profile-issued-certificates__detail-list">
          <div v-for="row in detailRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </template>

      <template #actions>
        <v-btn
          variant="outlined"
          color="primary"
          data-sound="danger"
          @click="selectedCertificate && requestDelete(selectedCertificate)"
        >
          <v-icon icon="mdi-delete-outline" start />
          {{ t('profile.historyDelete') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          data-sound="primary"
          @click="selectedCertificate && viewCertificate(selectedCertificate)"
        >
          <v-icon icon="mdi-certificate-outline" start />
          {{ t('profile.viewCertificate') }}
        </v-btn>
      </template>
    </PickerDialogFrame>

    <v-dialog v-model="isDeleteDialogOpen" max-width="420">
      <v-card class="profile-issued-certificates__dialog">
        <v-card-title class="text-[18px] font-[820] text-[var(--color-foreground)]">
          {{ t('profile.historyDeleteTitle') }}
        </v-card-title>
        <v-card-text class="text-[14px] leading-relaxed text-[var(--color-muted-dark)]">
          {{ t('profile.historyDeleteMessage', { certificateNo: deletingCertificate?.certificateNo ?? '' }) }}
        </v-card-text>
        <v-card-actions class="justify-end gap-2 border-t border-[#ef5f8f]/15 px-6 py-4">
          <v-btn variant="text" data-sound="back" @click="isDeleteDialogOpen = false">
            {{ t('common.action.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="isDeleting"
            data-sound="danger"
            @click="confirmDelete"
          >
            {{ t('profile.historyDeleteConfirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.profile-issued-certificates {
  display: grid;
  gap: 14px;
}

.profile-issued-certificates__toolbar {
  display: flex;
  max-width: 420px;
}

.profile-issued-certificates__table {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
}

.profile-issued-certificates__dialog {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background: #fff9fc;
}

.profile-issued-certificates__link {
  padding: 0;
  border: 0;
  color: var(--color-primary-active);
  background: transparent;
  font: inherit;
  font-weight: 780;
  cursor: pointer;
}

.profile-issued-certificates__menu {
  border: 1px solid rgba(239, 95, 143, 0.16);
}

.profile-issued-certificates__menu :deep(.v-list-item) {
  min-height: 34px;
  padding-inline: 10px 12px;
}

.profile-issued-certificates__menu :deep(.v-list-item__prepend) {
  width: auto;
  margin-inline-end: 0;
}

.profile-issued-certificates__menu :deep(.v-list-item__spacer) {
  width: 6px;
}

.profile-issued-certificates__menu-item--danger {
  color: #d93670;
}

.profile-issued-certificates__menu-item--danger :deep(.v-icon) {
  color: #d93670;
}

.profile-issued-certificates__detail-avatar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid rgba(239, 95, 143, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
}

.profile-issued-certificates__detail-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-issued-certificates__detail-avatar strong,
.profile-issued-certificates__detail-avatar small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-issued-certificates__detail-avatar strong {
  color: var(--color-foreground);
  font-size: 17px;
  font-weight: 840;
}

.profile-issued-certificates__detail-avatar small {
  color: var(--color-muted-dark);
  font-size: 12px;
  font-weight: 680;
}

.profile-issued-certificates__detail-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.profile-issued-certificates__detail-list div {
  display: grid;
  gap: 3px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(239, 95, 143, 0.12);
}

.profile-issued-certificates__detail-list dt {
  color: var(--color-muted-dark);
  font-size: 12px;
  font-weight: 740;
}

.profile-issued-certificates__detail-list dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-foreground);
  font-size: 14px;
  font-weight: 720;
}

.profile-issued-certificates__empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  gap: 6px;
  color: var(--color-muted-dark);
  text-align: center;
}

.profile-issued-certificates__empty strong {
  color: var(--color-foreground);
}
</style>
