/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:22:01
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:22:03
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/i18n/en-US.ts
 * @Description:
 */
/**
 * @fileOverview English language pack
 * @description en-US translations for all user-visible text
 * @author strawberrybear
 * @date 2026-04-18
 */

export default {
  common: {
    button: {
      scan: 'Scan',
      scanning: 'Scanning...',
      sync: 'Sync',
      syncing: 'Syncing...',
      import: 'Import File',
      copy: 'Copy Result',
      copied: 'Copied',
      settings: 'Settings',
      backToMainSite: 'Main Site',
      confirm: 'Confirm',
      cancel: 'Cancel',
      close: 'Close',
    },
    status: {
      success: 'Success',
      error: 'Error',
      loading: 'Loading...',
    },
  },
  app: {
    title: 'Sensitive Word Checker',
    subtitle: 'Local offline sensitive word detection tool',
  },
  page: {
    home: {
      inputLabel: 'Text to Check',
      inputPlaceholder: 'Paste or type text to check, or upload a .txt file...',
      uploadHint: 'Supports .txt file upload',
      resultLabel: 'Detection Result',
      resultEmpty: 'Enter text and click "Scan"',
      resultEmptyHint: 'Sensitive words will be highlighted by risk level',
    },
  },
  lexicon: {
    title: 'Lexicon Management',
    manage: 'Manage Lexicons',
    add: 'Add Lexicon',
    edit: 'Edit Lexicon',
    import: 'Import Local Lexicon',
    addSuccess: 'Lexicon added',
    updateSuccess: 'Lexicon updated',
    deleteSuccess: 'Lexicon deleted',
    deleteFailed: 'Delete failed: {error}',
    deleteTitle: 'Confirm Delete',
    deleteConfirm: 'Delete lexicon "{name}" and all linked words?',
    clearAll: 'Clear All',
    clearSuccess: 'All lexicons cleared',
    clearConfirm: 'Clear all lexicons? This cannot be undone.',
    wordCount: '{count} words',
    wordCountEmpty: 'Lexicon is empty',
    lastUpdated: 'Updated: {time}',
    neverUpdated: 'Never synced',
    syncSuccess: 'Sync successful, {count} words loaded',
    syncFailed: 'Sync failed: {error}',
    syncInProgress: 'Syncing, please wait...',
    importSuccess: 'Import successful, {count} new words added',
    importFailed: 'Import failed: {error}',
    syncProgress: 'Syncing ({current}/{total})...',
    table: {
      name: 'Name',
      url: 'Address',
      lastUpdated: 'Updated At',
      actions: 'Actions',
    },
    form: {
      name: 'Name',
      url: 'Address',
    },
    status: {
      success: 'Synced',
      failed: 'Not synced / Failed',
    },
    action: {
      enable: 'Enable',
      disable: 'Disable',
      edit: 'Edit',
      delete: 'Delete',
    },
  },
  risk: {
    high: 'High Risk',
    medium: 'Medium Risk',
    low: 'Low Risk',
    summary: '{total} matches found',
    summaryDetail: 'High {high} | Medium {medium} | Low {low}',
    noResult: 'No sensitive words found',
    copyReport: '[Sensitive Word Detection Report]',
    copyOriginal: 'Original text: ',
    copyNoMatch: 'No sensitive words found',
    typeLabel: 'Type',
    typeOther: 'Other',
  },
  settings: {
    title: 'Scan Settings',
    caseSensitive: 'Case Sensitive',
    caseSensitiveHint: 'When enabled, "ABC" and "abc" are treated differently',
    ignorePunctuation: 'Ignore Punctuation',
    ignorePunctuationHint: 'When enabled, punctuation is skipped during scanning',
  },
}
