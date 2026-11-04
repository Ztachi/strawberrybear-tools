<script setup lang="ts">
/** 云同步表单独立管理未保存配置，凭据输入与原生脱敏配置分开保存。 */
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert,
  Button,
  Form,
  FormItem,
  Input,
  InputPassword,
  Select,
  Switch,
  Tag,
} from 'antdv-next'
import { CloudDownload, CloudUpload, PlugZap, Save, X } from 'lucide-vue-next'
import { listen } from '@tauri-apps/api/event'
import {
  dataManagement,
  DEFAULT_CLOUD_CONFIG,
  EMPTY_CLOUD_STATUS,
  type CloudProvider,
  type CloudSyncConfig,
  type CloudSyncStatus,
  type PreparedRestore,
  type SecretUpdate,
} from '@/lib/dataManagement'
import { feedback } from '@/lib/feedback'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import AsyncSettingSelect from './AsyncSettingSelect.vue'
import SnapshotDetails from './SnapshotDetails.vue'
import { useSettingsConfirm } from './useSettingsConfirm'

interface CloudSyncProps {
  disabled: boolean
  // eslint-disable-next-line no-unused-vars -- 回调形参仅声明恢复接口。
  restore: (prepared: PreparedRestore) => Promise<void>
}
const props = defineProps<CloudSyncProps>()
const { t, locale } = useI18n()
const confirm = useSettingsConfirm()
const config = ref<CloudSyncConfig>(structuredClone(DEFAULT_CLOUD_CONFIG))
const saved = ref<CloudSyncConfig>(structuredClone(DEFAULT_CLOUD_CONFIG))
const status = ref<CloudSyncStatus>({ ...EMPTY_CLOUD_STATUS })
const loading = ref(true)
const loadError = ref('')
const operation = ref('')
const password = ref('')
const secretKey = ref('')
const clearPassword = ref(false)
const clearSecretKey = ref(false)
let unlisten: (() => void) | undefined
let disposed = false

const dirty = computed(
  () =>
    JSON.stringify(config.value) !== JSON.stringify(saved.value) ||
    Boolean(password.value || secretKey.value || clearPassword.value || clearSecretKey.value)
)
const syncing = computed(() => status.value.phase !== 'idle')
const operationActive = computed(() => Boolean(operation.value) || syncing.value)
const busy = computed(
  () => props.disabled || loading.value || Boolean(operation.value) || syncing.value
)
const canSync = computed(() => !busy.value && saved.value.enabled && !dirty.value)
const providerOptions = [
  { value: 'webdav', label: 'WebDAV' },
  { value: 's3', label: 'S3' },
]
const presets = computed(() =>
  (config.value.provider === 'webdav'
    ? ['jianguoyun', 'nextcloud', 'synology', 'custom']
    : ['aws-s3', 's3-minio', 's3-r2', 's3-oss', 's3-cos', 's3-obs', 's3-custom']
  ).map((value) => ({
    value,
    label: t(
      `dataManagement.cloud.${config.value.provider === 'webdav' ? 'webdavPresets' : 's3Presets'}.${value}`
    ),
  }))
)
const activeSettings = computed(() =>
  config.value.provider === 'webdav' ? config.value.webdav : config.value.s3
)
const lastSync = computed(() =>
  status.value.lastSyncAt
    ? t('dataManagement.cloud.lastSync', {
        time: new Date(status.value.lastSyncAt).toLocaleString(locale.value),
      })
    : t('dataManagement.cloud.never')
)
const passwordUpdate = (): SecretUpdate =>
  password.value
    ? { action: 'replace', value: password.value }
    : { action: clearPassword.value ? 'clear' : 'keep' }
const secretKeyUpdate = (): SecretUpdate =>
  secretKey.value
    ? { action: 'replace', value: secretKey.value }
    : { action: clearSecretKey.value ? 'clear' : 'keep' }

