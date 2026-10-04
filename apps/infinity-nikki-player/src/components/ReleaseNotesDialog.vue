<script setup lang="ts">
/** @description: 离线用户更新日志；启动区间和完整历史共用一套内容与目录。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Modal, Tag } from 'antdv-next'
import { RELEASE_NOTES } from '@/const'
import SectionDocument from '@/components/SectionDocument.vue'

const props = defineProps<{
  open: boolean
  versions: readonly string[]
  currentVersion: string
  mode: 'update' | 'history'
}>()
const emit = defineEmits<{ close: [] }>()
const { t, tm, rt } = useI18n()
const releases = computed(() => props.versions.flatMap((version) => {
  const entry = RELEASE_NOTES.find((release) => release.version === version)
  return entry ? [entry] : []
}))
const items = computed(() => releases.value.map((release) => ({
  key: release.id,
  href: `#release-note-${release.id}`,
  title: `${release.version} ${release.date}`,
})))
</script>

<template>
  <Modal
    :open="open"
    :title="t(mode === 'update' ? 'releaseNotes.updatedTitle' : 'releaseNotes.title')"
    width="min(860px, calc(100vw - 32px))"
    centered
    destroy-on-hidden
    :styles="{ body: { height: 'min(68dvh, 580px)', overflow: 'hidden' } }"
    @cancel="emit('close')"
  >
    <SectionDocument :items="items" :contents-label="t('releaseNotes.versions')">
      <div class="release-notes-timeline pl-7">
        <section
          v-for="release in releases"
          :id="`release-note-${release.id}`"
          :key="release.id"
          class="release-note relative scroll-mt-2 pb-7 last:pb-0"
          :aria-labelledby="`release-title-${release.id}`"
        >
          <span
            aria-hidden="true"
            class="release-note-dot"
            :class="{ 'release-note-dot-latest': release === releases[0] }"
          >
            <span
              v-for="ring in release === releases[0] ? 3 : 0"
              :key="ring"
              class="release-note-ripple"
            />
          </span>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="text-base font-semibold">v{{ release.version }}</span>
            <Tag v-if="release.version === currentVersion" :color="'var(--color-primary-active)'">
              {{ t('releaseNotes.current') }}
            </Tag>
            <time :datetime="release.date" class="text-xs text-[var(--color-muted-dark)]">
              {{ release.date }}
            </time>
          </div>
          <h3 :id="`release-title-${release.id}`" class="mb-3 mt-0 text-base font-semibold">
            {{ t(`releaseNotes.releases.${release.id}.title`) }}
          </h3>
          <ul class="m-0 list-disc space-y-3 pl-5">
            <li
              v-for="(highlight, index) in tm(`releaseNotes.releases.${release.id}.highlights`)"
              :key="index"
            >
              {{ rt(highlight) }}
            </li>
          </ul>
        </section>
      </div>
    </SectionDocument>
    <template #footer>
      <Button type="primary" @click="emit('close')">
        {{ t('actions.close') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
/* 时间树是日志正文专属：每段连接至下一版圆点，不影响共用目录。 */
.release-note:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 13px;
  bottom: -13px;
  left: -23px;
  border-left: 2px solid var(--border-primary-20);
}

.release-note-dot {
  position: absolute;
  top: 7px;
  left: -28px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-primary);
  border-radius: 50%;
  background: var(--color-white);
}

.release-note-dot-latest {
  /* 缩小中心点，保留与普通圆点、时间树轨道相同的圆心。 */
  top: 9px;
  left: -26px;
  width: 8px;
  height: 8px;
  border: 0;
  background: var(--color-primary);
}

/* 每圈慢慢扩散四秒半，间隔一秒半发出；三圈均分周期，始终有波纹向外运动。 */
.release-note-ripple {
  position: absolute;
  inset: -3px;
  border: 1px solid var(--color-primary);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  transform: scale(0.95);
  animation: release-note-ripple 4.5s linear infinite;
}

.release-note-ripple:nth-child(2) {
  animation-delay: 1.5s;
}

.release-note-ripple:nth-child(3) {
  animation-delay: 3s;
}

@keyframes release-note-ripple {
  0% { transform: scale(0.95); opacity: 0; }
  10% { opacity: 0.75; }
  100% { transform: scale(2.2); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .release-note-ripple {
    animation: none;
    opacity: 0.3;
    transform: none;
  }

  .release-note-ripple:not(:first-child) {
    display: none;
  }
}
</style>
