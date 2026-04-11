<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { confirm } from '@tauri-apps/plugin-dialog'
import type { KeyTemplate } from '@/types'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { Badge } from '@/components/ui'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const editingTemplate = ref<KeyTemplate | null>(null)
const isCreating = ref(false)

/** 新建模板 */
function createTemplate() {
  isCreating.value = true
  editingTemplate.value = {
    id: `custom-${Date.now()}`,
    name: t('template.newTemplate'),
    is_builtin: false,
    mappings: [],
  }
}

/** 编辑模板 */
function editTemplate(template: KeyTemplate) {
  if (template.is_builtin) return
  editingTemplate.value = JSON.parse(JSON.stringify(template))
  isCreating.value = false
}

/** 选择当前模板 */
async function selectTemplate(template: KeyTemplate) {
  await settingsStore.selectTemplate(template.id)
}

/** 添加映射 */
function addMapping() {
  if (!editingTemplate.value) return
  editingTemplate.value.mappings.push({ pitch: 60, key: '' })
}

/** 删除映射 */
function removeMapping(index: number) {
  if (!editingTemplate.value) return
  editingTemplate.value.mappings.splice(index, 1)
}

/** 更新映射 */
function updateMapping(index: number, field: 'pitch' | 'key', value: string | number) {
  if (!editingTemplate.value) return
  editingTemplate.value.mappings[index][field] = value as never
}

/** 保存模板 */
async function saveTemplate() {
  if (!editingTemplate.value) return
  await settingsStore.saveTemplate(editingTemplate.value)
  editingTemplate.value = null
  isCreating.value = false
}

/** 取消编辑 */
function cancelEdit() {
  editingTemplate.value = null
  isCreating.value = false
}

/** 删除模板 */
async function deleteTemplate(templateId: string) {
  const confirmed = await confirm(t('template.confirmDelete'), { title: t('actions.delete'), kind: 'warning' })
  if (confirmed) {
    await settingsStore.deleteTemplate(templateId)
  }
}

/** 音高名称 */
function pitchName(pitch: number) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const note = notes[pitch % 12]
  return `${note}${octave}`
}
</script>

<template>
  <div class="template-editor">
    <!-- 模板列表 -->
    <div class="template-list">
      <div
        v-for="template in settingsStore.templates"
        :key="template.id"
        :class="[
          'template-item',
          { active: settingsStore.currentTemplateId === template.id },
          { builtin: template.is_builtin }
        ]"
      >
        <div class="template-info" @click="selectTemplate(template)">
          <span class="template-name">{{ template.name }}</span>
          <Badge v-if="template.is_builtin" variant="secondary">
            {{ t('template.builtin') }}
          </Badge>
        </div>
        <div class="template-actions">
          <Button
            v-if="!template.is_builtin"
            variant="ghost"
            size="sm"
            @click="editTemplate(template)"
          >
            {{ t('actions.edit') }}
          </Button>
          <Button
            v-if="!template.is_builtin"
            variant="ghost"
            size="sm"
            @click="deleteTemplate(template.id)"
          >
            {{ t('actions.delete') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 新建按钮 -->
    <Button variant="outline" class="w-full" @click="createTemplate">
      + {{ t('template.createTemplate') }}
    </Button>

    <!-- 编辑弹窗 -->
    <div v-if="editingTemplate" class="edit-modal">
      <div class="modal-content">
        <h3 class="text-lg font-semibold mb-4">
          {{ isCreating ? t('template.createTemplate') : t('template.editTemplate') }}
        </h3>

        <div class="form-group mb-4">
          <label class="text-sm text-muted-foreground mb-1 block">{{ t('template.name') }}</label>
          <Input v-model="editingTemplate.name" type="text" class="w-full" />
        </div>

        <div class="mappings mb-4">
          <div class="mapping-header">
            <span>{{ t('template.pitch') }}</span>
            <span />
            <span>{{ t('template.key') }}</span>
            <span />
          </div>
          <div
            v-for="(mapping, index) in editingTemplate.mappings"
            :key="index"
            class="mapping-row"
          >
            <span class="pitch-name">{{ pitchName(mapping.pitch) }}</span>
            <input
              :value="mapping.pitch"
              type="range"
              min="21"
              max="108"
              class="pitch-slider"
              @input="updateMapping(index, 'pitch', Number(($event.target as HTMLInputElement).value))"
            />
            <Input
              :value="mapping.key"
              type="text"
              maxlength="1"
              class="input-key"
              @input="updateMapping(index, 'key', ($event.target as HTMLInputElement).value)"
            />
            <Button variant="ghost" size="icon" @click="removeMapping(index)"> ✕ </Button>
          </div>
        </div>

        <Button variant="outline" class="w-full mb-4" @click="addMapping">
          + {{ t('template.addMapping') }}
        </Button>

        <div class="modal-actions">
          <Button variant="secondary" @click="cancelEdit">
            {{ t('actions.cancel') }}
          </Button>
          <Button @click="saveTemplate">
            {{ t('actions.save') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-editor {
  @apply space-y-4;
}

.template-list {
  @apply space-y-2;
}

.template-item {
  @apply p-4 bg-card border rounded-lg flex items-center justify-between;
}

.template-item.active {
  @apply bg-primary/20 border-primary;
}

.template-item.builtin {
  @apply opacity-75;
}

.template-info {
  @apply flex items-center gap-2 cursor-pointer;
}

.template-name {
  @apply font-medium;
}

.template-actions {
  @apply flex gap-2;
}

.edit-modal {
  @apply fixed inset-0 bg-black/50 flex items-center justify-center z-50;
}

.modal-content {
  @apply bg-card border rounded-lg p-6 w-full max-w-md space-y-4;
}

.form-group label {
  @apply text-sm text-muted-foreground;
}

.mappings {
  @apply space-y-2 max-h-60 overflow-auto;
}

.mapping-header {
  @apply grid grid-cols-[auto_1fr_auto_auto] gap-2 text-xs text-muted-foreground px-2;
}

.mapping-row {
  @apply grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center;
}

.pitch-name {
  @apply w-12 text-sm font-mono;
}

.pitch-slider {
  @apply accent-primary;
}

.input-key {
  @apply w-12 text-center;
}

.modal-actions {
  @apply flex justify-end gap-4 pt-4;
}
</style>
