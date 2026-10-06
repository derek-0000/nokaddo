import { defineConfig } from 'vitest/config'
import FailOnProcessTimeoutReporter from './test/support/fail-on-process-timeout-reporter'

const unitProjects = ['node-unit', 'jsdom-unit']
const integrationProjects = ['node-integration', 'jsdom-integration']
const coverageSuite = process.env.TEST_SUITE

const coverageThresholds =
  coverageSuite === 'unit'
    ? {
        branches: 30.88,
        functions: 22.65,
        lines: 25.77,
        statements: 25.97,
      }
    : coverageSuite === 'integration'
      ? {
          branches: 83.27,
          functions: 92.65,
          lines: 92.42,
          statements: 90.49,
        }
      : undefined

export default defineConfig({
  test: {
    allowOnly: false,
    dangerouslyIgnoreUnhandledErrors: false,
    reporters: ['default', new FailOnProcessTimeoutReporter()],
    coverage: {
      exclude: [
        'src/routeTree.gen.ts',
        'src/integrations/tanstack-query/devtools.tsx',
      ],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: `coverage/${coverageSuite ?? 'all'}`,
      thresholds: coverageThresholds,
    },
    sequence: {
      shuffle: {
        files: true,
        tests: false,
      },
    },
    teardownTimeout: 10_000,
    projects: [
      {
        test: {
          name: unitProjects[0],
          environment: 'node',
          include: ['{src,test}/**/*.test.ts'],
          exclude: [
            '**/*.integration.test.*',
            '**/*.{component,dom,router}.test.*',
          ],
          setupFiles: ['./test/setup/node.ts'],
        },
      },
      {
        test: {
          name: unitProjects[1],
          environment: 'jsdom',
          include: ['{src,test}/**/*.{component,dom,router}.test.{ts,tsx}'],
          setupFiles: ['./test/setup/jsdom.ts'],
        },
      },
      {
        test: {
          name: integrationProjects[0],
          environment: 'node',
          include: ['{src,test}/**/*.integration.test.{ts,tsx}'],
          exclude: ['**/*.{component,dom,router}.integration.test.*'],
          setupFiles: ['./test/setup/node.ts'],
        },
      },
      {
        test: {
          name: integrationProjects[1],
          environment: 'jsdom',
          include: [
            '{src,test}/**/*.{component,dom,router}.integration.test.{ts,tsx}',
          ],
          setupFiles: ['./test/setup/jsdom.ts'],
        },
      },
    ],
  },
})
