<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 20:19:29
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 21:26:50
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/components/LexiconManager.vue
 * @Description: 
-->
<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:22:40
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:22:42
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/components/LexiconManager.vue
 * @Description:
-->
<script setup lang="ts">
/**
 * @description: LexiconManager - 词汇管理入口与弹层 CRUD
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useLexiconStore } from '../stores/lexicon'
import type { LexiconSource } from '../types'

const { t } = useI18n()
const lexicon = useLexiconStore()

const {
  lexicons,
  wordCount,
  isLoaded,
  syncingId,
  syncProgress,
} = storeToRefs(lexicon)

const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const snackbar = ref({ show: false, message: '', color: 'success' as 'success' | 'error' | 'warning' })

const showFormDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formUrl = ref('')
const formError = ref('')

const showDeleteDialog = ref(false)
const pendingDelete = ref<LexiconSource | null>(null)

const showClearDialog = ref(false)

const headers = computed(() => [
  { title: '', key: 'status', sortable: false, width: 48 },
  { title: t('lexicon.table.name'), key: 'name', sortable: false },
  { title: t('lexicon.table.url'), key: 'url', sortable: false },
  { title: t('lexicon.table.lastUpdated'), key: 'lastUpdated', sortable: false, width: 132 },
  { title: t('lexicon.table.actions'), key: 'actions', sortable: false, width: 132 },
])

const canSubmitForm = computed(() => Boolean(formName.value.trim()) && Boolean(formUrl.value.trim()))

function showMessage(message: string, color: 'success' | 'error' | 'warning') {
  snackbar.value = { show: true, message, color }
}

function formatDate(iso: string | null): string {
  if (!iso) return t('lexicon.neverUpdated')
  return new Date(iso).toLocaleString()
}

function formatDateParts(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null
  const date = new Date(iso)
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return {
    date: `${y}/${m}/${d}`,
    time: `${hh}:${mm}:${ss}`,
  }
}

function isDefaultRow(row: LexiconSource): boolean {
  return row.id === lexicon.DEFAULT_LEXICON_ID
}

function isImportedRow(row: LexiconSource): boolean {
  return row.id === lexicon.IMPORTED_LEXICON_ID
}

function openAddDialog() {
  editingId.value = null
  formName.value = ''
  formUrl.value = ''
  formError.value = ''
  showFormDialog.value = true
}

function openEditDialog(row: LexiconSource) {
  editingId.value = row.id
  formName.value = row.name
  formUrl.value = row.url
  formError.value = ''
  showFormDialog.value = true
}

async function onSubmitForm() {
  formError.value = ''
  try {
    if (editingId.value) {
      await lexicon.updateLexicon(editingId.value, formName.value, formUrl.value)
      showMessage(t('lexicon.updateSuccess'), 'success')
    } else {
      await lexicon.addLexicon(formName.value, formUrl.value)
      showMessage(t('lexicon.addSuccess'), 'success')
    }
    showFormDialog.value = false
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  }
}

async function onSyncRow(row: LexiconSource) {
  if (syncingId.value !== null) {
    showMessage(t('lexicon.syncInProgress'), 'warning')
    return
  }
  try {
    await lexicon.syncLexicon(row.id)
    showMessage(t('lexicon.syncSuccess', { count: lexicon.wordCount }), 'success')
  } catch (err) {
    showMessage(t('lexicon.syncFailed', { error: String(err) }), 'error')
  }
}

async function onToggleRow(row: LexiconSource) {
  try {
    await lexicon.toggleLexiconEnabled(row.id)
  } catch (err) {
    showMessage(String(err), 'error')
  }
}

function askDelete(row: LexiconSource) {
  pendingDelete.value = row
  showDeleteDialog.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  try {
    await lexicon.removeLexicon(pendingDelete.value.id)
    showMessage(t('lexicon.deleteSuccess'), 'success')
  } catch (err) {
    showMessage(t('lexicon.deleteFailed', { error: String(err) }), 'error')
  } finally {
    showDeleteDialog.value = false
    pendingDelete.value = null
  }
}

async function onClearAll() {
  try {
    await lexicon.clearAllLexicons()
    showMessage(t('lexicon.clearSuccess'), 'success')
  } catch (err) {
    showMessage(String(err), 'error')
  } finally {
    showClearDialog.value = false
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const count = await lexicon.importLocalLexicon(file)
    showMessage(t('lexicon.importSuccess', { count }), 'success')
  } catch (err) {
    showMessage(t('lexicon.importFailed', { error: String(err) }), 'error')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <v-card variant="outlined" rounded="xl" class="border-primary-20">
    <v-card-text class="pa-4">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <p class="text-sm font-semibold">
            {{ t('lexicon.title') }}
          </p>
          <v-tooltip location="top" content-class="danger-tooltip">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                icon="mdi-delete-sweep-outline"
                size="x-small"
                variant="text"
                color="error"
                class="clear-btn"
                @click="showClearDialog = true"
              />
            </template>
            <span>{{ t('lexicon.clearAll') }}</span>
          </v-tooltip>
        </div>

        <p class="text-xs text-medium-emphasis">
          {{ isLoaded ? t('lexicon.wordCount', { count: wordCount.toLocaleString() }) : t('lexicon.wordCountEmpty') }}
        </p>

        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          size="small"
          prepend-icon="mdi-book-cog-outline"
          class="primary-action-btn"
          @click="open = true"
        >
          {{ t('lexicon.manage') }}
        </v-btn>
      </div>
    </v-card-text>
  </v-card>

  <v-dialog v-model="open" max-width="1080">
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center justify-space-between py-4 px-6">
        <span class="text-h6">{{ t('lexicon.manage') }}</span>
        <div class="d-flex ga-2">
          <v-btn
            color="primary"
            size="small"
            variant="outlined"
            prepend-icon="mdi-file-import-outline"
            class="secondary-action-btn"
            @click="triggerFileInput"
          >
            {{ t('lexicon.import') }}
          </v-btn>
          <v-btn
            color="primary"
            size="small"
            variant="flat"
            prepend-icon="mdi-plus"
            class="primary-action-btn"
            @click="openAddDialog"
          >
            {{ t('lexicon.add') }}
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <div class="table-scroll-wrap">
          <v-data-table
            class="lexicon-table"
            :headers="headers"
            :items="lexicons"
            density="comfortable"
            :items-per-page="-1"
            fixed-header
            height="420"
            hide-default-footer
          >
            <template #[`item.status`]="{ item }">
              <span
                class="status-dot"
                :class="item.syncStatus === 'success' ? 'status-ok' : 'status-fail'"
                :title="item.syncStatus === 'success' ? t('lexicon.status.success') : t('lexicon.status.failed')"
              />
            </template>

            <template #[`item.name`]="{ item }">
              <span class="text-body-2 text-no-wrap">{{ item.name }}</span>
            </template>

            <template #[`item.url`]="{ item }">
              <span
                class="text-body-2 text-medium-emphasis text-no-wrap"
                >{{ item.url || '-' }}</span
              >
            </template>

            <template #[`item.lastUpdated`]="{ item }">
              <div class="last-updated-cell text-body-2 text-medium-emphasis">
                <template v-if="formatDateParts(item.lastUpdated)">
                  <span class="date-line">{{ formatDateParts(item.lastUpdated)?.date }}</span>
                  <span class="time-line">{{ formatDateParts(item.lastUpdated)?.time }}</span>
                </template>
                <template v-else>
                  {{ formatDate(item.lastUpdated) }}
                </template>
              </div>
            </template>

            <template #[`item.actions`]="{ item }">
              <div class="d-flex align-center justify-center ga-1">
                <v-switch
                  v-if="!isDefaultRow(item)"
                  :model-value="item.enabled"
                  color="success"
                  base-color="error"
                  hide-details
                  density="compact"
                  inset
                  class="action-switch"
                  @update:model-value="onToggleRow(item)"
                />

                <v-menu location="bottom end" :close-on-content-click="true">
                  <template #activator="{ props }">
                    <v-btn v-bind="props" icon="mdi-dots-vertical" size="small" variant="text" />
                  </template>

                  <v-list density="compact" min-width="180">
                    <v-list-item
                      v-if="isDefaultRow(item)"
                      prepend-icon="mdi-refresh"
                      :title="t('common.button.sync')"
                      :disabled="syncingId !== null && syncingId !== item.id"
                      @click="onSyncRow(item)"
                    />

                    <template v-else>
                      <v-list-item
                        v-if="!isImportedRow(item)"
                        prepend-icon="mdi-refresh"
                        :title="t('common.button.sync')"
                        :disabled="syncingId !== null && syncingId !== item.id"
                        @click="onSyncRow(item)"
                      />

                      <v-list-item
                        v-if="!isImportedRow(item)"
                        prepend-icon="mdi-pencil-outline"
                        :title="t('lexicon.action.edit')"
                        @click="openEditDialog(item)"
                      />

                      <v-list-item
                        prepend-icon="mdi-delete-outline"
                        :title="t('lexicon.action.delete')"
                        @click="askDelete(item)"
                      />
                    </template>
                  </v-list>
                </v-menu>
              </div>
            </template>
          </v-data-table>
        </div>

        <div v-if="syncingId && syncProgress.total > 0" class="mt-4">
          <v-progress-linear
            :model-value="(syncProgress.current / syncProgress.total) * 100"
            color="primary"
            rounded
            height="6"
          />
          <p class="text-xs text-medium-emphasis mt-2">
            {{ t('lexicon.syncProgress', { current: syncProgress.current, total: syncProgress.total }) }}
          </p>
        </div>

        <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onFileChange" />
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-6 py-4">
        <v-spacer />
        <v-btn variant="text" @click="open = false">
          {{ t('common.button.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showFormDialog" max-width="560">
    <v-card rounded="xl">
      <v-card-title class="py-4 px-6">
        {{ editingId ? t('lexicon.edit') : t('lexicon.add') }}
      </v-card-title>
      <v-card-text class="px-6 pb-2">
        <v-text-field
          v-model="formName"
          :label="t('lexicon.form.name')"
          variant="outlined"
          rounded="lg"
          hide-details="auto"
          class="mb-3"
        />
        <v-text-field
          v-model="formUrl"
          :label="t('lexicon.form.url')"
          variant="outlined"
          rounded="lg"
          hide-details="auto"
          class="mb-2"
        />
        <v-alert
          v-if="formError"
          type="error"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mt-3"
        >
          {{ formError }}
        </v-alert>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="showFormDialog = false">
          {{ t('common.button.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="primary-action-btn"
          :disabled="!canSubmitForm"
          @click="onSubmitForm"
        >
          {{ t('common.button.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showClearDialog" max-width="460">
    <v-card rounded="xl">
      <v-card-title class="py-4 px-6">
        {{ t('lexicon.clearAll') }}
      </v-card-title>
      <v-card-text class="px-6">
        {{ t('lexicon.clearConfirm') }}
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="showClearDialog = false">
          {{ t('common.button.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" @click="onClearAll">
          {{ t('common.button.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showDeleteDialog" max-width="460">
    <v-card rounded="xl">
      <v-card-title class="py-4 px-6">
        {{ t('lexicon.deleteTitle') }}
      </v-card-title>
      <v-card-text class="px-6">
        {{ t('lexicon.deleteConfirm', { name: pendingDelete?.name ?? '' }) }}
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="showDeleteDialog = false">
          {{ t('common.button.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" @click="confirmDelete">
          {{ t('common.button.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar
    v-model="snackbar.show"
    :color="snackbar.color"
    :timeout="3200"
    location="bottom right"
    rounded="lg"
  >
    {{ snackbar.message }}
  </v-snackbar>
</template>

<style scoped>
.table-scroll-wrap {
  overflow-x: auto;
}

.lexicon-table :deep(table) {
  width: max-content;
  min-width: 960px;
}

.lexicon-table :deep(thead th),
.lexicon-table :deep(tbody td) {
  white-space: nowrap;
  background: rgb(var(--v-theme-surface));
}

.lexicon-table :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 8;
}

.lexicon-table :deep(thead th:last-child),
.lexicon-table :deep(tbody td:last-child) {
  position: sticky;
  right: 0;
  z-index: 9;
  min-width: 132px;
}

.lexicon-table :deep(thead th:nth-last-child(2)),
.lexicon-table :deep(tbody td:nth-last-child(2)) {
  position: sticky;
  right: 132px;
  z-index: 9;
  min-width: 132px;
  max-width: 132px;
  box-shadow: -10px 0 12px -10px rgba(15, 23, 42, 0.22);
}

.action-switch {
  margin: 0;
}

.last-updated-cell {
  white-space: normal;
  line-height: 1.25;
}

.last-updated-cell .date-line,
.last-updated-cell .time-line {
  display: block;
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.status-ok {
  background: #22c55e;
}

.status-fail {
  background: #ef4444;
}

.primary-action-btn {
  color: #ffffff !important;
}

.primary-action-btn :deep(.v-btn__content),
.primary-action-btn :deep(.v-btn__prepend),
.primary-action-btn :deep(.v-btn__append),
.primary-action-btn :deep(.v-icon) {
  color: #ffffff !important;
}

.secondary-action-btn {
  color: rgb(var(--v-theme-primary)) !important;
  border-color: rgba(var(--v-theme-primary), 0.45) !important;
}

.secondary-action-btn :deep(.v-btn__content),
.secondary-action-btn :deep(.v-btn__prepend),
.secondary-action-btn :deep(.v-btn__append),
.secondary-action-btn :deep(.v-icon) {
  color: rgb(var(--v-theme-primary)) !important;
}

.clear-btn {
  width: 20px !important;
  height: 20px !important;
}

.clear-btn :deep(.v-icon) {
  font-size: 14px;
}
</style>
