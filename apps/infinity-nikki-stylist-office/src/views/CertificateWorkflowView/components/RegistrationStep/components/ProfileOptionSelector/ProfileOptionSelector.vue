<script setup lang="ts">
/**
 * @description: ProfileOptionSelector - 登记资料统一选择器
 * @description 提供一行回显入口和对应弹窗，具体列表由子组件按类型维护。
 */
import { computed, ref } from 'vue'
import AvatarPickerBody from './components/AvatarPickerBody/AvatarPickerBody.vue'
import TitlePickerBody from './components/TitlePickerBody/TitlePickerBody.vue'
import type {
  AvatarPickerOption,
  ProfileOptionSelectorType,
  TitlePickerOption,
} from './types'

const props = withDefaults(
  defineProps<{
    avatarOptions?: AvatarPickerOption[]
    dialogIntro: string
    dialogTitle: string
    emptyText?: string
    groupLabel?: string
    label: string
    manageLabel?: string
    officialLabel?: string
    selectedAvatarName?: string
    selectedId: string
    selectedTitle?: TitlePickerOption | null
    titleOptions?: TitlePickerOption[]
    type: ProfileOptionSelectorType
  }>(),
  {
    avatarOptions: () => [],
    emptyText: '',
    groupLabel: '',
    manageLabel: '',
    officialLabel: '',
    selectedAvatarName: '',
    selectedTitle: null,
    titleOptions: () => [],
  }
)

const emit = defineEmits<{
  manage: []
  select: [id: string]
}>()

const isOpen = ref(false)

const selectedText = computed(() => {
  if (props.type === 'title') {
    return props.selectedTitle?.displayName ?? ''
  }

  return props.selectedAvatarName
})

const selectedDescription = computed(() => {
  if (props.type === 'title') {
    return props.selectedTitle?.displayDescription ?? ''
  }

  return props.officialLabel
})

/**
 * @description: 选择资料项
 * @description 关闭弹窗并把选择结果交给父组件保存草稿。
 * @param {string} id - 选项 ID
 * @return {void} 无返回值
 */
function selectOption(id: string): void {
  emit('select', id)
  isOpen.value = false
}

/**
 * @description: 打开自定义管理入口
 * @return {void} 无返回值
 */
function openManage(): void {
  emit('manage')
  isOpen.value = false
}
</script>

<template>
  <section class="grid gap-2">
    <span class="text-[13px] font-[720] text-[var(--color-muted-dark)]">
      {{ label }}
    </span>

    <button
      type="button"
      class="grid min-h-[76px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[#ef5f8f]/24 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,234,242,0.66))] px-4 py-3 text-left text-[var(--color-foreground)] shadow-[0_12px_28px_rgba(201,85,126,0.1)] transition hover:-translate-y-0.5 hover:border-[#ef5f8f]/55 hover:bg-[#fff4f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ef5f8f]/45"
      data-sound="open"
      @click="isOpen = true"
    >
      <span
        v-if="type === 'title'"
        class="grid size-12 place-items-center rounded-full bg-[linear-gradient(135deg,#ef5f8f,#c48a2c)] text-xl font-black text-white shadow-[0_8px_18px_rgba(239,95,143,0.18)]"
      >
        {{ selectedTitle?.symbol ?? '✦' }}
      </span>
      <v-avatar v-else color="primary" variant="tonal" size="48">
        <v-icon icon="mdi-account-circle-outline" size="30" />
      </v-avatar>

      <span class="grid min-w-0 gap-1">
        <strong class="truncate text-[16px] font-[820] leading-tight">
          {{ selectedText }}
        </strong>
        <small class="truncate text-[13px] leading-tight text-[var(--color-muted-dark)]">
          {{ selectedDescription }}
        </small>
      </span>

      <v-icon icon="mdi-chevron-right" color="primary" size="22" />
    </button>

    <v-dialog v-model="isOpen" max-width="620" scrollable>
      <v-card
        class="flex max-h-[min(620px,72dvh)] flex-col overflow-hidden rounded-[26px] border border-[#ef5f8f]/25 bg-[#fff9fc]"
      >
        <div
          class="flex shrink-0 items-start justify-between gap-4 px-6 pb-3 pt-6 max-[520px]:px-5 max-[520px]:pt-5"
        >
          <div class="grid gap-1">
            <h2
              class="m-0 text-[20px] font-[820] leading-tight text-[var(--color-foreground)] max-[520px]:text-[18px]"
            >
              {{ dialogTitle }}
            </h2>
            <p
              class="m-0 text-[13px] leading-relaxed text-[var(--color-muted-dark)] max-[520px]:line-clamp-2"
            >
              {{ dialogIntro }}
            </p>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            data-sound="back"
            @click="isOpen = false"
          />
        </div>

        <v-card-text
          class="min-h-0 overflow-y-auto px-6 pb-6 pt-2 max-[520px]:px-5 max-[520px]:pb-5"
        >
          <p
            v-if="groupLabel"
            class="mb-3 mt-0 text-[13px] font-[720] text-[var(--color-muted-dark)]"
          >
            {{ groupLabel }}
          </p>
          <TitlePickerBody
            v-if="type === 'title'"
            :items="titleOptions"
            :selected-id="selectedId"
            @select="selectOption"
          />
          <AvatarPickerBody
            v-else
            :empty-text="emptyText"
            :items="avatarOptions"
            :manage-label="manageLabel"
            :official-label="officialLabel"
            :selected-id="selectedId"
            @manage="openManage"
            @select="selectOption"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </section>
</template>
