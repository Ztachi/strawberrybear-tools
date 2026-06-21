<script setup lang="ts">
/**
 * @description: WorkflowEmptyState - 办理流程空状态
 * @description 没有当前办理或没有证书时，统一提供重新登记和登记历史入口。
 */
defineProps<{
  /** 空状态标题 */
  title: string
  /** 空状态说明 */
  description: string
}>()

const emit = defineEmits<{
  /** 重新登记 */
  restart: []
  /** 查看登记历史 */
  history: []
}>()
</script>

<template>
  <v-card class="workflow-empty-state" variant="flat">
    <v-card-text class="workflow-empty-state__body">
      <v-avatar color="primary" variant="tonal" size="54">
        <v-icon icon="mdi-file-search-outline" size="30" />
      </v-avatar>

      <div class="workflow-empty-state__copy">
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>

      <div class="workflow-empty-state__actions">
        <v-btn color="primary" variant="flat" data-sound="primary" @click="emit('restart')">
          <v-icon icon="mdi-file-plus-outline" start />
          {{ $t('workflow.restartRegistration') }}
        </v-btn>
        <v-btn color="primary" variant="outlined" data-sound="nav" @click="emit('history')">
          <v-icon icon="mdi-history" start />
          {{ $t('workflow.registrationHistory') }}
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.workflow-empty-state {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.22);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(255, 241, 247, 0.84)),
    linear-gradient(90deg, rgba(85, 188, 169, 0.1), transparent 44%, rgba(155, 123, 255, 0.1));
  box-shadow: var(--shadow-card);
}

.workflow-empty-state__body {
  display: grid;
  justify-items: center;
  gap: 18px;
  padding: clamp(26px, 5vw, 48px);
  text-align: center;
}

.workflow-empty-state__copy {
  display: grid;
  max-width: 560px;
  gap: 8px;
}

.workflow-empty-state__copy h2 {
  margin: 0;
  color: var(--color-primary-active);
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 860;
}

.workflow-empty-state__copy p {
  margin: 0;
  color: var(--color-muted-dark);
  font-size: 14px;
  line-height: 1.8;
}

.workflow-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

@media (max-width: 560px) {
  .workflow-empty-state__actions,
  .workflow-empty-state__actions .v-btn {
    width: 100%;
  }
}
</style>
