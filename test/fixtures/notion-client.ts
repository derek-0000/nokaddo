import type { Client } from '@notionhq/client'

type DatabaseEndpoints = Partial<
  Pick<Client['databases'], 'create' | 'retrieve'>
>
type DataSourceEndpoints = Partial<
  Pick<Client['dataSources'], 'create' | 'query' | 'retrieve' | 'update'>
>
type PageEndpoints = Partial<
  Pick<Client['pages'], 'create' | 'retrieve' | 'update'>
>

export type NotionClientDoubleEndpoints = {
  search?: Client['search']
  databases?: DatabaseEndpoints
  dataSources?: DataSourceEndpoints
  pages?: PageEndpoints
}

/**
 * Builds the structural subset of the Notion SDK client used by a test.
 *
 * The SDK exposes a large concrete client rather than an endpoint interface, so
 * the single structural cast lives here. Each supplied endpoint still has to
 * satisfy the exact corresponding SDK method signature.
 */
export function buildNotionClientDouble(
  endpoints: NotionClientDoubleEndpoints,
): Client {
  return endpoints as unknown as Client
}
