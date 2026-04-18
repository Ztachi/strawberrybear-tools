<script setup lang="ts">
/**
 * @description: 模板编辑器组件
 * @description 提供键盘模板的查看、创建、编辑、删除等功能
 */
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

/** 当前编辑的模板（null 表示未编辑） */
const editingTemplate = ref<KeyTemplate | null>(null)
/** 是否为新建模式 */
const isCreating = ref(false)

/**
 * @description: 获取模板显示名称
 * @description 内置模板使用国际化，自定义模板使用原始名称
 * @param {string} name - 模板原始名称
 * @param {string} id - 模板 ID
 * @return {string} 显示名称
 */
function getTemplateDisplayName(name: string, id: string): string {
  const builtinNames = t(`template.builtinNames.${id}` as any)
  return builtinNames && builtinNames !== `template.builtinNames.${id}` ? builtinNames : name
}

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

/**
 * @description: 编辑模板
 * @param {KeyTemplate} template - 要编辑的模板
 * 内置模板不允许编辑
 */
function editTemplate(template: KeyTemplate) {
  if (template.is_builtin) return
  editingTemplate.value = JSON.parse(JSON.stringify(template))
  isCreating.value = false
}

/**
 * @description: 选择当前模板
 * @param {KeyTemplate} template - 要选择的模板
 */
async function selectTemplate(template: KeyTemplate) {
  await settingsStore.selectTemplate(template.id)
}

/** 添加新映射 */
function addMapping() {
  if (!editingTemplate.value) return
  editingTemplate.value.mappings.push({ pitch: 60, key: '' })
}

/**
 * @description: 删除映射
 * @param {number} index - 要删除的映射索引
 */
function removeMapping(index: number) {
  if (!editingTemplate.value) return
  editingTemplate.value.mappings.splice(index, 1)
}

/**
 * @description: 更新映射字段
 * @param {number} index - 映射索引
 * @param {'pitch' | 'key'} field - 要更新的字段
 * @param {string | number} value - 新值
 */
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

/**
 * @description: 删除模板
 * @param {string} templateId - 要删除的模板 ID
 */
async function deleteTemplate(templateId: string) {
  const confirmed = await confirm(t('template.confirmDelete'), { title: t('actions.delete'), kind: 'warning' })
  if (confirmed) {
    await settingsStore.deleteTemplate(templateId)
  }
}

/**
 * @description: 将音符号转换为音名
 * @param {number} pitch - MIDI 音符号 (0-127)
 * @return {string} 音名（如 "C4"、"F#5"）
 */
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
        <!-- 模板信息区域 -->
        <div class="template-info" @click="selectTemplate(template)">
          <span
            class="template-name"
            >{{ getTemplateDisplayName(template.name, template.id) }}</span
          >
          <!-- 内置模板徽章 -->
          <Badge v-if="template.is_builtin" variant="secondary">
            {{ t('template.builtin') }}
          </Badge>
        </div>

        <!-- 操作按钮区域 -->
        <div class="template-actions">
          <!-- 编辑按钮（非内置模板） -->
          <Button
            v-if="!template.is_builtin"
            variant="ghost"
            size="sm"
            @click="editTemplate(template)"
          >
            {{ t('actions.edit') }}
          </Button>
          <!-- 删除按钮（非内置模板） -->
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
        <!-- 弹窗标题 -->
        <h3 class="text-lg font-semibold mb-4">
          {{ isCreating ? t('template.createTemplate') : t('template.editTemplate') }}
        </h3>

        <!-- 模板名称输入 -->
        <div class="form-group mb-4">
          <label class="text-sm text-muted-foreground mb-1 block">{{ t('template.name') }}</label>
          <Input v-model="editingTemplate.name" type="text" class="w-full" />
        </div>

        <!-- 映射列表 -->
        <div class="mappings mb-4">
          <!-- 表头 -->
          <div class="mapping-header">
            <span>{{ t('template.pitch') }}</span>
            <span />
            <span>{{ t('template.key') }}</span>
            <span />
          </div>

          <!-- 映射行 -->
          <div
            v-for="(mapping, index) in editingTemplate.mappings"
            :key="index"
            class="mapping-row"
          >
            <!-- 音名显示 -->
            <span class="pitch-name">{{ pitchName(mapping.pitch) }}</span>
            <!-- 音高滑块 -->
            <input
              :value="mapping.pitch"
              type="range"
              min="21"
              max="108"
              class="pitch-slider"
              @input="updateMapping(index, 'pitch', Number(($event.target as HTMLInputElement).value))"
            />
            <!-- 按键输入 -->
            <Input
              :value="mapping.key"
              type="text"
              maxlength="1"
              class="input-key"
              @input="updateMapping(index, 'key', ($event.target as HTMLInputElement).value)"
            />
            <!-- 删除按钮 -->
            <Button variant="ghost" size="icon" @click="removeMapping(index)"> ✕ </Button>
          </div>
        </div>

        <!-- 添加映射按钮 -->
        <Button variant="outline" class="w-full mb-4" @click="addMapping">
          + {{ t('template.addMapping') }}
        </Button>

        <!-- 弹窗操作按钮 -->
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
