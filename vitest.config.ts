// vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/**/*.test.ts',
      'functions/test/**/*.test.ts',
      'functions/src/**/*.test.ts',
      'src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['node_modules', 'functions/node_modules', 'dist', 'functions/lib'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
