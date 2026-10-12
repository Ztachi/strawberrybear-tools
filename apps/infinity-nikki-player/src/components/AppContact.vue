<script setup lang="ts">
/** 联系方式与官网入口；账号直接复用 Typography 的复制交互。 */
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { DiscordFilled, QqOutlined } from '@antdv-next/icons'
import { ExternalLink, MessagesSquare } from 'lucide-vue-next'
import { Button, TypographyText } from 'antdv-next'

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
    <div class="contact-header">
      <h3 id="app-settings-contact-title" class="contact-title">
        <MessagesSquare class="size-4 shrink-0 text-primary" :stroke-width="2" aria-hidden="true" />
        {{ t('appSettings.contact') }}
      </h3>
      <Button type="link" size="small" @click="openWebsite">
        <template #icon>
          <ExternalLink :size="14" :stroke-width="2" aria-hidden="true" />
        </template>
        {{ t('about.officialSite') }}
      </Button>
    </div>
    <div class="contact-list">
      <div v-for="contact in contacts" :key="contact.type" class="contact-row">
        <span class="contact-platform">
          <component
            :is="icons[contact.type]"
            v-if="icons[contact.type]"
            class="text-base text-primary"
            aria-hidden="true"
          />
          <span>{{ contact.label }}</span>
        </span>
        <TypographyText
          :copyable="{ text: contact.account }"
          :styles="{
            root: {
              display: 'flex',
              alignItems: 'center',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              overflowWrap: 'anywhere',
            },
            actions: { display: 'inline-flex', alignItems: 'center' },
            action: { display: 'inline-flex', alignItems: 'center', minHeight: '1.25rem' },
          }"
          class="contact-account"
        >
          <span>{{ contact.account }}</span>
        </TypographyText>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contact-header {
  @apply mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1;
}
.contact-title {
  @apply m-0 flex items-center gap-2 text-sm font-semibold;
}
.contact-list {
  @apply flex flex-col gap-2;
}
.contact-row {
  @apply grid min-w-0 grid-cols-[100px_minmax(0,1fr)] items-center gap-3 text-sm leading-5;
}
.contact-platform {
  @apply flex items-center gap-2 text-[var(--color-muted-dark)];
}
</style>
