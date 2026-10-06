# Test harness

`pnpm test` runs every unit and integration project once. Use the narrower
scripts while developing:

- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:hygiene`
- `pnpm test:watch`
- `pnpm test:coverage`
- `pnpm typecheck`

Test files are shuffled on every run to expose cross-file state leaks while
individual test order remains stable.

`pnpm test` first rejects focused and disabled tests, including conditional
skip APIs. Vitest also rejects focused tests directly, fails on unhandled
errors, and turns teardown timeouts caused by leaked handles into failures.

## File conventions

- `*.test.ts`: Node unit test (the existing default).
- `*.{component,dom,router}.test.{ts,tsx}`: jsdom unit test.
- `*.integration.test.{ts,tsx}`: Node/server integration test.
- `*.{component,dom,router}.integration.test.{ts,tsx}`: jsdom integration
  test.

All projects install a fail-closed `fetch` implementation. Tests that exercise
an infrastructure boundary must replace it explicitly. The jsdom projects also
install fake IndexedDB and clean React DOM, browser storage, and every fake
IndexedDB database after each test.

Use `createTestQueryClient` or the render utilities in `test/support/` so query
retries are disabled and clients are disposed automatically. Fixture builders
belong in `test/fixtures/`; `createFixtureBuilder` supplies the common typed
override behavior while domain fixture families are added alongside their first
tests.

Coverage is collected separately under `coverage/unit/` and
`coverage/integration/`. The committed thresholds in `vitest.config.ts` are the
initial ratchet: raise the relevant baseline when coverage increases and explain
any intentional reduction in the same change. The current-suite baselines are
unit 25.97% statements, 30.88% branches, 22.65% functions, and 25.77% lines;
integration 90.49% statements, 83.27% branches, 92.65% functions, and 92.42%
lines.
