<script setup lang="ts">
/**
 * @description: SigningResultPanel - 签发结果操作
 * @description 成功时进入领取页，失败时提供重试和返回校样入口。
 */

defineProps<{
  /** 当前结果状态 */
  status: 'complete' | 'failed'
  /** 正式证书编号 */
  certificateNo?: string
  /** 失败原因 */
  errorMessage?: string
}>()

const emit = defineEmits<{
  /** 领取证书 */
  receive: []
  /** 重试签发 */
  retry: []
  /** 返回校样 */
  back: []
}>()
</script>

<template>
  <v-card class="signing-result-panel" variant="flat">
    <v-card-text class="signing-result-panel__body">
      <v-alert
        :type="status === 'complete' ? 'success' : 'error'"
        variant="tonal"
        density="comfortable"
      >
        <template #title>
          {{ status === 'complete' ? $t('signing.completeTitle') : $t('signing.failedTitle') }}
        </template>
        <span v-if="status === 'complete'">
          {{ $t('signing.completeIntro', { certificateNo }) }}
        </span>
        <span v-else>
          {{ errorMessage || $t('signing.failedIntro') }}
        </span>
      </v-alert>

      <div class="signing-result-panel__actions">
        <template v-if="status === 'complete'">
          <v-btn
            color="primary"
            variant="flat"
            size="large"
            data-sound="primary"
            @click="emit('receive')"
          >
            <v-icon icon="mdi-gift-open-outline" start />
            {{ $t('signing.receiveCertificate') }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn variant="outlined" color="primary" data-sound="back" @click="emit('back')">
            {{ $t('signing.backProofing') }}
          </v-btn>
          <v-btn color="primary" variant="flat" data-sound="primary" @click="emit('retry')">
            <v-icon icon="mdi-reload" start />
            {{ $t('common.action.retry') }}
          </v-btn>
        </template>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.signing-result-panel {
  border: 1px solid rgba(239, 95, 143, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 16px 36px rgba(122, 78, 98, 0.14);
}

.signing-result-panel__body {
  display: grid;
  gap: 14px;
}

.signing-result-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  padding-bottom: 8px;
}

.signing-result-panel__actions :deep(.v-btn) {
  min-width: 180px;
}
</style>
