<script setup lang="ts">
/** 关于页的唯一更新入口；失败通过全局通知反馈，弹窗内仅保留恢复操作。 */
import { computed } from 'vue'
import { Button, Tooltip } from 'antdv-next'
import { Download, RefreshCw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import IconRotation from '@/components/IconRotation.vue'
import { useAppUpdater } from '@/composables/useAppUpdater'

const { t } = useI18n()
const updater = useAppUpdater()
const state = updater.state
withDefaults(defineProps<{ version: string; presentation?: 'version' | 'action' }>(), {
  presentation: 'version',
})
const buttonText = computed(() => {
  if (updater.isPreparing.value) return t('updater.preparing')
  if (state.value.phase === 'ready') return t('updater.installNow')
  if (updater.isChecking.value) return t('updater.checking')
  if (updater.isInstalling.value) return t('updater.installing')
  if (updater.isDownloading.value) return t('updater.downloading')
  return t(updater.hasUpdate.value ? 'updater.updateNow' : 'updater.checkNow')
})
async function update(): Promise<void> {
  if (updater.hasUpdate.value) await updater.downloadAndInstallUpdate()
  else await updater.checkUpdate()
}
</script>

<template>
  <Tooltip :title="buttonText">
    <!-- 外层保持可悬浮，禁用检查期间仍能查看状态说明。 -->
    <span class="version-update-trigger">
      <Button
        size="small"
        :shape="presentation === 'version' ? 'round' : undefined"
        :aria-label="presentation === 'action' ? buttonText : t('updater.checkNow')"
        :disabled="updater.isBusy.value"
        icon-placement="end"
        @click="update"
      >
        <span>{{ presentation === 'action' ? buttonText : `v${version}` }}</span>
        <template #icon>
          <IconRotation :size="14" :spinning="updater.isBusy.value">
            <component
              :is="updater.hasUpdate.value && !updater.isBusy.value ? Download : RefreshCw"
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
            />
          </IconRotation>
        </template>
      </Button>
    </span>
  </Tooltip>
</template>

<style scoped>
.version-update-trigger :deep(button) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
</style>
