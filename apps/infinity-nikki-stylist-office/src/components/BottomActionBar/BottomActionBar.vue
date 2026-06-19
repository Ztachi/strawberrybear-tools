<script setup lang="ts">
/**
 * @description: BottomActionBar - 移动端底部主操作栏
 * @description 固定底部操作区统一处理安全区，桌面端由页面决定是否展示。
 */

/**
 * @description: 底部操作栏属性
 * @param {string} primaryLabel - 主操作按钮文案
 * @param {string} [secondaryLabel] - 次操作按钮文案
 * @param {boolean} [primaryDisabled] - 主操作是否禁用
 */
defineProps<{
  primaryLabel: string
  secondaryLabel?: string
  primaryDisabled?: boolean
}>()

const emit = defineEmits<{
  primary: []
  secondary: []
}>()
</script>

<template>
  <div class="bottom-action-bar">
    <v-btn
      v-if="secondaryLabel"
      variant="outlined"
      color="primary"
      class="bottom-action-bar__button"
      data-sound="back"
      @click="emit('secondary')"
    >
      {{ secondaryLabel }}
    </v-btn>
    <v-btn
      color="primary"
      variant="flat"
      class="bottom-action-bar__button"
      :disabled="primaryDisabled"
      data-sound="primary"
      @click="emit('primary')"
    >
      {{ primaryLabel }}
    </v-btn>
  </div>
</template>

<style scoped>
.bottom-action-bar {
  position: sticky;
  bottom: 0;
  z-index: 8;
  display: flex;
  gap: 10px;
  padding: 12px 14px calc(12px + var(--safe-bottom));
  margin: 22px -14px calc(-32px - var(--safe-bottom));
  border-top: 1px solid var(--border-primary-20);
  background: rgba(255, 249, 252, 0.96);
  backdrop-filter: blur(18px);
}

.bottom-action-bar__button {
  min-width: 0;
  flex: 1 1 0;
}

@media (min-width: 760px) {
  .bottom-action-bar {
    display: none;
  }
}
</style>
