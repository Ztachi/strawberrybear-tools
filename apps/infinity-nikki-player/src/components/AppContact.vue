<script setup lang="ts">
/** 联系方式与官网入口；账号直接复用 Typography 的复制交互。 */
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { DiscordFilled, QqOutlined } from '@antdv-next/icons'
import { ExternalLink } from 'lucide-vue-next'
import { Button, TypographyParagraph } from 'antdv-next'

interface Contact {
  type: string
  label: string
  account: string
}
const { t, tm } = useI18n()
const icons: Record<string, Component> = { qq: QqOutlined, discord: DiscordFilled }
const contacts = computed<Contact[]>(() => {
  const value = tm('about.contacts')
  if (!Array.isArray(value)) return []
  return value.filter((contact): contact is Contact =>
    typeof contact === 'object' && contact !== null &&
    'type' in contact && typeof contact.type === 'string' &&
    'label' in contact && typeof contact.label === 'string' &&
    'account' in contact && typeof contact.account === 'string'
  )
})
async function openWebsite(): Promise<void> {
  await invoke('open_url', { url: 'https://ztachi.com/tools/infinity-nikki-player' })
}
</script>

<template>
  <div class="app-contact">
    <div class="contact-grid">
      <div v-for="contact in contacts" :key="contact.type" class="contact-card">
        <span class="contact-label">
          <component
            :is="icons[contact.type]"
            v-if="icons[contact.type]"
            class="text-base text-primary"
            aria-hidden="true"
          />
          {{ contact.label }}
        </span>
        <TypographyParagraph :copyable="{ text: contact.account }" class="contact-account">
          {{ contact.account }}
        </TypographyParagraph>
      </div>
    </div>
    <div class="contact-website">
      <Button size="small" @click="openWebsite">
        <template #icon>
          <ExternalLink :size="14" :stroke-width="2" aria-hidden="true" />
        </template>
        {{ t('about.officialSite') }}
      </Button>
      <span class="text-xs text-[var(--color-muted-dark)]">ztachi.com</span>
    </div>
  </div>
</template>

<style scoped>
.contact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
  gap: 10px;
}
.contact-card {
  @apply min-w-0 rounded-lg border border-primary/15 bg-white/70 px-3 py-2.5;
}
.contact-label {
  @apply flex items-center gap-2 text-xs text-[var(--color-muted-dark)];
}
.contact-account {
  margin: 6px 0 0;
  font-size: 14px;
}
.contact-website {
  @apply mt-3 flex flex-wrap items-center gap-3;
}
</style>
