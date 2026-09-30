<script setup lang="ts">
/** MIDI 编辑器完整帮助文档；只负责说明内容与弹框开关。 */
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Anchor, Button, Modal } from 'antdv-next'
import type { AnchorProps } from 'antdv-next'
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

const content = ref<HTMLElement | null>(null)
const essentialActions = ['edit', 'sort', 'notes'] as const
const anchorItems = computed<NonNullable<AnchorProps['items']>>(() => [
  {
    key: 'overview',
    href: '#midi-editor-help-overview',
    title: t('midiEditor.help.overviewTitle'),
  },
  ...sections.map((section) => ({
    key: section.key,
    href: `#midi-editor-help-${section.key}`,
    title: t(`midiEditor.help.sections.${section.key}.title`),
  })),
  {
    key: 'shortcuts',
    href: '#midi-editor-help-shortcuts',
    title: t('midiEditor.help.shortcutTitle'),
  },
])

function getContentContainer(): HTMLElement {
  return content.value ?? document.documentElement
}

function preventHistoryChange(event: MouseEvent): void {
  event.preventDefault()
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('midiEditor.help.title')"
    :width="860"
    centered
    :styles="{ body: { height: 'min(72vh, 640px)', overflow: 'hidden' } }"
    @cancel="emit('update:open', false)"
  >
    <div
      data-text-selectable
      class="grid h-full min-h-0 grid-cols-[168px_minmax(0,1fr)] text-sm leading-6 text-[var(--color-foreground)]"
    >
      <aside class="min-h-0 overflow-y-auto border-r border-primary/15 pr-4">
        <h3 class="mb-3 mt-0 text-xs font-semibold text-[var(--color-muted-dark)]">
          {{ t('midiEditor.help.contents') }}
        </h3>
        <nav :aria-label="t('midiEditor.help.contents')">
          <Anchor
            :affix="false"
            :get-container="getContentContainer"
            :items="anchorItems"
            :target-offset="8"
            @click="preventHistoryChange"
          />
        </nav>
      </aside>

      <div ref="content" class="midi-editor-help-content min-h-0 overflow-y-auto pl-5 pr-1">
        <section
          id="midi-editor-help-overview"
          class="scroll-mt-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
          aria-labelledby="midi-editor-help-overview-title"
        >
          <h3 id="midi-editor-help-overview-title" class="m-0 text-sm font-semibold">
            {{ t('midiEditor.help.overviewTitle') }}
          </h3>
          <p class="mb-0 mt-2 text-[var(--color-muted-dark)]">
            {{ t('midiEditor.help.intro') }}
          </p>
          <dl class="mb-0 mt-3 space-y-2">
            <div v-for="action in essentialActions" :key="action">
              <dt
                :class="['font-semibold', action === 'edit' ? 'text-[var(--color-danger)]' : 'text-[var(--color-primary-active)]']"
              >
                {{ t(`midiEditor.help.essentials.${action}.label`) }}
              </dt>
              <dd class="m-0 text-[var(--color-muted-dark)]">
                {{ t(`midiEditor.help.essentials.${action}.description`) }}
              </dd>
            </div>
          </dl>
        </section>

        <section
          v-for="section in sections"
          :id="`midi-editor-help-${section.key}`"
          :key="section.key"
          class="mt-3 scroll-mt-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
          :aria-labelledby="`midi-editor-help-${section.key}-title`"
        >
          <h3
            :id="`midi-editor-help-${section.key}-title`"
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
              <dt
                :class="['font-medium', section.key === 'start' && item === 'overview' ? 'text-[var(--color-danger)]' : '']"
              >
                {{ t(`midiEditor.help.sections.${section.key}.items.${item}.label`) }}
              </dt>
              <dd class="m-0 text-[var(--color-muted-dark)]">
                {{ t(`midiEditor.help.sections.${section.key}.items.${item}.description`) }}
              </dd>
            </div>
          </dl>
        </section>

        <section
          id="midi-editor-help-shortcuts"
          class="mt-5 scroll-mt-2"
          aria-labelledby="midi-editor-help-shortcuts-title"
        >
          <h3
            id="midi-editor-help-shortcuts-title"
            class="m-0 flex items-center gap-2 text-sm font-semibold"
          >
            <Keyboard class="size-4 shrink-0 text-primary" :stroke-width="2.2" />
            {{ t('midiEditor.help.shortcutTitle') }}
          </h3>
          <p class="mt-2 text-[var(--color-muted-dark)]">
            {{ t('midiEditor.help.shortcutTip') }}
          </p>
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
    </div>

    <template #footer>
      <Button type="primary" @click="emit('update:open', false)">
        {{ t('midiEditor.help.done') }}
      </Button>
    </template>
  </Modal>
</template>
