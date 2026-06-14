<script setup lang="ts">
/**
 * @description: 右下角悬浮操作按钮组
 * @description 基于 antdv-next FloatButtonGroup：垂直堆叠的固定定位按钮。
 * @description 刷新功能已迁移到自定义标题栏 HeaderNavigation。
 */
import { FloatButton, FloatButtonGroup } from 'antdv-next'
import { ArrowUp, Crosshair } from 'lucide-vue-next'

/**
 * @description: 组件属性
 * @param {boolean} [showBackToTop] - 是否显示返回顶部按钮
 * @param {boolean} [showLocateCurrent] - 是否显示定位当前播放项按钮
 * @param {string} backToTopTitle - 返回顶部 tooltip 文案
 * @param {string} [locateCurrentTitle] - 定位 tooltip 文案，可选
 */
withDefaults(
  defineProps<{
    /** 是否显示返回顶部按钮 */
    showBackToTop?: boolean
    /** 是否显示定位当前播放项按钮 */
    showLocateCurrent?: boolean
    /** 返回顶部 tooltip 文案 */
    backToTopTitle: string
    /** 定位 tooltip 文案，可选 */
    locateCurrentTitle?: string
  }>(),
  {
    showBackToTop: false,
    showLocateCurrent: false,
    locateCurrentTitle: '',
  }
)

/**
 * @description: 组件事件
 * @event backToTop - 点击返回顶部按钮时触发
 * @event locateCurrent - 点击定位按钮时触发
 */
const emit = defineEmits<{
  backToTop: []
  locateCurrent: []
}>()

/** 返回顶部按钮点击 */
function handleBackToTop() {
  emit('backToTop')
}

/** 定位当前播放项按钮点击 */
function handleLocateCurrent() {
  emit('locateCurrent')
}
</script>

<template>
  <!-- 不传 trigger 即可关闭菜单模式，子按钮直接显示并垂直堆叠 -->
  <FloatButtonGroup shape="square" style="right:10px">
    <FloatButton
      v-if="showBackToTop"
      :tooltip="{ title: backToTopTitle, placement: 'left' }"
      @click="handleBackToTop"
    >
      <template #icon>
        <ArrowUp :size="16" />
      </template>
    </FloatButton>

    <FloatButton
      v-if="showLocateCurrent"
      :tooltip="{ title: locateCurrentTitle, placement: 'left' }"
      @click="handleLocateCurrent"
    >
      <template #icon>
        <Crosshair :size="16" />
      </template>
    </FloatButton>
  </FloatButtonGroup>
</template>
