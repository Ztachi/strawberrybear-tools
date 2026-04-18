/**
 * @fileOverview 工具函数模块
 * @description 提供常用的工具函数
 */
import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * @description: 合并 Tailwind CSS 类名
 * @description 组合 clsx（条件类名）和 tailwind-merge（解决冲突）的能力
 * @param {...ClassValue[]} inputs - 类名参数
 * @return {string} 合并后的类名字符串
 *
 * @example
 * cn('px-2 py-1', 'bg-red', { 'bg-blue': condition })
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
