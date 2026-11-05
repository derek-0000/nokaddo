import { useReducer } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { DatasetCardFields } from '../dataset-configuration/dataset-card-customizer'
import DatasetConnectionModeSelect from '../dataset-configuration/dataset-connection-mode-select'
import DatasetConnectionColumnGroupingList from '../dataset-configuration/dataset-connection-column-grouping-list'
import DatasetActivitySettings from '../dataset-configuration/dataset-activity-settings'
import {
  createActivitySettings,
  datasetConnectionReducer,
  hasValidActivitySettings,
  toActivityConfiguration,
} from '../dataset-configuration/dataset-connection-reducer'
import type { DatasetConnectionState } from '../dataset-configuration/dataset-connection-reducer'
import { Button } from '#/components/ui/button'
import {
  notionKeys,
  notionMutations,
  notionQueries,
} from '#/integrations/notion/api'
import type { CardGroups, NotionDataset } from '#/integrations/notion/api'
import { isNokaddoReviewPropertyName } from '#/integrations/notion/review-property-validators'
import { isCategoryPropertyType } from '#/integrations/notion/types'
import { toPublicError } from '#/lib/errors'

export default function DeckConfigurationEditor({
  cardGroup,
  dataset,
  onSaved,
}: {
  cardGroup: CardGroups[number]
  dataset: NotionDataset
  onSaved: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [configuration, dispatch] = useReducer(datasetConnectionReducer, {
    mode: cardGroup.groupingColumnId === null ? 'single' : 'grouped',
    groupingColumnId: cardGroup.groupingColumnId,
    bindings: {
      front: cardGroup.frontColumnIds,
      back: cardGroup.backColumnIds,
    },
    activities: createActivitySettings(cardGroup),
  })
  const save = useMutation({
    ...notionMutations.updateCardGroup(),
    onSuccess: async ({ groupingColumnId }) => {
      const groupingColumnName =
        groupingColumnId === null
          ? null
          : (Object.values(dataset.properties).find(
              (column) => column.id === groupingColumnId,
            )?.name ?? null)
      queryClient.setQueriesData<CardGroups>(
        { queryKey: notionKeys.cardGroupsAll },
        (cardGroups) =>
          cardGroups?.map((group) =>
            group.id === cardGroup.id
              ? {
                  ...group,
                  groupingColumnId,
                  groupingColumnName,
                  groupKeys: groupingColumnId === null ? [] : group.groupKeys,
                  ...toActivityConfiguration(configuration.activities),
                }
              : group,
          ),
      )
      queryClient.removeQueries({
        queryKey: notionKeys.cardGroupStudyData(cardGroup.id),
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: notionKeys.cardGroupConfig(cardGroup.id),
        }),
        queryClient.invalidateQueries({
          queryKey: notionKeys.cardGroupsAll,
          refetchType: 'all',
        }),
      ])
      queryClient.setQueryData(
        notionKeys.cardGroupNavigation(cardGroup.id),
        groupingColumnId === null ? 'study' : 'groups',
      )
      try {
        await queryClient.fetchQuery(
          notionQueries.cardGroupStudyData(cardGroup.id),
        )
        await router.invalidate()

        if (groupingColumnId === null) {
          await router.navigate({
            to: '/app/$deckId/study',
            params: { deckId: cardGroup.id },
            search: {},
            replace: true,
          })
        } else {
          await router.navigate({
            to: '/app/$deckId/groups',
            params: { deckId: cardGroup.id },
            search: {},
            replace: true,
          })
        }
        onSaved()
      } catch (error) {
        queryClient.setQueryData(
          notionKeys.cardGroupNavigation(cardGroup.id),
          null,
        )
        throw error
      }
    },
  })
  const columns = Object.values(dataset.properties).filter(
    (column) => !isNokaddoReviewPropertyName(column.name),
  )
  const groupingColumns = columns.filter((column) =>
    isCategoryPropertyType(column.type),
  )
  const valid =
    configuration.bindings.front.length > 0 &&
    [...configuration.bindings.front, ...configuration.bindings.back].every(
      (id) => columns.some((column) => column.id === id),
    ) &&
    (configuration.mode === 'single' ||
      groupingColumns.some(
        (column) => column.id === configuration.groupingColumnId,
      )) &&
    hasValidActivitySettings(
      configuration.activities,
      new Set(columns.map((column) => column.id)),
    )
  const dirty = configurationIsDirty(configuration, cardGroup)
  const canSave = valid && dirty && !save.isPending
  function submitConfiguration() {
    if (!canSave) return
    save.mutate({
      data: {
        dataGroupId: cardGroup.id,
        groupingColumnId:
          configuration.mode === 'grouped'
            ? configuration.groupingColumnId
            : null,
        frontColumnIds: configuration.bindings.front,
        backColumnIds: configuration.bindings.back,
        ...toActivityConfiguration(configuration.activities),
      },
    })
  }
  return (
    <form action={submitConfiguration}>
      <fieldset
        disabled={save.isPending}
        className="flex min-w-0 flex-col gap-4"
      >
        <DatasetConnectionModeSelect
          value={configuration.mode}
          onValueChange={(mode) => dispatch({ type: 'mode-changed', mode })}
        />
        {configuration.mode === 'grouped' && (
          <DatasetConnectionColumnGroupingList
            columns={groupingColumns}
            layout="compact"
            value={configuration.groupingColumnId}
            onValueChange={(columnId) =>
              dispatch({ type: 'grouping-column-changed', columnId })
            }
          />
        )}
        <DatasetCardFields
          layout="sections"
          columns={columns}
          bindings={configuration.bindings}
          onBindColumn={(face, index, columnId) =>
            dispatch({ type: 'card-field-bound', face, index, columnId })
          }
          onRemoveField={(face, index) =>
            dispatch({ type: 'card-field-removed', face, index })
          }
        />
        <DatasetActivitySettings
          columns={columns}
          activities={configuration.activities}
          onToggleActivity={(activity, enabled) =>
            dispatch({ type: 'activity-toggled', activity, enabled })
          }
          onActivityColumnsChange={(activity, columnIds) =>
            dispatch({ type: 'activity-columns-changed', activity, columnIds })
          }
        />
        {save.isError && (
          <p role="alert" className="text-xs text-destructive">
            {toPublicError(save.error).message}
          </p>
        )}
        <Button type="submit" disabled={!canSave}>
          {save.isPending ? 'Saving…' : 'Save configuration'}
        </Button>
      </fieldset>
    </form>
  )
}

function configurationIsDirty(
  configuration: DatasetConnectionState,
  cardGroup: CardGroups[number],
) {
  const groupingColumnId =
    configuration.mode === 'grouped' ? configuration.groupingColumnId : null
  const activities = toActivityConfiguration(configuration.activities)

  return (
    groupingColumnId !== cardGroup.groupingColumnId ||
    !columnIdsEqual(configuration.bindings.front, cardGroup.frontColumnIds) ||
    !columnIdsEqual(configuration.bindings.back, cardGroup.backColumnIds) ||
    !columnIdsEqual(
      activities.selectOptionColumnIds,
      cardGroup.selectOptionColumnIds,
    ) ||
    activities.writeAnswerColumnId !== cardGroup.writeAnswerColumnId
  )
}

function columnIdsEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  )
}
