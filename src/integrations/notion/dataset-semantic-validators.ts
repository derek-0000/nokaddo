import type { DataSourceObjectResponse } from '@notionhq/client'
import { AppError } from '#/lib/errors'
import { normalizeNotionPropertyId } from './helpers'
import { isNokaddoReviewPropertyName } from './review-property-validators'
import type { CardConfigurationInput } from './types'
import { isCategoryPropertyType } from './types'

/**
 * Validates a structurally valid card configuration against the current source
 * data-source schema before any remote mutation is allowed.
 */
export function validateCardConfigurationAgainstDataset(
  configuration: Pick<
    CardConfigurationInput,
    | 'frontColumnIds'
    | 'backColumnIds'
    | 'groupingColumnName'
    | 'groupingColumnId'
  >,
  properties: DataSourceObjectResponse['properties'],
): void {
  const propertyIds = new Set(
    Object.values(properties).map(({ id }) => normalizeNotionPropertyId(id)),
  )
  const reviewPropertyIds = new Set(
    Object.values(properties)
      .filter((property) => isNokaddoReviewPropertyName(property.name))
      .map((property) => normalizeNotionPropertyId(property.id)),
  )
  const referencedIds = [
    ...configuration.frontColumnIds,
    ...configuration.backColumnIds,
  ]
  const groupingProperty =
    configuration.groupingColumnName === null
      ? undefined
      : properties[configuration.groupingColumnName]

  if (
    referencedIds.some((id) => {
      const normalizedId = normalizeNotionPropertyId(id)
      return (
        !propertyIds.has(normalizedId) || reviewPropertyIds.has(normalizedId)
      )
    }) ||
    (configuration.groupingColumnName !== null &&
      (!Object.hasOwn(properties, configuration.groupingColumnName) ||
        !groupingProperty ||
        normalizeNotionPropertyId(groupingProperty.id) !==
          normalizeNotionPropertyId(configuration.groupingColumnId ?? '') ||
        !isCategoryPropertyType(groupingProperty.type)))
  ) {
    throw new AppError('validation')
  }
}
