<script setup lang="ts">
/**
 * @description: PickerDialogFrame - 资料选择弹窗壳
 * @description 统一登记页、校样页等选择弹窗尺寸和关闭区域，避免各页面重复维护弹层结构。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 弹窗开关 */
    modelValue: boolean
    /** 弹窗标题 */
    title: string
    /** 弹窗说明 */
    intro?: string
    /** 最大宽度 */
    maxWidth?: number | string
  }>(),
  {
    intro: '',
    maxWidth: 620,
  }
)

const emit = defineEmits<{
  /** 同步弹窗开关 */
  'update:modelValue': [value: boolean]
}>()

/** v-dialog 双向绑定代理。 */
const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
</script>

<template>
  <v-dialog v-model="isOpen" :max-width="maxWidth" scrollable>
    <v-card class="picker-dialog-frame">
      <div class="picker-dialog-frame__header">
        <div class="picker-dialog-frame__copy">
          <h2>{{ title }}</h2>
          <p v-if="intro">
            {{ intro }}
          </p>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          data-sound="back"
          @click="isOpen = false"
        />
      </div>

      <v-card-text class="picker-dialog-frame__body">
        <slot />
      </v-card-text>

      <v-card-actions v-if="$slots.actions" class="picker-dialog-frame__actions">
        <slot name="actions" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.picker-dialog-frame {
  display: flex;
  max-height: min(620px, 72dvh);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.25);
  border-radius: 26px;
  background: #fff9fc;
}

.picker-dialog-frame__header {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 12px;
}

.picker-dialog-frame__copy {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.picker-dialog-frame__copy h2 {
  margin: 0;
  color: var(--color-foreground);
  font-size: 20px;
  font-weight: 820;
  line-height: 1.2;
}

.picker-dialog-frame__copy p {
  margin: 0;
  color: var(--color-muted-dark);
  font-size: 13px;
  line-height: 1.7;
}

.picker-dialog-frame__body {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 24px 24px;
}

.picker-dialog-frame__actions {
  flex-shrink: 0;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px calc(16px + var(--safe-bottom));
  border-top: 1px solid rgba(239, 95, 143, 0.15);
  background: rgba(255, 249, 252, 0.96);
}

@media (max-width: 560px) {
  .picker-dialog-frame__header,
  .picker-dialog-frame__body,
  .picker-dialog-frame__actions {
    padding-right: 18px;
    padding-left: 18px;
  }
}
</style>
