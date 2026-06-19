<script setup lang="ts">
/**
 * @description: HomeDraftResumeDialog - 首页草稿继续提示
 * @description 首页 CTA 遇到未完成草稿时先征询用户，避免直接跳转到后续步骤。
 */
defineProps<{
  continueLabel: string
  description: string
  modelValue: boolean
  restartLabel: string
  title: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  continue: []
  restart: []
}>()
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="460"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <v-card class="resume-dialog overflow-hidden rounded-[26px] border border-[#c48a2c]/25">
      <v-card-text class="px-7 pb-5 pt-7 max-[520px]:px-5">
        <p class="mb-2 mt-0 text-[12px] font-[780] text-[var(--color-gold)]">
          MIRACLE CONTINENT ARCHIVE
        </p>
        <h2 class="m-0 text-[25px] font-[850] leading-tight text-[var(--color-primary-active)]">
          {{ title }}
        </h2>
        <p class="mb-0 mt-3 text-[15px] leading-[1.8] text-[var(--color-muted-dark)]">
          {{ description }}
        </p>
      </v-card-text>

      <v-card-actions class="gap-3 px-7 pb-7 pt-0 max-[520px]:grid max-[520px]:px-5">
        <v-btn
          class="rounded-full border border-[#ef5f8f]/25 px-5 text-[var(--color-primary-active)]"
          variant="tonal"
          data-sound="open"
          @click="emit('restart')"
        >
          {{ restartLabel }}
        </v-btn>
        <v-btn
          class="rounded-full px-6 shadow-[0_14px_28px_rgba(239,95,143,0.24)]"
          color="primary"
          variant="flat"
          data-sound="primary"
          @click="emit('continue')"
        >
          {{ continueLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.resume-dialog {
  background:
    radial-gradient(circle at 88% 12%, rgba(155, 123, 255, 0.2), transparent 28%),
    linear-gradient(140deg, rgba(255, 255, 255, 0.98), rgba(255, 238, 246, 0.95));
  box-shadow: 0 26px 70px rgba(201, 85, 126, 0.18);
}
</style>
