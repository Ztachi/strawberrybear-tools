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
   * @description: 通知模板页重新计算表格布局
   * @return {void}
   */
  refreshTableLayout(): void {
    templateEditorRef.value?.refreshTableLayout()
  },
  /**
   * @description: 确认模板页是否允许离开
   * @param {'close' | 'jump'} context - 离开场景
   * @return {Promise<boolean>} true 表示允许父级继续切页或导入
   */
  confirmLeaveIfNeeded(context: 'close' | 'jump' = 'close'): Promise<boolean> {
    // TemplateEditor 尚未挂载时没有编辑状态，父级可以直接离开。
    return templateEditorRef.value?.confirmLeaveIfNeeded(context) ?? Promise.resolve(true)
  },
})
</script>

<template>
  <TemplateEditor ref="templateEditorRef" />
</template>
