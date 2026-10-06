export type FixtureOverrides<T> = Partial<T> | ((fixture: T) => T)

export const createFixtureBuilder =
  <T>(defaults: () => T) =>
  (overrides: FixtureOverrides<T> = {}): T => {
    const fixture = defaults()

    return typeof overrides === 'function'
      ? overrides(fixture)
      : { ...fixture, ...overrides }
  }
