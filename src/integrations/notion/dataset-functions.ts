import { createServerFn } from '@tanstack/react-start'
import {
  createNokaddoDataset,
  ensureNokaddoReviewProperties,
  getStoredCardConfigurations,
  insertCardConfiguration,
  queryNotionDatasetItems,
} from './dataset-server'
import {
  validateCompleteDatasetConnectionInput,
  validateDatasetId,
  validateGetNotionDatasetItemsInput,
} from './dataset-input-validators'
import { toAvailableDataset } from './auth-functions'
import { setCardGroups } from './card-functions'
import { withNotionClient } from './client-server'
import { hasAvailableDatasetFields } from './dataset-response-validators'
import { validateCardConfigurationAgainstDataset } from './dataset-semantic-validators'
import { AppError } from '#/lib/errors'
import type { CardConfigurationInput } from './types'

export const getNotionDataset = createServerFn({ method: 'GET' })
  .validator(validateDatasetId)
  .handler(async ({ data }) => {
    const { dataSetId } = data
    const dataset = await withNotionClient(async (notion) => {
      const result = await notion.dataSources.retrieve({
        data_source_id: dataSetId,
      })

      if (
        !hasAvailableDatasetFields(result) ||
        !Object.hasOwn(result, 'properties')
      ) {
        throw new Error('Dataset did not provide required fields')
      }

      return {
        ...result,
        ...toAvailableDataset(result),
      }
    })
    return dataset
  })

export const getNotionDatasetItems = createServerFn({ method: 'GET' })
  .validator(validateGetNotionDatasetItemsInput)
  .handler(({ data }) => queryNotionDatasetItems(data))

export const completeDatasetConnection = createServerFn({ method: 'POST' })
  .validator(validateCompleteDatasetConnectionInput)
  .handler(async ({ data }) =>
    withNotionClient(async (notion) => {
      const sourceDataset = await notion.dataSources.retrieve({
        data_source_id: data.dataSetId,
      })

      if (!Object.hasOwn(sourceDataset, 'properties')) {
        throw new Error('Dataset did not provide a property schema')
      }

      validateCardConfigurationAgainstDataset(data, sourceDataset.properties)

      const existingCardConfigurations = data.nokaddoDatasetId
        ? await getStoredCardConfigurations(notion, data.nokaddoDatasetId)
        : []
      const existingConfigurationId = enforceOneActiveDeckGuard(
        data,
        existingCardConfigurations,
      )

      if (existingConfigurationId && data.nokaddoDatasetId) {
        return {
          nokaddoDatasetId: data.nokaddoDatasetId,
          existingCardConfigurations,
          cardConfigurationId: existingConfigurationId,
        }
      }

      const nokaddoDatasetId =
        data.nokaddoDatasetId ?? (await createNokaddoDataset(notion))

      await ensureNokaddoReviewProperties(notion, data.dataSetId)

      const groupKeys =
        data.groupingColumnName && data.groupingColumnId
          ? await setCardGroups(notion, {
              dataSetId: data.dataSetId,
              groupingColumnName: data.groupingColumnName,
              groupingColumnId: data.groupingColumnId,
            })
          : []
      const cardConfigurationId = await insertCardConfiguration(
        notion,
        nokaddoDatasetId,
        data,
        groupKeys,
      )

      return {
        nokaddoDatasetId,
        existingCardConfigurations,
        cardConfigurationId,
      }
    }),
  )

/**
 * Temporary orchestration-only one-active-deck policy. Keep this isolated so
 * the guard and its conflict contract can be removed without changing Notion's
 * durable schema when the connection workflow becomes local-first.
 */
function enforceOneActiveDeckGuard(
  requested: CardConfigurationInput,
  existingConfigurations: Awaited<
    ReturnType<typeof getStoredCardConfigurations>
  >,
) {
  const active = existingConfigurations.filter(
    (configuration) => configuration.dataSetId === requested.dataSetId,
  )

  if (active.length === 0) return null

  if (
    active.length === 1 &&
    active[0].groupingColumnId === requested.groupingColumnId &&
    sameOrderedValues(active[0].frontColumnIds, requested.frontColumnIds) &&
    sameOrderedValues(active[0].backColumnIds, requested.backColumnIds)
  ) {
    return active[0].id
  }

  throw new AppError('conflict')
}

function sameOrderedValues(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
