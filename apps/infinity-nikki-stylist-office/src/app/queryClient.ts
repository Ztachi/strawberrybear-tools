/**
 * @fileOverview TanStack Query 初始化
 * @description 统一管理协会资料库初始化、远程更新等异步资源状态。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { QueryClient } from '@tanstack/vue-query'

/** 应用共享 QueryClient。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 资料库更新以用户主动触发为主，默认减少后台自动请求。
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
