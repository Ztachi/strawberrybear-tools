<script setup lang="ts">
/**
 * @description: HomeDraftDeleteConfirmDialog - 重新登记二次确认
 * @description 删除草稿是不可逆操作，因此从“重新登记”选择中拆出独立确认层。
 */
defineProps<{
  cancelLabel: string
  confirmLabel: string
  description: string
  modelValue: boolean
  title: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  cancel: []
  confirm: []
}>()

/**
 * @description: 取消删除草稿
 * @return {void} 无返回值
 */
function cancelDelete(): void {
  emit('cancel')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="460"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <v-card class="delete-dialog overflow-hidden rounded-[26px] border border-[#ef5f8f]/30">
      <v-card-text class="px-7 pb-5 pt-7 max-[520px]:px-5">
        <p class="mb-2 mt-0 text-[12px] font-[780] text-[var(--color-gold)]">
          ARCHIVE RESET CONFIRMATION
        </p>
        <h2 class="m-0 text-[25px] font-[850] leading-tight text-[var(--color-primary-active)]">
          {{ title }}
        </h2>
        <p class="mb-0 mt-3 text-[15px] leading-[1.8] text-[var(--color-muted-dark)]">
          {{ description }}
        </p>
      </v-card-text>

      <v-card-actions class="gap-3 px-7 pb-7 pt-0 max-[520px]:grid max-[520px]:px-5">
        <v-btn class="rounded-full px-5" variant="text" data-sound="cancel" @click="cancelDelete">
          {{ cancelLabel }}
        </v-btn>
        <v-btn
          class="rounded-full px-6 shadow-[0_14px_28px_rgba(239,95,143,0.24)]"
          color="primary"
          variant="flat"
          data-sound="primary"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.delete-dialog {
  background:
    radial-gradient(circle at 88% 12%, rgba(239, 95, 143, 0.18), transparent 30%),
    linear-gradient(140deg, rgba(255, 255, 255, 0.98), rgba(255, 238, 246, 0.95));
  box-shadow: 0 26px 70px rgba(201, 85, 126, 0.18);
}
</style>
