<script setup lang="ts">
/** 首次关闭询问由宿主驱动；默认选托盘，取消不会变更设置。 */
import { ref, watch } from 'vue'
import { Modal, RadioGroup, Radio, Checkbox, Button } from 'antdv-next'
import { useI18n } from 'vue-i18n'
import type { CloseAction, CloseChoice } from '@/features/app-close/controller'
const props = defineProps<{ open: boolean; initialAction: CloseAction }>()
const emit = defineEmits<{ choose: [choice: CloseChoice | null] }>()
const { t } = useI18n()
const action = ref<CloseAction>('tray')
const remember = ref(true)
watch(
  () => props.open,
  (open) => {
    if (open) {
      action.value = props.initialAction
      remember.value = true
    }
  }
)
</script>
<template>
  <Modal
    :open="open"
    :title="t('appSettings.closeTitle')"
    :footer="null"
    centered
    width="min(420px, calc(100vw - 32px))"
    :mask="{ closable: false }"
    @cancel="emit('choose', null)"
  >
    <p class="mb-4 text-muted-foreground">
      {{ t('appSettings.closeHint') }}
    </p>
    <RadioGroup v-model:value="action" class="flex flex-col gap-3">
      <Radio value="tray">
        {{ t('appSettings.tray') }}
      </Radio>
      <Radio value="quit">
        {{ t('appSettings.quit') }}
      </Radio>
    </RadioGroup>
    <Checkbox v-model:checked="remember" class="mt-5">
      {{ t('appSettings.remember') }}
    </Checkbox>
    <div class="mt-5 flex justify-end gap-2">
      <Button :aria-label="t('actions.cancel')" @click="emit('choose', null)">
        {{ t('actions.cancel') }}
      </Button>
      <Button
        type="primary"
        :aria-label="t('appSettings.confirmClose')"
        @click="emit('choose', { action, remember })"
      >
        {{ t('appSettings.confirmClose') }}
      </Button>
    </div>
  </Modal>
</template>
