import type { DataSourceObjectResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import { toAvailableDataset } from './auth-functions'
import {
  buildNotionDataSource,
  buildRichText,
} from '../../../test/fixtures/notion'

function dataSource(
  overrides: Partial<
    Pick<DataSourceObjectResponse, 'title' | 'description' | 'icon' | 'cover'>
  > = {},
): DataSourceObjectResponse {
  return buildNotionDataSource({
    id: 'dataset-id',
    title: [...buildRichText('Project '), ...buildRichText('Atlas')],
    description: [...buildRichText('First '), ...buildRichText('second')],
    ...overrides,
  })
}

describe('available-dataset normalization', () => {
  it('joins every title and description fragment', () => {
    expect(toAvailableDataset(dataSource())).toEqual({
      id: 'dataset-id',
      title: 'Project Atlas',
      description: 'First second',
      iconUrl: undefined,
      coverUrl: undefined,
    })
  })

  it('applies fallbacks after joining empty fragments', () => {
    expect(
      toAvailableDataset(
        dataSource({
          title: [{ plain_text: '' }] as DataSourceObjectResponse['title'],
          description: [
            { plain_text: '' },
          ] as DataSourceObjectResponse['description'],
        }),
      ),
    ).toEqual({
      id: 'dataset-id',
      title: 'Untitled',
      description: undefined,
      iconUrl: undefined,
      coverUrl: undefined,
    })
  })

  it.each([
    [
      'file icon',
      { type: 'file', file: { url: 'https://files.test/icon' } },
      'https://files.test/icon',
    ],
    [
      'external icon',
      { type: 'external', external: { url: 'https://external.test/icon' } },
      'https://external.test/icon',
    ],
    [
      'custom emoji',
      {
        type: 'custom_emoji',
        custom_emoji: { url: 'https://emoji.test/icon' },
      },
      'https://emoji.test/icon',
    ],
  ] as const)('maps a %s URL', (_label, icon, expectedUrl) => {
    expect(
      toAvailableDataset(
        dataSource({
          icon: icon as DataSourceObjectResponse['icon'],
        }),
      ).iconUrl,
    ).toBe(expectedUrl)
  })

  it.each([
    [
      'file',
      { type: 'file', file: { url: 'https://files.test/cover' } },
      'https://files.test/cover',
    ],
    [
      'external',
      { type: 'external', external: { url: 'https://external.test/cover' } },
      'https://external.test/cover',
    ],
  ] as const)('maps a %s cover URL', (_label, cover, expectedUrl) => {
    expect(
      toAvailableDataset(
        dataSource({
          cover: cover as DataSourceObjectResponse['cover'],
        }),
      ).coverUrl,
    ).toBe(expectedUrl)
  })
})
