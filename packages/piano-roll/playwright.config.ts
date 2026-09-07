import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  use: {
    browserName: 'chromium',
    channel: process.env.PIANO_ROLL_BROWSER_CHANNEL || undefined,
    viewport: { width: 1100, height: 850 },
  },
})
