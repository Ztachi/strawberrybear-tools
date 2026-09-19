<script setup lang="ts">
/** @description: 钢琴卷帘的就近操作帮助，仅维护弹窗开关，不参与播放或卷帘状态。 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Modal, Tooltip } from 'antdv-next'
import { QuestionCircleFilled } from '@antdv-next/icons'

const { t } = useI18n()
const open = ref(false)
const groups = [
  { key: 'tracks', items: ['selection', 'enabled', 'filter'] },
  { key: 'view', items: ['zoom', 'scroll', 'follow'] },
  { key: 'position', items: ['seek', 'resize', 'readOnly'] },
] as const
</script>

<template>
  <Tooltip :title="t('midi.pianoRoll.help.title')">
    <Button
      color="primary"
      variant="link"
      :aria-label="t('midi.pianoRoll.help.title')"
      @click="open = true"
    >
      <template #icon>
        <QuestionCircleFilled :style="{ fontSize: '20px' }" />
      </template>
    </Button>
  </Tooltip>
  <Modal
    v-model:open="open"
    :title="t('midi.pianoRoll.help.title')"
    :width="680"
    centered
    :styles="{ body: { maxHeight: '65vh', overflowY: 'auto' } }"
  >
    <div class="space-y-4 text-sm leading-6 text-[var(--color-foreground)]">
      <section
        v-for="group in groups"
        :key="group.key"
        :aria-labelledby="`piano-roll-help-${group.key}`"
      >
        <h3
          :id="`piano-roll-help-${group.key}`"
          class="font-semibold"
        >
          {{ t(`midi.pianoRoll.help.groups.${group.key}`) }}
        </h3>
        <dl class="mt-2 space-y-2">
          <div
            v-for="item in group.items"
            :key="item"
          >
            <dt class="mr-2 inline font-medium">
              {{ t(`midi.pianoRoll.help.items.${item}.label`) }}
            </dt>
            <dd class="inline">
              {{ t(`midi.pianoRoll.help.items.${item}.description`) }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
    <template #footer>
      <Button
        type="primary"
        @click="open = false"
      >
        {{ t('midi.pianoRoll.help.done') }}
      </Button>
    </template>
  </Modal>
</template>
