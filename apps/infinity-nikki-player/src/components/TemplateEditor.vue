<script setup lang="ts">
import { ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import type { KeyTemplate } from '@/types'

const playerStore = usePlayerStore()

const editingTemplate = ref<KeyTemplate | null>(null)
const isCreating = ref(false)

/** 新建模板 */
function createTemplate() {
  isCreating.value = true
  editingTemplate.value = {
    id: `custom-${Date.now()}`,
    name: '新模板',
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
  playerStore.currentTemplate = template
  await playerStore.saveTemplate(template)
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
  await playerStore.saveTemplate(editingTemplate.value)
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
  if (confirm('确定要删除这个模板吗？')) {
    await playerStore.deleteTemplate(templateId)
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
        v-for="template in playerStore.templates"
        :key="template.id"
        :class="[
          'template-item',
          {
            active: playerStore.currentTemplate?.id === template.id,
            builtin: template.is_builtin,
          },
        ]"
      >
        <div class="template-info" @click="selectTemplate(template)">
          <span class="template-name">{{ template.name }}</span>
          <span v-if="template.is_builtin" class="builtin-badge">内置</span>
        </div>
        <div class="template-actions">
          <button v-if="!template.is_builtin" class="btn-edit" @click="editTemplate(template)">
            编辑
          </button>
          <button
            v-if="!template.is_builtin"
            class="btn-delete"
            @click="deleteTemplate(template.id)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 新建按钮 -->
    <button class="btn-create" @click="createTemplate">+ 新建模板</button>

    <!-- 编辑弹窗 -->
    <div v-if="editingTemplate" class="edit-modal">
      <div class="modal-content">
        <h3>{{ isCreating ? '新建模板' : '编辑模板' }}</h3>

        <div class="form-group">
          <label>模板名称</label>
          <input v-model="editingTemplate.name" type="text" class="input" />
        </div>

        <div class="mappings">
          <div class="mapping-header">
            <span>音高</span>
            <span />
            <span>按键</span>
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
            <input
              :value="mapping.key"
              type="text"
              maxlength="1"
              class="input-key"
              @input="updateMapping(index, 'key', ($event.target as HTMLInputElement).value)"
            />
            <button class="btn-remove" @click="removeMapping(index)">✕</button>
          </div>
        </div>

        <button class="btn-add-mapping" @click="addMapping">+ 添加映射</button>

        <div class="modal-actions">
          <button class="btn-cancel" @click="cancelEdit">取消</button>
          <button class="btn-save" @click="saveTemplate">保存</button>
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
  @apply p-4 bg-gray-800 rounded flex items-center justify-between;
}

.template-item.active {
  @apply bg-pink-400/20 border border-pink-400;
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

.builtin-badge {
  @apply px-2 py-0.5 text-xs bg-gray-700 rounded;
}

.template-actions {
  @apply flex gap-2;
}

.btn-edit,
.btn-delete {
  @apply px-3 py-1 text-sm rounded transition-colors;
}

.btn-edit {
  @apply bg-gray-700 hover:bg-gray-600;
}

.btn-delete {
  @apply bg-red-600 hover:bg-red-500;
}

.btn-create {
  @apply w-full py-3 border-2 border-dashed border-gray-700 rounded
         hover:border-pink-400 hover:text-pink-400 transition-colors;
}

/* 编辑弹窗 */
.edit-modal {
  @apply fixed inset-0 bg-black/50 flex items-center justify-center z-50;
}

.modal-content {
  @apply bg-gray-800 rounded-lg p-6 w-full max-w-md space-y-4;
}

.modal-content h3 {
  @apply text-lg font-semibold;
}

.form-group {
  @apply space-y-2;
}

.form-group label {
  @apply text-sm text-gray-400;
}

.input {
  @apply w-full px-3 py-2 bg-gray-700 rounded border border-gray-600
         focus:border-pink-400 focus:outline-none;
}

.mappings {
  @apply space-y-2 max-h-60 overflow-auto;
}

.mapping-header {
  @apply grid grid-cols-[auto_1fr_auto_auto] gap-2 text-xs text-gray-500 px-2;
}

.mapping-row {
  @apply grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center;
}

.pitch-name {
  @apply w-12 text-sm font-mono;
}

.pitch-slider {
  @apply accent-pink-400;
}

.input-key {
  @apply w-12 px-2 py-1 bg-gray-700 rounded text-center
         focus:outline-none focus:ring-1 focus:ring-pink-400;
}

.btn-remove {
  @apply w-6 h-6 flex items-center justify-center text-red-400
         hover:text-red-300;
}

.btn-add-mapping {
  @apply w-full py-2 border border-dashed border-gray-600 rounded
         text-gray-400 hover:border-pink-400 hover:text-pink-400;
}

.modal-actions {
  @apply flex justify-end gap-4 pt-4;
}

.btn-cancel,
.btn-save {
  @apply px-6 py-2 rounded transition-colors;
}

.btn-cancel {
  @apply bg-gray-700 hover:bg-gray-600;
}

.btn-save {
  @apply bg-pink-400 hover:bg-pink-500;
}
</style>
