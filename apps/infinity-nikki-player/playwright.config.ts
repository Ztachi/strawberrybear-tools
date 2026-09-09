import { defineConfig } from '@playwright/test'

/** 验证真实页面和 ConfigProvider；桌面调用使用只读 IPC fixture，不执行实际播放。 */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:1432',
    browserName: 'chromium',
    channel: process.env.PIANO_ROLL_BROWSER_CHANNEL || undefined,
    viewport: { width: 1100, height: 850 },
  },
  webServer: {
    command: 'pnpm dev --port 1432',
    url: 'http://localhost:1432',
    reuseExistingServer: !process.env.CI,
  },
})
