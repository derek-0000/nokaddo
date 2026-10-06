import type { Reporter } from 'vitest/reporters'

export default class FailOnProcessTimeoutReporter implements Reporter {
  onProcessTimeout() {
    process.exitCode = 1
    console.error(
      'Vitest teardown timed out because the suite leaked an open handle.',
    )
  }
}
