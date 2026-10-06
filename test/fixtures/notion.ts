import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  PartialPageObjectResponse,
  QueryDataSourceResponse,
  RichTextItemResponse,
  SearchResponse,
} from '@notionhq/client'
import { createFixtureBuilder } from './build'

const fixtureTimestamp = '2026-07-30T00:00:00.000Z'
const fixtureUser = { object: 'user', id: 'fixture-user-id' } as const

export const buildRichText = (content: string): RichTextItemResponse[] => [
  {
    type: 'text',
    text: { content, link: null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    plain_text: content,
    href: null,
  },
]

export const buildNotionTitlePageProperty = (
  value: Extract<
    PageObjectResponse['properties'][string],
    { type: 'title' }
  >['title'],
  id = 'fixture-property-id',
): Extract<PageObjectResponse['properties'][string], { type: 'title' }> => ({
  id,
  type: 'title',
  title: value,
})

export const buildNotionCheckboxPageProperty = (
  value: boolean,
  id = 'fixture-property-id',
): Extract<PageObjectResponse['properties'][string], { type: 'checkbox' }> => ({
  id,
  type: 'checkbox',
  checkbox: value,
})

export const buildNotionCheckboxDataSourceProperty = (
  id = 'fixture-property-id',
  name = 'Fixture property',
): Extract<
  DataSourceObjectResponse['properties'][string],
  { type: 'checkbox' }
> => ({
  id,
  name,
  description: null,
  type: 'checkbox',
  checkbox: {},
})

export const buildNotionDateDataSourceProperty = (
  id = 'fixture-property-id',
  name = 'Fixture property',
): Extract<
  DataSourceObjectResponse['properties'][string],
  { type: 'date' }
> => ({
  id,
  name,
  description: null,
  type: 'date',
  date: {},
})

export const buildNotionPage = createFixtureBuilder<PageObjectResponse>(() => ({
  object: 'page',
  id: 'fixture-page-id',
  created_time: fixtureTimestamp,
  last_edited_time: fixtureTimestamp,
  in_trash: false,
  archived: false,
  is_archived: false,
  is_locked: false,
  url: 'https://notion.test/fixture-page-id',
  public_url: null,
  parent: {
    type: 'data_source_id',
    data_source_id: 'fixture-data-source-id',
    database_id: 'fixture-database-id',
  },
  properties: {},
  icon: null,
  cover: null,
  created_by: fixtureUser,
  last_edited_by: fixtureUser,
}))

export const buildNotionDataSource =
  createFixtureBuilder<DataSourceObjectResponse>(() => ({
    object: 'data_source',
    id: 'fixture-data-source-id',
    title: buildRichText('Fixture dataset'),
    description: [],
    parent: { type: 'database_id', database_id: 'fixture-database-id' },
    database_parent: { type: 'workspace', workspace: true },
    is_inline: false,
    in_trash: false,
    archived: false,
    created_time: fixtureTimestamp,
    last_edited_time: fixtureTimestamp,
    created_by: fixtureUser,
    last_edited_by: fixtureUser,
    properties: {},
    icon: null,
    cover: null,
    url: 'https://notion.test/fixture-data-source-id',
    public_url: null,
  }))

export const buildPartialNotionPage =
  createFixtureBuilder<PartialPageObjectResponse>(() => ({
    object: 'page',
    id: 'fixture-partial-page-id',
  }))

const notionListDefaults = {
  type: 'page_or_data_source' as const,
  page_or_data_source: {},
  object: 'list' as const,
  next_cursor: null,
  has_more: false,
  results: [],
}

export const buildNotionQueryResponse =
  createFixtureBuilder<QueryDataSourceResponse>(() => ({
    ...notionListDefaults,
  }))

export const buildNotionSearchResponse = createFixtureBuilder<SearchResponse>(
  () => ({
    ...notionListDefaults,
  }),
)
