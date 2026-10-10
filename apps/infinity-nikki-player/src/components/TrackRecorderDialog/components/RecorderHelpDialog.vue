<script setup lang="ts">
/** 录制工作区帮助复用公共目录文档，说明键盘录入流程并保持路由不变。 */
import { computed } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Modal } from 'antdv-next'
import { Eye, Keyboard, Layers3, Save } from 'lucide-vue-next'
import SectionDocument from '@/components/SectionDocument.vue'

interface RecorderHelpDialogProps {
  /** 帮助弹框是否显示，由录制工作区控制。 */
  open: boolean
}

defineProps<RecorderHelpDialogProps>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

/** 关闭帮助时消费当前事件，避免同一次 Escape 又触发背景录制快捷键。 */
function closeHelp(event: MouseEvent | KeyboardEvent): void {
  event.stopPropagation()
  if (event instanceof KeyboardEvent) event.preventDefault()
  emit('update:open', false)
}

interface HelpSection {
  key: string
  icon: Component
  items: readonly string[]
}

const sections: readonly HelpSection[] = [
  { key: 'start', icon: Keyboard, items: ['template', 'record', 'perform', 'timing', 'pause'] },
  { key: 'modes', icon: Layers3, items: ['append', 'overdub', 'replace', 'undo'] },
  { key: 'preview', icon: Eye, items: ['locate', 'listen', 'layout', 'refine'] },
  { key: 'drafts', icon: Save, items: ['apply', 'recover', 'close'] },
]
const shortcuts = ['record', 'undo', 'redo', 'stop', 'mapped'] as const
const anchorItems = computed(() => [
  ...sections.map((section) => ({
    key: section.key,
    href: `#recorder-help-${section.key}`,
    title: t(`recording.helpDocument.sections.${section.key}.title`),
  })),
  {
    key: 'shortcuts',
    href: '#recorder-help-shortcuts',
    title: t('recording.helpDocument.shortcutTitle'),
  },
])
</script>

<template>
  <Modal
    :open="open"
    :title="t('recording.help')"
    :width="860"
    centered
    :styles="{ body: { height: 'min(72vh, 640px)', overflow: 'hidden' } }"
    @cancel="closeHelp"
  >
    <SectionDocument :items="anchorItems" :contents-label="t('recording.helpDocument.contents')">
      <p class="mb-3 mt-0 text-[var(--color-muted-dark)]">
        {{ t('recording.helpIntro') }}
      </p>
      <section
        v-for="section in sections"
        :id="`recorder-help-${section.key}`"
        :key="section.key"
        class="mb-3 scroll-mt-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
        :aria-labelledby="`recorder-help-${section.key}-title`"
      >
        <h3
          :id="`recorder-help-${section.key}-title`"
          class="m-0 flex items-center gap-2 text-sm font-semibold"
        >
          <component :is="section.icon" class="size-4 shrink-0 text-primary" :stroke-width="2.2" />
          {{ t(`recording.helpDocument.sections.${section.key}.title`) }}
        </h3>
        <dl class="mb-0 mt-3 space-y-2.5">
          <div v-for="item in section.items" :key="item">
            <dt
              :class="[
                'font-medium',
                section.key === 'start' && item === 'record' ? 'text-[var(--color-danger)]' : '',
              ]"
            >
              {{ t(`recording.helpDocument.sections.${section.key}.items.${item}.label`) }}
            </dt>
            <dd class="m-0 text-[var(--color-muted-dark)]">
              {{ t(`recording.helpDocument.sections.${section.key}.items.${item}.description`) }}
            </dd>
          </div>
        </dl>
      </section>

      <section
        id="recorder-help-shortcuts"
        class="mt-5 scroll-mt-2"
        aria-labelledby="recorder-help-shortcuts-title"
      >
        <h3
          id="recorder-help-shortcuts-title"
          class="m-0 flex items-center gap-2 text-sm font-semibold"
        >
          <Keyboard class="size-4 shrink-0 text-primary" :stroke-width="2.2" />
          {{ t('recording.helpDocument.shortcutTitle') }}
        </h3>
        <p class="mt-2 text-[var(--color-muted-dark)]">
          {{ t('recording.helpDocument.shortcutTip') }}
        </p>
        <dl class="mt-3 space-y-2">
          <div
            v-for="shortcut in shortcuts"
            :key="shortcut"
            class="grid grid-cols-[minmax(120px,auto)_1fr] items-start gap-3 border-b border-primary/10 pb-2 max-[560px]:grid-cols-1 max-[560px]:gap-1"
          >
            <dt>
              <kbd
                class="inline-flex min-h-6 items-center rounded-md border border-primary/20 bg-white/70 px-2 py-0.5 font-mono text-xs text-[var(--color-foreground)]"
              >
                {{ t(`recording.helpDocument.shortcutItems.${shortcut}.keys`) }}
              </kbd>
            </dt>
            <dd class="m-0 text-[var(--color-muted-dark)]">
              {{ t(`recording.helpDocument.shortcutItems.${shortcut}.description`) }}
            </dd>
          </div>
        </dl>
      </section>
    </SectionDocument>

    <template #footer>
      <Button type="primary" @click="closeHelp">
        {{ t('recording.helpDocument.done') }}
      </Button>
    </template>
  </Modal>
</template>
