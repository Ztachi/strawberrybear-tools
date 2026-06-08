<script setup lang="ts">
/**
 * @description: 模板 Tab 页
 * @description 显示模板管理界面
 */
import TemplateEditor from './components/TemplateEditor.vue'
import { ref } from 'vue'

/** 模板编辑器实例，用于向主窗口暴露未保存离开守卫。 */
const templateEditorRef = ref<InstanceType<typeof TemplateEditor> | null>(null)

defineExpose({
  /**
   * @description: 确认模板页是否允许离开
   * @param {'close' | 'jump'} context - 离开场景
   * @return {Promise<boolean>} true 表示允许父级继续切页或导入
   */
  confirmLeaveIfNeeded(context: 'close' | 'jump' = 'close'): Promise<boolean> {
    // TemplateEditor 尚未挂载时没有编辑状态，父级可以直接离开。
    return templateEditorRef.value?.confirmLeaveIfNeeded(context) ?? Promise.resolve(true)
  },
  /**
   * @description: 判断模板页是否存在刷新前需要保护的未保存改动
   * @return {boolean} true 表示模板编辑器中存在未保存改动
   */
  hasPendingChanges(): boolean {
    // 外层 Tab 不直接读取模板内容，只把编辑器内部 dirty 状态透传给主窗口。
    return templateEditorRef.value?.hasPendingChanges() ?? false
  },
  /**
   * @description: 刷新前写入当前模板草稿
   * @return {void}
   */
  writePendingDraft(): void {
    // 草稿 key 和写入条件由编辑器内部维护，避免 Tab 层出现并行状态。
    templateEditorRef.value?.writePendingDraft()
  },
})
</script>

<template>
  <TemplateEditor ref="templateEditorRef" />
</template>
