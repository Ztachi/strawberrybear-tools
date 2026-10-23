<script setup lang="ts">
/** 恢复前以同一种摘要显示本地和云端快照，避免只凭文件名确认覆盖。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SnapshotSummary } from '@/lib/dataManagement'
const props = defineProps<{ summary: SnapshotSummary }>()
const { t, locale } = useI18n()
const createdAt = computed(() => new Date(props.summary.createdAt).toLocaleString(locale.value))
const counts = computed(() => Object.entries(props.summary.counts))
</script>
<template>
  <div class="space-y-3 text-sm leading-6">
    <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
      <dt class="text-[var(--color-muted-dark)]">
        {{ t('dataManagement.snapshot.createdAt') }}
      </dt>
      <dd class="m-0">
        {{ createdAt }}
      </dd>
      <dt class="text-[var(--color-muted-dark)]">
        {{ t('dataManagement.snapshot.device') }}
      </dt>
      <dd class="m-0 break-words">
        {{ summary.deviceName }}
      </dd>
      <dt class="text-[var(--color-muted-dark)]">
        {{ t('dataManagement.snapshot.version') }}
      </dt>
      <dd class="m-0">v{{ summary.appVersion }}</dd>
    </dl>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted-dark)]">
      <span v-for="[key, value] in counts" :key="key"
        >{{ t(`dataManagement.snapshot.counts.${key}`) }} {{ value }}</span
      >
    </div>
  </div>
</template>
