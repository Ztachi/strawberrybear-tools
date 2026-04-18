/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:22:01
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:22:01
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/i18n/zh-CN.ts
 * @Description:
 */
/**
 * @fileOverview 中文（简体）语言包
 * @description zh-CN 翻译文件，所有用户可见文本
 * @author strawberrybear
 * @date 2026-04-18
 */

export default {
  common: {
    button: {
      scan: '扫描',
      scanning: '扫描中...',
      sync: '同步',
      syncing: '同步中...',
      import: '导入文件',
      copy: '复制结果',
      copied: '已复制',
      settings: '设置',
      backToMainSite: '回到主站',
      confirm: '确认',
      cancel: '取消',
      close: '关闭',
    },
    status: {
      success: '成功',
      error: '错误',
      loading: '加载中...',
    },
  },
  app: {
    title: '敏感词检测',
    subtitle: '本地单机版敏感词检测工具',
  },
  page: {
    home: {
      inputLabel: '待检测文本',
      inputPlaceholder: '粘贴或输入要检测的文本内容，或上传 .txt 文件...',
      uploadHint: '支持上传 .txt 文件',
      resultLabel: '检测结果',
      resultEmpty: '请输入文本并点击「扫描」按钮',
      resultEmptyHint: '敏感词将按风险等级高亮显示',
    },
  },
  lexicon: {
    title: '词库管理',
    manage: '词汇管理',
    add: '新增词汇库',
    edit: '编辑词汇库',
    import: '导入本地词库',
    addSuccess: '词汇库新增成功',
    updateSuccess: '词汇库更新成功',
    deleteSuccess: '词汇库删除成功',
    deleteFailed: '删除失败：{error}',
    deleteTitle: '确认删除',
    deleteConfirm: '确认删除词汇库「{name}」吗？此操作会同时删除对应词条。',
    wordCount: '{count} 个词条',
    wordCountEmpty: '词库为空',
    lastUpdated: '最后更新：{time}',
    neverUpdated: '从未同步',
    syncSuccess: '词库同步成功，共 {count} 个词条',
    syncFailed: '同步失败：{error}',
    importSuccess: '导入成功，新增 {count} 个词条',
    importFailed: '导入失败：{error}',
    syncProgress: '正在同步 ({current}/{total})...',
    table: {
      name: '名称',
      url: '地址',
      lastUpdated: '最后更新时间',
      actions: '操作',
    },
    form: {
      name: '名称',
      url: '地址',
    },
    status: {
      success: '已同步',
      failed: '未同步/同步失败',
    },
    action: {
      enable: '启用',
      disable: '停用',
      edit: '编辑',
      delete: '删除',
    },
  },
  risk: {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    summary: '共命中 {total} 处',
    summaryDetail: '高风险 {high} | 中风险 {medium} | 低风险 {low}',
    noResult: '未发现敏感词',
    copyReport: '[敏感词检测报告]',
    copyOriginal: '原文：',
    copyNoMatch: '未发现敏感词',
    typeLabel: '类型',
    typeOther: '其他',
  },
  settings: {
    title: '扫描设置',
    caseSensitive: '区分大小写',
    caseSensitiveHint: '开启后"ABC"和"abc"视为不同词',
    ignorePunctuation: '忽略标点符号',
    ignorePunctuationHint: '开启后扫描时会跳过标点字符',
  },
}
