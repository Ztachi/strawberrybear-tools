/**
 * @fileOverview 主窗口路由配置
 * @description 只负责维护文件/模板页签的 URL 状态，页面组件仍由主窗口常驻渲染。
 */
import { createRouter, createWebHistory } from 'vue-router'
import AllSongsPage from '@/views/MainWindow/FilesTab/pages/AllSongsPage.vue'
import SongListDetailPage from '@/views/MainWindow/FilesTab/pages/SongListDetailPage.vue'
import SongListEditPage from '@/views/MainWindow/FilesTab/pages/SongListEditPage.vue'

/** 当前路由只作为页签状态源，不通过 RouterView 卸载业务页面。 */
const RouteStateOnlyView = {
  render: () => null,
}

/** Infinity Nikki Player 主窗口路由实例。 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'files-all' },
    },
    {
      path: '/files',
      name: 'files',
      redirect: { name: 'files-all' },
    },
    {
      path: '/files/all',
      name: 'files-all',
      component: AllSongsPage,
    },
    {
      path: '/files/song-lists/:id',
      name: 'files-song-list-detail',
      component: SongListDetailPage,
    },
    {
      path: '/files/song-lists/:id/edit',
      name: 'files-song-list-edit',
      component: SongListEditPage,
    },
    {
      path: '/templates',
      name: 'templates',
      component: RouteStateOnlyView,
    },
    {
      path: '/online-library',
      name: 'online-library',
      component: RouteStateOnlyView,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'files-all' },
    },
  ],
})