function resetSecrets(): void {
  password.value = ''
  secretKey.value = ''
  clearPassword.value = false
  clearSecretKey.value = false
}
function clearStoredPassword(): void {
  clearPassword.value = true
  password.value = ''
}
function clearStoredSecretKey(): void {
  clearSecretKey.value = true
  secretKey.value = ''
}
async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [nextConfig, nextStatus] = await Promise.all([
      dataManagement.getCloudConfig(),
      dataManagement.getCloudStatus(),
    ])
    if (disposed) return
    config.value = structuredClone(nextConfig)
    saved.value = structuredClone(nextConfig)
    status.value = nextStatus
    resetSecrets()
  } catch (error) {
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}
async function run(key: string, action: () => Promise<void>): Promise<void> {
  if (operation.value || props.disabled) return
  operation.value = key
  try {
    await action()
  } catch (error) {
    feedback.error(t('dataManagement.operationFailed'), { description: String(error) })
  } finally {
    operation.value = ''
    try {
      status.value = await dataManagement.getCloudStatus()
    } catch {
      /* 原始操作结果已反馈，状态可由原生事件继续刷新。 */
    }
  }
}
async function changeProvider(value: unknown): Promise<boolean> {
  if (value !== 'webdav' && value !== 's3') return false
  if (value === config.value.provider) return true
  if (saved.value.enabled) {
    if (
      !(await confirm(
        t('dataManagement.cloud.switchTitle'),
        t('dataManagement.cloud.switchDescription')
      ))
    )
      return false
    let changed = false
    await run('provider', async () => {
      saved.value = await dataManagement.saveCloudConfig(
        { ...saved.value, enabled: false },
        { action: 'keep' },
        { action: 'keep' }
      )
      config.value = { ...config.value, provider: value as CloudProvider, enabled: false, autoUpload: false }
      changed = true
    })
    return changed
  }
  config.value = { ...config.value, provider: value, enabled: false, autoUpload: false }
  return true
}
function changePreset(value: unknown): void {
  if (typeof value !== 'string') return
  if (config.value.provider === 'webdav') {
    config.value.webdav = {
      ...config.value.webdav,
      preset: value,
      baseUrl: value === 'jianguoyun' ? 'https://dav.jianguoyun.com/dav/' : '',
    }
  } else {
    config.value.s3 = {
      ...config.value.s3,
      preset: value,
      region: value === 'aws-s3' ? 'us-east-1' : value === 's3-r2' ? 'auto' : '',
      endpoint: '',
    }
  }
}
async function saveConfig(): Promise<void> {
  await run('save', async () => {
    const next = await dataManagement.saveCloudConfig(
      config.value,
      passwordUpdate(),
      secretKeyUpdate()
    )
    saved.value = structuredClone(next)
    config.value = structuredClone(next)
    resetSecrets()
    try {
      await dataManagement.testCloudConnection(next, { action: 'keep' }, { action: 'keep' })
      feedback.success(t('dataManagement.cloud.savedConnected'))
    } catch (error) {
      feedback.warning(t('dataManagement.cloud.savedButConnectionFailed'), { description: String(error) })
    }
  })
}
async function changeAutoUpload(value: unknown): Promise<void> {
  if (!value) { config.value.autoUpload = false; return }
  if (await confirm(t('dataManagement.cloud.autoUploadConfirmTitle'), t('dataManagement.cloud.autoUploadConfirmDescription'), true)) config.value.autoUpload = true
}
async function testConnection(): Promise<void> {
  await run('test', async () => {
    await dataManagement.testCloudConnection(config.value, passwordUpdate(), secretKeyUpdate())
    feedback.success(t('dataManagement.cloud.testSucceeded'))
  })
}
async function upload(): Promise<void> {
  if (!canSync.value) return
  await run('upload', async () => {
    const remote = await dataManagement.previewCloudSnapshot()
    const content = h('div', { class: 'space-y-4' }, [
      h('p', { class: 'mb-0' }, t('dataManagement.cloud.uploadDescription')),
      remote
        ? h('div', { class: 'space-y-2' }, [
            h('h4', { class: 'm-0 text-sm font-medium' }, t('dataManagement.cloud.remoteSnapshot')),
            h(SnapshotDetails, { summary: remote }),
          ])
        : h('p', { class: 'mb-0 text-sm' }, t('dataManagement.cloud.noRemoteSnapshot')),
    ])
    if (!(await confirm(t('dataManagement.cloud.uploadTitle'), content, Boolean(remote)))) return
    await dataManagement.uploadCloudSnapshot()
    feedback.success(t('dataManagement.cloud.uploaded'))
  })
}
async function download(): Promise<void> {
  if (!canSync.value) return
  await run('download', async () => {
    const remote = await dataManagement.previewCloudSnapshot()
    if (!remote) {
      feedback.info(t('dataManagement.cloud.noSnapshot'))
      return
    }
    const prepared = await dataManagement.prepareCloudRestore()
    await props.restore(prepared)
  })
}
async function cancel(): Promise<void> {
  try {
    await dataManagement.cancelCloudSync()
    status.value = await dataManagement.getCloudStatus()
  } catch (error) {
    feedback.error(t('dataManagement.operationFailed'), { description: String(error) })
  }
}
async function canClose(): Promise<boolean> {
  if (operation.value || syncing.value) {
    feedback.info(t('dataManagement.cloud.operationBusy'))
    return false
  }
  if (!dirty.value) return true
  return await confirm(
    t('dataManagement.cloud.discardTitle'),
    t('dataManagement.cloud.discardDescription')
  )
}
defineExpose({ canClose, operationActive })
onMounted(async () => {
  await load()
  try {
    const stop = await listen<CloudSyncStatus>('cloud-sync-status-changed', (event) => {
      status.value = event.payload
    })
    if (disposed) stop()
    else unlisten = stop
  } catch {
    /* 手动操作后仍读取状态；监听不可用不阻止配置。 */
  }
})
onUnmounted(() => {
  disposed = true
  unlisten?.()
  resetSecrets()
})
</script>
<template>
  <SettingsGroup
    :title="t('dataManagement.cloud.title')"
    :description="t('dataManagement.cloud.description')"
  >
    <Alert
      v-if="loadError"
      type="error"
      show-icon
      :title="t('dataManagement.loadFailed')"
      :description="loadError"
    >
      <template #action>
        <Button size="small" @click="load">
          {{ t('dataManagement.retry') }}
        </Button>
      </template>
    </Alert>
    <SettingsRow :title="t('dataManagement.cloud.enabled')">
      <Switch
        v-model:checked="config.enabled"
        :disabled="busy || Boolean(loadError)"
        :aria-label="t('dataManagement.cloud.enabled')"
      />
    </SettingsRow>
    <Form
      layout="horizontal"
      :colon="false"
      :label-col="{ xs: { span: 24 }, md: { flex: '112px' } }"
      :wrapper-col="{ xs: { span: 24 }, md: { flex: '1' } }"
      label-align="left"
      label-wrap
      class="cloud-sync-form"
      :disabled="busy || Boolean(loadError)"
    >
      <div class="min-w-0">
        <FormItem :label="t('dataManagement.cloud.provider')" html-for="cloud-provider">
          <AsyncSettingSelect
            id="cloud-provider"
            :value="config.provider"
            :options="providerOptions"
            :disabled="busy || Boolean(loadError)"
            :aria-label="t('dataManagement.cloud.provider')"
            :save="changeProvider"
          />
        </FormItem>
        <FormItem :label="t('dataManagement.cloud.preset')" html-for="cloud-preset">
          <Select
            id="cloud-preset"
            :value="activeSettings.preset"
            :options="presets"
            :aria-label="t('dataManagement.cloud.preset')"
            @update:value="changePreset"
          />
        </FormItem>
      </div>
      <template v-if="config.provider === 'webdav'">
        <FormItem :label="t('dataManagement.cloud.address')" html-for="cloud-address" required>
          <Input
            id="cloud-address"
            v-model:value="config.webdav.baseUrl"
            :aria-label="t('dataManagement.cloud.address')"
            aria-required="true"
            placeholder="https://cloud.example.com/dav/"
          />
        </FormItem>
        <FormItem :label="t('dataManagement.cloud.username')" html-for="cloud-username" required>
          <Input
            id="cloud-username"
            v-model:value="config.webdav.username"
            :aria-label="t('dataManagement.cloud.username')"
            aria-required="true"
            autocomplete="off"
          />
        </FormItem>
        <FormItem :label="t('dataManagement.cloud.password')" html-for="cloud-password">
          <InputPassword
            id="cloud-password"
            v-model:value="password"
            :placeholder="
              t(
                `dataManagement.cloud.${config.webdav.hasPassword && !clearPassword ? 'secretSaved' : 'secretEmpty'}`
              )
            "
            autocomplete="new-password"
            @update:value="
              (value) => {
                if (value) clearPassword = false
              }
            "
          />
          <Button
            v-if="config.webdav.hasPassword"
            type="link"
            size="small"
            :disabled="clearPassword || busy"
            @click="clearStoredPassword"
          >
            {{ t(`dataManagement.cloud.${clearPassword ? 'secretCleared' : 'clearSecret'}`) }}
          </Button>
        </FormItem>
      </template>
      <template v-else>
        <div class="min-w-0">
          <FormItem :label="t('dataManagement.cloud.region')" html-for="cloud-region" required>
            <Input
              id="cloud-region"
              v-model:value="config.s3.region"
              :aria-label="t('dataManagement.cloud.region')"
              aria-required="true"
            />
          </FormItem>
          <FormItem :label="t('dataManagement.cloud.bucket')" html-for="cloud-bucket" required>
            <Input
              id="cloud-bucket"
              v-model:value="config.s3.bucket"
              :aria-label="t('dataManagement.cloud.bucket')"
              aria-required="true"
            />
          </FormItem>
        </div>
        <FormItem :label="t('dataManagement.cloud.endpoint')" html-for="cloud-endpoint">
          <Input
            id="cloud-endpoint"
            v-model:value="config.s3.endpoint"
            placeholder="https://s3.example.com"
          />
        </FormItem>
        <FormItem
          :label="t('dataManagement.cloud.accessKeyId')"
          html-for="cloud-access-key"
          required
        >
          <Input
            id="cloud-access-key"
            v-model:value="config.s3.accessKeyId"
            :aria-label="t('dataManagement.cloud.accessKeyId')"
            aria-required="true"
            autocomplete="off"
          />
        </FormItem>
        <FormItem :label="t('dataManagement.cloud.secretKey')" html-for="cloud-secret-key">
          <InputPassword
            id="cloud-secret-key"
            v-model:value="secretKey"
            :placeholder="
              t(
                `dataManagement.cloud.${config.s3.hasSecretKey && !clearSecretKey ? 'secretSaved' : 'secretEmpty'}`
              )
            "
            autocomplete="new-password"
            @update:value="
              (value) => {
                if (value) clearSecretKey = false
              }
            "
          />
          <Button
            v-if="config.s3.hasSecretKey"
            type="link"
            size="small"
            :disabled="clearSecretKey || busy"
            @click="clearStoredSecretKey"
          >
            {{ t(`dataManagement.cloud.${clearSecretKey ? 'secretCleared' : 'clearSecret'}`) }}
          </Button>
        </FormItem>
      </template>
      <div class="min-w-0">
        <FormItem :label="t('dataManagement.cloud.remoteRoot')" html-for="cloud-root" required>
          <Input
            id="cloud-root"
            v-model:value="activeSettings.remoteRoot"
            :aria-label="t('dataManagement.cloud.remoteRoot')"
            aria-required="true"
          />
        </FormItem>
        <FormItem :label="t('dataManagement.cloud.profile')" html-for="cloud-profile" required>
          <Input
            id="cloud-profile"
            v-model:value="activeSettings.profile"
            :aria-label="t('dataManagement.cloud.profile')"
            aria-required="true"
          />
        </FormItem>
      </div>
    </Form>
    <SettingsRow
      :title="t('dataManagement.cloud.autoUpload')"
      :description="t('dataManagement.cloud.autoUploadHint')"
    >
      <Switch
        :checked="config.autoUpload"
        :disabled="busy || !config.enabled || Boolean(loadError)"
        :aria-label="t('dataManagement.cloud.autoUpload')"
        @update:checked="changeAutoUpload"
      />
    </SettingsRow>
    <div class="flex flex-wrap gap-2">
      <Button
        size="small"
        :disabled="busy || Boolean(loadError)"
        :loading="operation === 'test'"
        @click="testConnection"
      >
        <template #icon>
          <PlugZap :size="14" /> </template
        >{{ t('dataManagement.cloud.test') }}
      </Button>
      <Button
        size="small"
        type="primary"
        :disabled="busy || !dirty || Boolean(loadError)"
        :loading="operation === 'save'"
        @click="saveConfig"
      >
        <template #icon>
          <Save :size="14" /> </template
        >{{ t('dataManagement.cloud.save') }}
      </Button>
    </div>
    <p v-if="dirty" class="m-0 text-xs text-[var(--color-muted-dark)]" role="status">
      {{ t('dataManagement.cloud.dirty') }}
    </p>
    <div class="border-t border-primary/15 pt-3">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-dark)]">
        <span>{{ lastSync }}</span
        ><Tag v-if="syncing">
          {{ t(`dataManagement.cloud.phase.${status.phase}`) }} </Tag
        ><Tag v-else-if="status.pending">
          {{ t('dataManagement.cloud.pending') }}
        </Tag>
      </div>
      <Alert
        v-if="status.lastError"
        class="mb-3"
        type="error"
        show-icon
        :title="status.lastError"
      />
      <div class="flex flex-wrap gap-2">
        <Button size="small" :disabled="!canSync" :loading="operation === 'upload'" @click="upload">
          <template #icon>
            <CloudUpload :size="14" /> </template
          >{{ t('dataManagement.cloud.upload') }}
        </Button>
        <Button
          size="small"
          :disabled="!canSync"
          :loading="operation === 'download'"
          @click="download"
        >
          <template #icon>
            <CloudDownload :size="14" /> </template
          >{{ t('dataManagement.cloud.download') }}
        </Button>
        <Button v-if="syncing" size="small" @click="cancel">
          <template #icon>
            <X :size="14" /> </template
          >{{ t('dataManagement.cloud.cancel') }}
        </Button>
      </div>
    </div>
  </SettingsGroup>
</template>
