<script setup lang="ts">
/**
 * @description: AssetLibraryEmptyState - 自定义素材库空状态
 * @description 在上传能力接入前，提供明确的页面说明和应用内返回入口。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type AssetLibraryKind = 'avatar' | 'background'

const props = defineProps<{
  /** 当前素材库类型，用于切换空状态标题和图标。 */
  kind: AssetLibraryKind
}>()

const emit = defineEmits<{
  /** 返回登记或校样等当前办理阶段。 */
  backDraft: []
  /** 回到应用首页。 */
  backHome: []
}>()

const { t } = useI18n()

/** 空状态主标题跟随素材类型。 */
const emptyTitle = computed(() =>
  props.kind === 'avatar' ? t('assets.emptyAvatarTitle') : t('assets.emptyBackgroundTitle')
)

/** 空状态图标跟随素材类型。 */
const emptyIcon = computed(() =>
  props.kind === 'avatar' ? 'mdi-account-heart-outline' : 'mdi-image-outline'
)
</script>

<template>
  <v-card variant="flat" class="asset-empty-card">
    <v-card-text class="asset-empty-card__body">
      <div class="asset-empty-card__mark">
        <v-icon :icon="emptyIcon" size="42" />
      </div>

      <div class="asset-empty-card__content">
        <h2>{{ emptyTitle }}</h2>
        <p>{{ t('assets.emptyDescription') }}</p>
      </div>

      <div class="asset-empty-card__actions">
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-arrow-left"
          data-sound="back"
          @click="emit('backDraft')"
        >
          {{ t('assets.backToDraft') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-home-heart"
          data-sound="nav"
          @click="emit('backHome')"
        >
          {{ t('assets.backToHome') }}
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.asset-empty-card {
  overflow: hidden;
  border: 1px solid rgba(239, 95, 143, 0.22);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(255, 234, 242, 0.84)),
    repeating-linear-gradient(
      45deg,
      rgba(155, 123, 255, 0.08) 0,
      rgba(155, 123, 255, 0.08) 2px,
      transparent 2px,
      transparent 18px
    );
  box-shadow: var(--shadow-card);
}

.asset-empty-card__body {
  display: grid;
  min-height: 260px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
}

.asset-empty-card__mark {
  display: inline-flex;
  width: 86px;
  height: 86px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(239, 95, 143, 0.2);
  border-radius: 24px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-lavender));
  box-shadow: var(--shadow-primary);
}

.asset-empty-card__content {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.asset-empty-card__content h2 {
  margin: 0;
  color: var(--color-primary-active);
  font-size: 22px;
  font-weight: 760;
  letter-spacing: 0;
}

.asset-empty-card__content p {
  max-width: 620px;
  margin: 0;
  color: var(--color-muted-dark);
  line-height: 1.7;
}

.asset-empty-card__actions {
  display: flex;
  flex-wrap: wrap;
  grid-column: 2 / 3;
  gap: 10px;
}

@media (max-width: 620px) {
  .asset-empty-card__body {
    grid-template-columns: 1fr;
  }

  .asset-empty-card__actions {
    grid-column: auto;
  }
}
</style>
