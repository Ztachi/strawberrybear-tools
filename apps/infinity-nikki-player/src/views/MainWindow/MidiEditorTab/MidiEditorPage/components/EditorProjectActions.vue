<script setup lang="ts">
/** MIDI 编辑器标题栏右侧操作：保留高频保存，其余操作收纳到悬浮菜单。 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Popover, Tooltip } from 'antdv-next'
import { CircleHelp, Download, Ellipsis, Save, X } from 'lucide-vue-next'
import { getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import MidiEditorHelpDialog from './MidiEditorHelpDialog.vue'

defineProps<{
  saving: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  save: []
  export: []
  close: []
  'save-and-close': []
}>()

const { t } = useI18n()
const open = ref(false)
const helpOpen = ref(false)

function handleOpenChange(value: boolean): void {
  if (helpOpen.value) return
  open.value = value
}

function run(action: 'export' | 'close' | 'save-and-close'): void {
  open.value = false
  if (action === 'export') emit('export')
  else if (action === 'close') emit('close')
  else emit('save-and-close')
}

function showHelp(): void {
  open.value = false
  helpOpen.value = true
}
</script>

<template>
  <div class="editor-project-actions">
    <Tooltip
      :title="t('actions.save')"
      :trigger="['hover', 'focus']"
      :get-popup-container="getMainWindowPopupContainer"
    >
      <Button
        type="primary"
        shape="circle"
        size="small"
        class="editor-save-trigger"
        :aria-label="t('actions.save')"
        :loading="saving"
        :disabled="disabled"
        @click="emit('save')"
      >
        <template #icon>
          <Save class="header-action-icon" />
        </template>
      </Button>
    </Tooltip>

    <Popover
      :open="helpOpen ? false : open"
      :trigger="['hover', 'click']"
      placement="bottomRight"
      :mouse-enter-delay="0.12"
      :mouse-leave-delay="0.14"
      :get-popup-container="getMainWindowPopupContainer"
      @open-change="handleOpenChange"
    >
      <template #content>
        <div class="editor-more-menu" role="menu">
          <Button
            type="text"
            size="small"
            class="editor-more-menu-item"
            role="menuitem"
            :disabled="disabled || saving"
            @click="run('export')"
          >
            <template #icon>
              <Download class="editor-menu-icon" />
            </template>
            {{ t('midiEditor.exportMidi') }}
          </Button>
          <Button
            type="text"
            size="small"
            class="editor-more-menu-item"
            role="menuitem"
            @click="showHelp"
          >
            <template #icon>
              <CircleHelp class="editor-menu-icon" />
            </template>
            {{ t('midiEditor.help.menuLabel') }}
          </Button>
          <span class="editor-more-divider" role="separator" />
          <Button
            type="text"
            size="small"
            class="editor-more-menu-item"
            role="menuitem"
            :disabled="disabled || saving"
            @click="run('save-and-close')"
          >
            <template #icon>
              <Save class="editor-menu-icon" />
            </template>
            {{ t('midiEditor.saveAndClose') }}
          </Button>
          <Button
            type="text"
            danger
            size="small"
            class="editor-more-menu-item"
            role="menuitem"
            :disabled="saving"
            @click="run('close')"
          >
            <template #icon>
              <X class="editor-menu-icon" />
            </template>
            {{ t('midiEditor.closeEditor') }}
          </Button>
        </div>
      </template>

      <Button
        size="small"
        color="primary"
        variant="text"
        class="editor-more-trigger"
        :aria-label="t('midiEditor.moreActions')"
        :aria-expanded="open"
      >
        <template #icon>
          <Ellipsis class="header-action-icon" />
        </template>
      </Button>
    </Popover>

    <MidiEditorHelpDialog v-model:open="helpOpen" />
  </div>
</template>

<style scoped>
.editor-project-actions {
  @apply flex shrink-0 items-center gap-1;
  -webkit-app-region: no-drag;
}

.header-action-icon,
.editor-menu-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.2;
}

.editor-save-trigger,
.editor-more-trigger {
  width: 28px;
  min-width: 28px;
  padding: 0;
}

.editor-more-menu {
  @apply flex w-max flex-col gap-0.5;
}

.editor-more-menu :deep(.editor-more-menu-item) {
  @apply justify-start whitespace-nowrap px-2.5 text-left;
}

.editor-more-divider {
  @apply my-1 h-px w-full bg-primary/10;
}
</style>
