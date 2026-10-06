import { isFullPage } from '@notionhq/client'
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
} from '@notionhq/client'

export function getNotionProperty<TProperty>(
  properties: Record<string, TProperty>,
  propertyName: string,
): TProperty | undefined {
  return Object.hasOwn(properties, propertyName)
    ? properties[propertyName]
    : undefined
}

export function requirePageProperties(
  response: PageObjectResponse | PartialPageObjectResponse,
  errorMessage: string,
) {
  if (!isFullPage(response)) {
    throw new Error(errorMessage)
  }

  return response.properties
}
