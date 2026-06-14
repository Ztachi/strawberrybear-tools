<script setup lang="ts">
/**
 * @description: 模板编辑路由页
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, Tag } from 'antdv-next'
import { ArrowLeft, Save, X } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import TemplateEditorForm from './TemplateEditorForm.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const editorFormRef = ref<InstanceType<typeof TemplateEditorForm> | null>(null)
const notFound = ref(false)

const pageTitle = computed(() => {
  if (route.name === 'templates-edit') return t('template.editTemplate')
  if (route.query.from) return t('template.createFromTemplate')
  return t('template.createTemplate')
})

async function openEditorFromRoute(): Promise<void> {
  await nextTick()
  const form = editorFormRef.value
  if (!form) return
  notFound.value = false

  if (route.name === 'templates-edit') {
    const templateId = String(route.params.id ?? '')
    const template = settingsStore.templates.find((item) => item.id === templateId)
    if (!template) {
      notFound.value = true
      return
    }
    await form.editTemplate(template)
    return
  }

  const sourceTemplateId = typeof route.query.from === 'string' ? route.query.from : ''
  if (sourceTemplateId) {
    const sourceTemplate = settingsStore.templates.find((item) => item.id === sourceTemplateId)
    if (!sourceTemplate) {
      notFound.value = true
      return
    }
    await form.createFromTemplate(sourceTemplate)
    return
  }

  await form.createBlankTemplate()
}

async function navigateBack(context: 'close' | 'jump' = 'close'): Promise<void> {
  const canLeave = await editorFormRef.value?.confirmLeaveIfNeeded(context)
  if (canLeave === false) return
  await router.push({ name: 'templates' })
}

async function saveAndStay(): Promise<void> {
  const saved = await editorFormRef.value?.saveEditingTemplate()
  if (!saved) return
  const editingTemplateId = editorFormRef.value?.getEditingTemplateId()
  if (route.name !== 'templates-edit' && editingTemplateId) {
    await router.replace({ name: 'templates-edit', params: { id: editingTemplateId } })
  }
}

async function saveAndExit(): Promise<void> {
  const saved = await editorFormRef.value?.saveEditingTemplate()
  if (!saved) return
  editorFormRef.value?.closeEditorWithoutPrompt()
  await router.push({ name: 'templates' })
}

function hasEditorChanges(): boolean {
  return editorFormRef.value?.hasEditorChanges() ?? false
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!editorFormRef.value?.hasPendingChanges()) return
  editorFormRef.value.writePendingDraft()
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  void openEditorFromRoute()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(async () => {
  return (await editorFormRef.value?.confirmLeaveIfNeeded('jump')) ?? true
})

defineExpose({
  confirmLeaveIfNeeded(context: 'close' | 'jump' = 'close'): Promise<boolean> {
    return editorFormRef.value?.confirmLeaveIfNeeded(context) ?? Promise.resolve(true)
  },
  hasPendingChanges(): boolean {
    return editorFormRef.value?.hasPendingChanges() ?? false
  },
  writePendingDraft(): void {
    editorFormRef.value?.writePendingDraft()
  },
})
</script>

<template>
  <section class="template-editor-page">
    <header class="template-editor-page-header">
      <Button type="text" class="header-icon-btn" @click="navigateBack('close')">
        <template #icon>
          <ArrowLeft class="header-icon" />
        </template>
      </Button>

      <div class="min-w-0 flex-1">
        <h1 class="template-editor-page-title">
          {{ pageTitle }}
        </h1>
        <p class="template-editor-page-subtitle">
          {{ t('template.description') }}
        </p>
      </div>

      <Tag v-if="hasEditorChanges()" color="pink">
        {{ t('template.unsaved') }}
      </Tag>

      <Button size="small" color="primary" variant="outlined" @click="navigateBack('close')">
        <template #icon>
          <X class="header-action-icon" />
        </template>
        {{ t('actions.cancel') }}
      </Button>
      <Button size="small" color="primary" variant="outlined" @click="saveAndStay">
        <template #icon>
          <Save class="header-action-icon" />
        </template>
        {{ t('template.save') }}
      </Button>
      <Button type="primary" size="small" @click="saveAndExit">
        <template #icon>
          <Save class="header-action-icon" />
        </template>
        {{ t('template.saveAndExit') }}
      </Button>
    </header>

    <section v-if="notFound" class="template-missing-state">
      <span>{{ t('template.notFound') }}</span>
      <Button @click="router.push({ name: 'templates' })">
        {{ t('template.templateList') }}
      </Button>
    </section>

    <TemplateEditorForm v-else ref="editorFormRef" class="template-editor-form" />
  </section>
</template>

<style scoped>
.template-editor-page {
  @apply flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-white/75;
}

.template-editor-page-header {
  @apply flex shrink-0 items-center gap-2 border-b border-primary/10 p-3;
}

.header-icon-btn {
  @apply h-9 w-9 rounded-lg;
}

.header-icon,
.header-action-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2.35;
}

.template-editor-page-title {
  @apply truncate text-lg font-semibold;
  color: var(--color-foreground);
}

.template-editor-page-subtitle {
  @apply truncate text-xs;
  color: var(--color-muted);
}

.template-editor-form {
  @apply min-h-0 flex-1;
}

.template-missing-state {
  @apply flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm;
  color: var(--color-muted-dark);
}
</style>
