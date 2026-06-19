/**
 * @fileOverview 应用路由
 * @description 定义证书签发处的页面骨架路由；资料确认仍按需求保留为登记页覆盖层。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAppStore } from '@/stores/app'

const certificateWorkflowMeta = { shellKey: 'certificate-workflow' }

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView/HomeView.vue'),
  },
  {
    path: '/registration',
    name: 'registration',
    component: () => import('@/views/CertificateWorkflowView/CertificateWorkflowView.vue'),
    meta: certificateWorkflowMeta,
  },
  {
    path: '/proofing',
    name: 'proofing',
    component: () => import('@/views/CertificateWorkflowView/CertificateWorkflowView.vue'),
    meta: certificateWorkflowMeta,
  },
  {
    path: '/signing',
    name: 'signing',
    component: () => import('@/views/CertificateWorkflowView/CertificateWorkflowView.vue'),
    meta: certificateWorkflowMeta,
  },
  {
    path: '/certificate',
    name: 'certificate',
    component: () => import('@/views/CertificateWorkflowView/CertificateWorkflowView.vue'),
    meta: certificateWorkflowMeta,
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView/ProfileView.vue'),
  },
  {
    path: '/assets/avatars',
    name: 'avatar-library',
    component: () => import('@/views/AvatarLibraryView/AvatarLibraryView.vue'),
  },
  {
    path: '/assets/backgrounds',
    name: 'background-library',
    component: () => import('@/views/BackgroundLibraryView/BackgroundLibraryView.vue'),
  },
]

/** 应用路由实例。 */
export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const appStore = useAppStore()
  // route.name 可能是 symbol，这里统一转成字符串，便于顶部栏和调试面板消费。
  appStore.setCurrentRouteName(String(to.name ?? 'home'))
})
