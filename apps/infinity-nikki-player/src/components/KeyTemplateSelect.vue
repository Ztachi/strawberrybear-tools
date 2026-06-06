<script setup lang="ts">
/**
 * @fileOverview 键位映射模板选择器
 * @description 封装模板搜索、展示名国际化和 Pinia 模板选择持久化逻辑。
 */
import { computed, ref, useAttrs } from 'vue'
import type { CSSProperties, StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { Select } from 'antdv-next'
import { useSettingsStore } from '@/stores/settings'

defineOptions({
  inheritAttrs: false,
})

/**
 * @description: 键位映射模板选择器展示参数
 * @property {string | number} [width] - 选择器宽度，数字按 px 处理
 * @property {StyleValue} [style] - 透传并合并到 Select 根节点的样式
 */
const props = defineProps<{
  width?: string | number
  style?: StyleValue
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()

/** 透传调用方传入的 class、弹层 class、list-height 等 antdv-next Select 参数。 */
const attrs = useAttrs()

/** 当前是否正在保存模板选择，用于驱动 Select loading 状态。 */
const isSelecting = ref(false)

/**
 * @description: 解析模板展示名称，内置模板使用 i18n 名称，自定义模板使用原始名称。
 * @param {string} name - 模板原始名称
 * @param {string} id - 模板 ID
 * @return {string} 用户可见模板名称
 */
function getTemplateDisplayName(name: string, id: string): string {
  const builtinName = t(`template.builtinNames.${id}` as any)
  return builtinName && builtinName !== `template.builtinNames.${id}` ? builtinName : name
}

/** antdv-next Select 使用的模板选项，label 用于显示和搜索过滤。 */
const templateOptions = computed(() =>
  settingsStore.templates.map((template) => ({
    label: getTemplateDisplayName(template.name, template.id),
    value: template.id,
  }))
)

/** 合并调用方样式和固定宽度，避免长模板名撑开悬浮窗口布局。 */
const selectStyle = computed<StyleValue>(() => {
  const widthStyle: CSSProperties =
    props.width === undefined
      ? {}
      : {
          width: typeof props.width === 'number' ? `${props.width}px` : props.width,
        }

  return [props.style, widthStyle]
})

/**
 * @description: 通过 settings store 持久化当前键位映射模板选择。
 * @param {unknown} value - antdv-next Select 发出的选中值
 * @return {Promise<void>} 无返回值
 */
async function handleTemplateChange(value: unknown): Promise<void> {
  if (typeof value !== 'string') {
    return
  }

  isSelecting.value = true
  try {
    await settingsStore.selectTemplate(value)
  } finally {
    isSelecting.value = false
  }
}
</script>

<template>
  <Select
    v-bind="attrs"
    show-search
    option-filter-prop="label"
    :style="selectStyle"
    :value="settingsStore.currentTemplateId ?? undefined"
    :options="templateOptions"
    :placeholder="t('player.noTemplate')"
    :loading="isSelecting"
    @update:value="handleTemplateChange"
  />
</template>
