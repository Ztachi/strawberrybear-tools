<script setup lang="ts">
/**
 * @description: Pagination - 表格分页栏组件
 * @description 负责页码、总数和页大小展示，业务列表只传入分页状态
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Button from '../button/Button.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select'

const { t } = useI18n()

/**
 * @description: Pagination 组件属性
 * @param {number} page - 当前页码，1-based
 * @param {number} pageSize - 每页数量
 * @param {number} total - 总记录数
 * @param {number[]} pageSizeOptions - 可选页大小
 */
const props = defineProps<{
  page: number
  pageSize: number
  total: number
  pageSizeOptions: number[]
}>()

/**
 * @description: Pagination 组件事件
 */
const emit = defineEmits<{
  /** 页码变化 */
  'update:page': [page: number]
  /** 页大小变化 */
  'update:pageSize': [pageSize: number]
}>()

/** 总页数至少为 1，避免空数据时显示 0/0。 */
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

/** 当前页起始序号，空数据时显示 0。 */
const startItem = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))

/** 当前页结束序号，不能超过总数。 */
const endItem = computed(() => Math.min(props.total, props.page * props.pageSize))

/**
 * @description: 切换页大小
 * @param {unknown} value - Select 返回值
 * @return {void}
 */
function handlePageSizeChange(value: unknown): void {
  // Select 可能返回 null 或非数字值，必须防御后再通知业务页面。
  const nextPageSize = Number(value)
  if (!props.pageSizeOptions.includes(nextPageSize)) return
  emit('update:pageSize', nextPageSize)
}

/**
 * @description: 跳转到上一页
 * @return {void}
 */
function goPrevPage(): void {
  // 页码下限是 1，避免业务列表收到非法页码。
  emit('update:page', Math.max(1, props.page - 1))
}

/**
 * @description: 跳转到下一页
 * @return {void}
 */
function goNextPage(): void {
  // 页码上限由组件根据 total/pageSize 计算，调用方无需重复保护。
  emit('update:page', Math.min(totalPages.value, props.page + 1))
}
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 px-4 py-3 text-sm text-muted-foreground"
  >
    <div>{{ startItem }}-{{ endItem }} / {{ total }}</div>
    <div class="flex items-center gap-2">
      <span>{{ t('pagination.perPage') }}</span>
      <Select :model-value="String(pageSize)" @update:model-value="handlePageSizeChange">
        <SelectTrigger size="sm" class="w-[84px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="option in pageSizeOptions" :key="option" :value="String(option)">
            {{ option }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        class="size-8"
        :disabled="page <= 1"
        @click="goPrevPage"
      >
        <ChevronLeft class="size-4" />
      </Button>
      <span class="min-w-16 text-center">{{ page }} / {{ totalPages }}</span>
      <Button
        variant="outline"
        size="icon"
        class="size-8"
        :disabled="page >= totalPages"
        @click="goNextPage"
      >
        <ChevronRight class="size-4" />
      </Button>
    </div>
  </div>
</template>
