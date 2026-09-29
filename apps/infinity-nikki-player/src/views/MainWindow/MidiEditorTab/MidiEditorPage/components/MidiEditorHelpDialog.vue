<script setup lang="ts">
/** MIDI 编辑器完整帮助文档；只负责说明内容与弹框开关。 */
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Modal } from 'antdv-next'
import {
  CirclePlay,
  FileOutput,
  Keyboard,
  Layers3,
  MousePointer2,
  Settings2,
} from 'lucide-vue-next'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

interface HelpSection {
  key: string
  icon: Component
  items: readonly string[]
}

const sections: readonly HelpSection[] = [
  { key: 'start', icon: MousePointer2, items: ['layout', 'overview', 'template'] },
  { key: 'notes', icon: Keyboard, items: ['select', 'draw', 'inspector', 'contextMenu'] },
  { key: 'tracks', icon: Layers3, items: ['trackView', 'trackManage', 'trackEnabled'] },
  { key: 'playback', icon: CirclePlay, items: ['transport', 'seek', 'loop', 'preview'] },
  { key: 'settings', icon: Settings2, items: ['snap', 'song', 'display', 'view'] },
  { key: 'files', icon: FileOutput, items: ['save', 'export', 'leave'] },
]

const shortcuts = [
  'save',
  'undo',
  'redo',
  'selectAll',
  'clipboard',
  'duplicate',
  'delete',
  'horizontal',
  'vertical',
  'playback',
  'clearSelection',
  'tools',
  'snapOverride',
] as const
</script>

<template>
  <Modal
    :open="open"
    :title="t('midiEditor.help.title')"
    :width="760"
    centered
    :styles="{ body: { maxHeight: '72vh', overflowY: 'auto' } }"
    @cancel="emit('update:open', false)"
  >
    <div data-text-selectable class="space-y-5 text-sm leading-6 text-[var(--color-foreground)]">
      <p class="m-0 text-[var(--color-muted-dark)]">
        {{ t('midiEditor.help.intro') }}
      </p>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section
          v-for="section in sections"
          :key="section.key"
          class="rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
          :aria-labelledby="`midi-editor-help-${section.key}`"
        >
          <h3
            :id="`midi-editor-help-${section.key}`"
            class="m-0 flex items-center gap-2 text-sm font-semibold"
          >
            <component
              :is="section.icon"
              class="size-4 shrink-0 text-primary"
              :stroke-width="2.2"
            />
            {{ t(`midiEditor.help.sections.${section.key}.title`) }}
          </h3>
          <dl class="mt-3 space-y-2.5">
            <div v-for="item in section.items" :key="item">
              <dt class="font-medium">
                {{ t(`midiEditor.help.sections.${section.key}.items.${item}.label`) }}
              </dt>
              <dd class="m-0 text-[var(--color-muted-dark)]">
                {{ t(`midiEditor.help.sections.${section.key}.items.${item}.description`) }}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section aria-labelledby="midi-editor-help-shortcuts">
        <h3
          id="midi-editor-help-shortcuts"
          class="m-0 flex items-center gap-2 text-sm font-semibold"
        >
          <Keyboard class="size-4 shrink-0 text-primary" :stroke-width="2.2" />
          {{ t('midiEditor.help.shortcutTitle') }}
        </h3>
        <dl class="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
          <div
            v-for="shortcut in shortcuts"
            :key="shortcut"
            class="grid grid-cols-[minmax(128px,auto)_1fr] items-start gap-3 border-b border-primary/10 pb-2"
          >
            <dt>
              <kbd
                class="inline-flex min-h-6 items-center rounded-md border border-primary/20 bg-white/70 px-2 py-0.5 font-mono text-xs text-[var(--color-foreground)] shadow-sm"
              >
                {{ t(`midiEditor.help.shortcutItems.${shortcut}.keys`) }}
              </kbd>
            </dt>
            <dd class="m-0 text-[var(--color-muted-dark)]">
              {{ t(`midiEditor.help.shortcutItems.${shortcut}.description`) }}
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <template #footer>
      <Button type="primary" @click="emit('update:open', false)">
        {{ t('midiEditor.help.done') }}
      </Button>
    </template>
  </Modal>
</template>
