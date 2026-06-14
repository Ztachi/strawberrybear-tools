/**
 * @fileOverview 主窗口路由配置
 * @description 主窗口右侧页面路由配置。
 */
import { createRouter, createWebHistory } from 'vue-router'
import AllSongsPage from '@/views/MainWindow/FilesTab/pages/AllSongsPage.vue'
import MidiDetailPage from '@/views/MainWindow/FilesTab/pages/MidiDetailPage.vue'
import SongListDetailPage from '@/views/MainWindow/FilesTab/pages/SongListDetailPage.vue'
import SongListEditPage from '@/views/MainWindow/FilesTab/pages/SongListEditPage.vue'
import OnlineLibraryTab from '@/views/MainWindow/OnlineLibraryTab/index.vue'
import TemplateEditor from '@/views/MainWindow/TemplatesTab/components/TemplateEditor.vue'
import TemplateEditorPage from '@/views/MainWindow/TemplatesTab/components/TemplateEditorPage.vue'

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
      path: '/files/midi/:filename',
      name: 'files-midi-detail',
      component: MidiDetailPage,
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
      component: TemplateEditor,
    },
    {
      path: '/templates/new',
      name: 'templates-create',
      component: TemplateEditorPage,
    },
    {
      path: '/templates/:id/edit',
      name: 'templates-edit',
      component: TemplateEditorPage,
    },
    {
      path: '/online-library',
      name: 'online-library',
      component: OnlineLibraryTab,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'files-all' },
    },
  ],
})
