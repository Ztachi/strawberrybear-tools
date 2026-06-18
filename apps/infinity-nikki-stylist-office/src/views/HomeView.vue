<script setup lang="ts">
/**
 * @description: HomeView - 仪式化首页
 * @description 展示机构氛围、办理说明和进入登记/个人中心的主入口。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import BottomActionBar from '@/components/BottomActionBar.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'
import certificateBg from '@/assets/images/bg.png'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { getActiveDraft, replaceActiveDraft } from '@/db/repositories/draftRepository'
import { createDefaultDraft } from '@/domain/draft/factory'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const router = useRouter()
const draftSession = useDraftSessionStore()
const uiStore = useUiStore()

/**
 * @description: 进入登记流程
 * @description 已有草稿时继续原阶段；没有草稿时才创建唯一办理档案。
 * @return {Promise<void>} 无返回值
 */
async function startRegistration(): Promise<void> {
  const activeDraft = await getActiveDraft()

  if (activeDraft) {
    draftSession.setLastKnownStage(activeDraft.stage)
    await router.push({ name: activeDraft.stage })
    return
  }

  const draft = createDefaultDraft(uiStore.uiLocale)
  await replaceActiveDraft(draft)
  draftSession.setLastKnownStage(draft.stage)
  await router.push({ name: 'registration' })
}

/**
 * @description: 打开个人中心
 * @return {void} 无返回值
 */
function openProfile(): void {
  void router.push({ name: 'profile' })
}
</script>

<template>
  <ResponsivePageShell :title="t('home.agency')" :subtitle="t('home.description')">
    <div class="home-layout">
      <section class="home-hero">
        <p class="home-hero__office">
          {{ t('home.office') }}
        </p>
        <p class="home-hero__flow">
          {{ t('home.flow') }}
        </p>
        <div class="home-hero__actions">
          <v-btn color="primary" variant="flat" size="large" @click="startRegistration">
            {{ t('home.primary') }}
          </v-btn>
          <v-btn color="primary" variant="outlined" size="large" @click="openProfile">
            {{ t('home.profile') }}
          </v-btn>
        </div>
        <img :src="certificateBg" alt="" class="home-hero__preview" />
      </section>

      <aside class="home-status">
        <v-card variant="flat" class="home-status__card">
          <v-card-title>{{ t('common.status.localOnly') }}</v-card-title>
          <v-card-text>
            <p>{{ t('home.catalogStatus') }}</p>
            <dl class="home-status__meta">
              <div>
                <dt>{{ t('home.catalogVersion') }}</dt>
                <dd>{{ associationCatalogSeed.catalogVersion }}</dd>
              </div>
              <div>
                <dt>{{ t('home.titleCount') }}</dt>
                <dd>{{ associationCatalogSeed.titleOptions.length }}</dd>
              </div>
              <div>
                <dt>{{ t('home.templateCount') }}</dt>
                <dd>{{ associationCatalogSeed.templates.length }}</dd>
              </div>
            </dl>
          </v-card-text>
        </v-card>
      </aside>
    </div>

    <BottomActionBar :primary-label="t('home.primary')" @primary="startRegistration" />
  </ResponsivePageShell>
</template>

<style scoped>
.home-layout {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr);
}

.home-hero {
  position: relative;
  overflow: hidden;
  min-height: 420px;
  padding: clamp(24px, 5vw, 54px);
  border: 1px solid rgba(181, 138, 69, 0.24);
  border-radius: 16px;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.95), rgba(255, 234, 242, 0.86)),
    repeating-linear-gradient(
      135deg,
      rgba(239, 95, 143, 0.08) 0,
      rgba(239, 95, 143, 0.08) 2px,
      transparent 2px,
      transparent 18px
    );
  box-shadow: var(--shadow-card);
}

.home-hero::before {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 8px;
  background: linear-gradient(
    90deg,
    var(--color-primary),
    var(--color-lemon),
    var(--color-mint),
    var(--color-lavender)
  );
  content: '';
}

.home-hero__office {
  position: relative;
  z-index: 1;
  max-width: 660px;
  margin: 0;
  color: var(--color-primary-active);
  font-size: clamp(30px, 6vw, 58px);
  font-weight: 820;
  letter-spacing: 0;
}

.home-hero__flow {
  position: relative;
  z-index: 1;
  margin: 22px 0 0;
  color: var(--color-muted-dark);
  font-size: 17px;
  line-height: 1.7;
}

.home-hero__actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 34px;
}

.home-hero__preview {
  position: absolute;
  right: clamp(-70px, -4vw, -24px);
  bottom: 34px;
  width: min(46%, 520px);
  border: 1px solid rgba(196, 138, 44, 0.24);
  border-radius: 10px;
  box-shadow: 0 18px 42px rgba(122, 78, 98, 0.18);
  opacity: 0.92;
  transform: rotate(-2deg);
}

.home-status__card {
  border: 1px solid rgba(239, 95, 143, 0.24);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 234, 242, 0.72));
  box-shadow: var(--shadow-card);
}

.home-status__meta {
  display: grid;
  gap: 10px;
  margin: 18px 0 0;
}

.home-status__meta div {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.home-status__meta dt {
  color: var(--color-muted-dark);
}

.home-status__meta dd {
  margin: 0;
  color: var(--color-foreground);
  font-weight: 650;
}

@media (min-width: 900px) {
  .home-layout {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

@media (max-width: 820px) {
  .home-hero {
    min-height: 360px;
  }

  .home-hero__preview {
    right: -80px;
    width: 320px;
    opacity: 0.28;
  }
}
</style>
