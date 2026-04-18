<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:23:18
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:23:18
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/components/TextInputPanel.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: TextInputPanel - 文本输入面板，支持文本输入、文件上传和扫描触发
 */
import { ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLexiconStore } from '../stores/lexicon'
import { useSettingsStore } from '../stores/settings'
import type { ScanResult, MatchPosition, ScanWorkerInput, ScanWorkerOutput } from '../types'
import ScannerWorker from '../workers/scanner.worker?worker'

const emit = defineEmits<{
  result: [ScanResult]
}>()

const { t } = useI18n()
const lexicon = useLexiconStore()
const settings = useSettingsStore()

const inputText = ref('')
const isScanning = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const error = ref<string | null>(null)

function buildSummary(matches: MatchPosition[]) {
  return {
    high: matches.filter((m) => m.category === 'high').length,
    medium: matches.filter((m) => m.category === 'medium').length,
    low: matches.filter((m) => m.category === 'low').length,
  }
}

async function onScan() {
  if (!inputText.value.trim()) return

  if (!lexicon.isLoaded) {
    error.value = t('lexicon.wordCountEmpty')
    return
  }

  isScanning.value = true
  error.value = null

  const worker = new ScannerWorker()

  const input: ScanWorkerInput = {
    text: inputText.value,
    words: toRaw(lexicon.words).map((w) => toRaw(w)),
    settings: settings.getSettings(),
  }

  worker.postMessage(input)

  worker.onmessage = (event: MessageEvent<ScanWorkerOutput>) => {
    worker.terminate()
    isScanning.value = false

    if (event.data.type === 'error') {
      error.value = event.data.message
      return
    }

    const matches = event.data.matches
    const result: ScanResult = {
      originalText: inputText.value,
      matches,
      summary: buildSummary(matches),
    }
    emit('result', result)
  }

  worker.onerror = (err) => {
    worker.terminate()
    isScanning.value = false
    error.value = err.message
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  inputText.value = await file.text()
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <v-card variant="outlined" rounded="xl" class="border-primary-20">
    <v-card-text class="pa-4">
      <p class="text-sm font-semibold mb-3">
        {{ t('page.home.inputLabel') }}
      </p>

      <v-textarea
        v-model="inputText"
        :placeholder="t('page.home.inputPlaceholder')"
        variant="outlined"
        rounded="lg"
        rows="10"
        auto-grow
        max-rows="20"
        hide-details
        color="primary"
        class="mb-3"
      />

      <!-- 错误提示 -->
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="compact"
        rounded="lg"
        closable
        class="mb-3"
        @click:close="error = null"
      >
        {{ error }}
      </v-alert>

      <!-- 操作区域 -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- 扫描按钮 -->
        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          prepend-icon="mdi-magnify-scan"
          class="primary-action-btn"
          :loading="isScanning"
          :disabled="isScanning || !inputText.trim()"
          @click="onScan"
        >
          {{ isScanning ? t('common.button.scanning') : t('common.button.scan') }}
        </v-btn>

        <!-- 上传文件 -->
        <v-btn
          color="primary"
          variant="outlined"
          rounded="lg"
          size="default"
          prepend-icon="mdi-file-upload-outline"
          class="secondary-action-btn"
          :disabled="isScanning"
          @click="triggerFileInput"
        >
          {{ t('common.button.import') }}
        </v-btn>

        <!-- 字符数统计 -->
        <span v-if="inputText" class="text-xs text-medium-emphasis ml-auto">
          {{ inputText.length.toLocaleString() }} 字符
        </span>
      </div>

      <!-- 隐藏的文件输入框 -->
      <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onFileChange" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
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
</style>
