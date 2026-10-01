<script setup lang="ts">
/**
 * @description: 通用选择弹窗：删除确认、替换速度确认、草稿三选、离开守卫共用
 */
import { Button, Modal } from 'antdv-next'

/** 一个可选项；`primary` 为主按钮，`danger` 用于删除/丢弃类动作。 */
export interface EditorChoiceOption {
  key: string
  label: string
  primary?: boolean
  danger?: boolean
}

defineProps<{
  open: boolean
  title: string
  description: string
  options: readonly EditorChoiceOption[]
}>()
const emit = defineEmits<{
  /** 用户点击某个选项或关闭（关闭时 key 为 `cancel`）。 */
  choose: [key: string]
}>()
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :footer="null"
    width="420"
    centered
    @cancel="emit('choose', 'cancel')"
  >
    <div class="text-sm leading-6 text-muted-foreground">
      {{ description }}
    </div>
    <div class="mt-4 flex flex-wrap justify-end gap-2">
      <Button
        v-for="option in options"
        :key="option.key"
        size="small"
        :type="option.primary ? 'primary' : undefined"
        :color="option.primary ? undefined : 'primary'"
        :variant="option.primary ? undefined : 'outlined'"
        :danger="option.danger"
        @click="emit('choose', option.key)"
      >
        {{ option.label }}
      </Button>
    </div>
  </Modal>
</template>
