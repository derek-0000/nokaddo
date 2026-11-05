import type {
  DataSourceObjectResponse,
  PageObjectResponse,
} from '@notionhq/client'
import { getNotionProperty } from './response-validators'

export const NOKADDO_REVIEW_PROPERTIES = {
  visited: 'nkdo-visited',
  completed: 'nkdo-completed',
  lastVisitedAt: 'nkdo-last-visited-at',
  completedAt: 'nkdo-completed-at',
  selectCorrect: 'nkdo-select-correct',
  writeCorrect: 'nkdo-write-correct',
} as const

export const NOKADDO_REVIEW_PROPERTY_TYPES = {
  [NOKADDO_REVIEW_PROPERTIES.visited]: 'checkbox',
  [NOKADDO_REVIEW_PROPERTIES.completed]: 'checkbox',
  [NOKADDO_REVIEW_PROPERTIES.lastVisitedAt]: 'date',
  [NOKADDO_REVIEW_PROPERTIES.completedAt]: 'date',
  [NOKADDO_REVIEW_PROPERTIES.selectCorrect]: 'checkbox',
  [NOKADDO_REVIEW_PROPERTIES.writeCorrect]: 'checkbox',
} as const

export const ACTIVITY_RESULT_PROPERTIES = {
  select: NOKADDO_REVIEW_PROPERTIES.selectCorrect,
  write: NOKADDO_REVIEW_PROPERTIES.writeCorrect,
} as const

const NOKADDO_REVIEW_PROPERTY_NAMES = new Set<string>(
  Object.values(NOKADDO_REVIEW_PROPERTIES),
)

export function isNokaddoReviewPropertyName(name: string) {
  return NOKADDO_REVIEW_PROPERTY_NAMES.has(name)
}

type DataSourceProperty = DataSourceObjectResponse['properties'][string]
type CheckboxDataSourceProperty = Extract<
  DataSourceProperty,
  { type: 'checkbox' }
>

export function validateReviewPropertyType<
  TExpectedType extends DataSourceProperty['type'],
>(
  property: DataSourceProperty,
  propertyName: string,
  expectedType: TExpectedType,
): asserts property is Extract<DataSourceProperty, { type: TExpectedType }> {
  if (property.type !== expectedType) {
    throw new Error(
      `Notion property "${propertyName}" must be "${expectedType}", received "${property.type}"`,
    )
  }
}

export function requireReviewCheckboxColumn(
  properties: DataSourceObjectResponse['properties'],
  propertyName: string,
): CheckboxDataSourceProperty {
  const property = getNotionProperty(properties, propertyName)

  if (!property) {
    throw new Error(`Notion property "${propertyName}" could not be found`)
  }

  validateReviewPropertyType(property, propertyName, 'checkbox')
  return property
}

export function getReviewCheckbox(
  properties: PageObjectResponse['properties'],
  propertyName: string,
) {
  const property = getNotionProperty(properties, propertyName)
  return property?.type === 'checkbox' && property.checkbox
}
