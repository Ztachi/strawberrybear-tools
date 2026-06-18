<script setup lang="ts">
/**
 * @description: HomeView - 仪式化首页
 * @description 展示机构氛围、办理说明和进入登记/个人中心的主入口。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import BottomActionBar from '@/components/BottomActionBar.vue'
import ResponsivePageShell from '@/components/ResponsivePageShell.vue'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'
import { useDraftSessionStore } from '@/stores/draftSession'

const { t } = useI18n()
const router = useRouter()
const draftSession = useDraftSessionStore()

/**
 * @description: 进入登记流程
 * @description 项目骨架阶段只记录轻量阶段线索，完整草稿创建会在业务服务阶段接入 Dexie。
 * @return {void} 无返回值
 */
function startRegistration(): void {
  draftSession.setLastKnownStage('registration')
  void router.push({ name: 'registration' })
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
      </section>

      <aside class="home-status">
        <v-card variant="flat" class="home-status__card">
          <v-card-title>{{ t('common.status.localOnly') }}</v-card-title>
          <v-card-text>
            <p>{{ t('home.catalogStatus') }}</p>
            <dl class="home-status__meta">
              <div>
                <dt>Catalog</dt>
                <dd>{{ associationCatalogSeed.catalogVersion }}</dd>
              </div>
              <div>
                <dt>Titles</dt>
                <dd>{{ associationCatalogSeed.titleOptions.length }}</dd>
              </div>
              <div>
                <dt>Templates</dt>
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
  min-height: 420px;
  padding: clamp(24px, 5vw, 54px);
  border: 1px solid rgba(181, 138, 69, 0.24);
  border-radius: 18px;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.92), rgba(255, 241, 244, 0.84)),
    radial-gradient(circle at 82% 35%, rgba(49, 85, 143, 0.16), transparent 34%);
  box-shadow: var(--shadow-card);
}

.home-hero__office {
  margin: 0;
  color: var(--color-gold);
  font-size: clamp(30px, 6vw, 58px);
  font-weight: 780;
  letter-spacing: 0;
}

.home-hero__flow {
  margin: 22px 0 0;
  color: var(--color-muted-dark);
  font-size: 17px;
  line-height: 1.7;
}

.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 34px;
}

.home-status__card {
  border: 1px solid var(--border-primary-20);
  background: var(--bg-white-90);
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
</style>
