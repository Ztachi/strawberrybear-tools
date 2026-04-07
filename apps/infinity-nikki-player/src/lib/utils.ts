/**
 * @description: shadcn-vue 工具函数
 * @param inputs class 值
 * @return 合并后的 class 字符串
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
