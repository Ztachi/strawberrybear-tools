<script setup lang="ts">
/** 主窗口与浮窗共用的详情跟曲按钮，状态由宿主提供。 */
import { Button, Tooltip } from 'antdv-next'
import { ArrowRightLeft } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
defineOptions({ inheritAttrs: false })
defineProps<{ active: boolean }>()
const emit = defineEmits<{ change: [enabled: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <Tooltip :title="t('midi.pianoRoll.autoSwitchHint')">
    <Button
      v-bind="$attrs"
      size="small"
      :type="active ? 'primary' : 'default'"
      :aria-pressed="active"
      @click="emit('change', !active)"
    >
      <template #icon>
        <ArrowRightLeft
          class="size-4"
          :stroke-width="2"
        />
      </template>
      {{ t('midi.pianoRoll.autoSwitch') }}
    </Button>
  </Tooltip>
</template>
