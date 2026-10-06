import { useId, useReducer, useState } from 'react'
import type { MouseEvent, ReactNode, SubmitEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import DatasetCardCustomizer from './dataset-card-customizer'
import DatasetConnectionPreview from './dataset-connection-preview'
import {
  createDatasetConnectionState,
  datasetConnectionReducer,
} from './dataset-connection-reducer'
import DatasetConnectionSetup from './dataset-connection-setup'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import {
  workspaceRegistryKeys,
  workspaceRegistryMutations,
} from '#/integrations/kv/api'
import { notionKeys, notionMutations } from '#/integrations/notion/api'
import type { NotionDataset } from '#/integrations/notion/api'
import { isCategoryPropertyType } from '#/integrations/notion/types'

type DatasetConnectionProps = {
  dataset: NotionDataset
  workspaceId: string
  appDatasetId: string | null
}

export default function DatasetConnection({
  dataset,
  workspaceId,
  appDatasetId,
}: DatasetConnectionProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const stepTabsId = useId()
  const columns = Object.values(dataset.properties).map((property) => ({
    id: property.id,
    name: property.name,
    type: property.type,
  }))
  const groupingColumns = columns.filter(({ type }) =>
    isCategoryPropertyType(type),
  )
  const [stepIndex, setStepIndex] = useState(0)
  const [connection, dispatch] = useReducer(
    datasetConnectionReducer,
    groupingColumns,
    createDatasetConnectionState,
  )
  const completeConnection = useMutation(
    notionMutations.completeDatasetConnection(),
  )
  const persistConnection = useMutation({
    ...workspaceRegistryMutations.setAppDatasetId(workspaceId),
    onSuccess: async (persistedDatasetId) => {
      queryClient.setQueryData(
        workspaceRegistryKeys.appDatasetId(workspaceId),
        persistedDatasetId,
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: notionKeys.cardGroups(persistedDatasetId),
        }),
        queryClient.invalidateQueries({
          queryKey: notionKeys.availableDatasetPages(persistedDatasetId),
        }),
      ])
      await navigate({ to: '/app' })
    },
  })

  const steps = [
    {
      id: 'setup',
      label: 'Connection',
      content: (
        <DatasetConnectionSetup
          columns={groupingColumns}
          mode={connection.mode}
          groupingColumnId={connection.groupingColumnId}
          onModeChange={(mode) => dispatch({ type: 'mode-changed', mode })}
          onGroupingColumnChange={(columnId) =>
            dispatch({ type: 'grouping-column-changed', columnId })
          }
        />
      ),
    },
    {
      id: 'customizer',
      label: 'Card customizer',
      content: (
        <DatasetCardCustomizer
          columns={columns}
          bindings={connection.bindings}
          onBindColumn={(face, index, columnId) =>
            dispatch({ type: 'card-field-bound', face, index, columnId })
          }
          onRemoveField={(face, index) =>
            dispatch({ type: 'card-field-removed', face, index })
          }
        />
      ),
    },
    {
      id: 'preview',
      label: 'Preview',
      content: (
        <DatasetConnectionPreview
          datasetId={dataset.id}
          columns={columns}
          mode={connection.mode}
          groupingColumnId={
            connection.mode === 'grouped' ? connection.groupingColumnId : null
          }
          bindings={connection.bindings}
        />
      ),
    },
  ]

  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === steps.length - 1
  const validColumnIds = new Set(columns.map(({ id }) => id))
  const validGroupingColumnIds = new Set(groupingColumns.map(({ id }) => id))
  const hasValidFace = (face: 'front' | 'back', minimum: number) => {
    const fields = connection.bindings[face]

    return (
      fields.length >= minimum &&
      fields.length <= 4 &&
      new Set(fields).size === fields.length &&
      fields.every((field) => validColumnIds.has(field))
    )
  }
  const isValidConnection =
    hasValidFace('front', 1) &&
    hasValidFace('back', 0) &&
    (connection.mode === 'single' ||
      (connection.groupingColumnId !== null &&
        validGroupingColumnIds.has(connection.groupingColumnId)))
  const createdAppDatasetId = completeConnection.data?.nokaddoDatasetId ?? null
  const isSaving = completeConnection.isPending || persistConnection.isPending
  const isSaved = persistConnection.isSuccess
  const saveError = completeConnection.error ?? persistConnection.error

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isLastStep || isSaving || isSaved) return

    if (createdAppDatasetId) {
      persistConnection.mutate(createdAppDatasetId)
      return
    }

    if (!isValidConnection) return

    completeConnection.mutate(
      {
        data: {
          dataSetId: dataset.id,
          datasetTitle: dataset.title,
          datasetIcon: dataset.icon,
          groupingColumnName:
            connection.mode === 'grouped'
              ? (columns.find(({ id }) => id === connection.groupingColumnId)
                  ?.name ?? null)
              : null,
          groupingColumnId:
            connection.mode === 'grouped' ? connection.groupingColumnId : null,
          frontColumnIds: connection.bindings.front,
          backColumnIds: connection.bindings.back,
          nokaddoDatasetId: appDatasetId,
        },
      },
      {
        onSuccess: ({ nokaddoDatasetId: createdId }) =>
          persistConnection.mutate(createdId),
      },
    )
  }

  function handleNext(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (!isLastStep) setStepIndex((current) => current + 1)
  }

  function handleBack() {
    if (!isFirstStep) setStepIndex((current) => current - 1)
  }

  return (
    <DatasetConnectionForm
      steps={steps}
      stepIndex={stepIndex}
      stepTabsId={stepTabsId}
      setStepIndex={setStepIndex}
      onSubmit={handleSubmit}
      onNext={handleNext}
      onBack={handleBack}
      createdAppDatasetId={createdAppDatasetId}
      isValidConnection={isValidConnection}
      isSaving={isSaving}
      isSaved={isSaved}
      saveError={saveError}
    />
  )
}

type ConnectionStep = { id: string; label: string; content: ReactNode }

function DatasetConnectionForm({
  steps,
  stepIndex,
  stepTabsId,
  setStepIndex,
  onSubmit,
  onNext,
  onBack,
  createdAppDatasetId,
  isValidConnection,
  isSaving,
  isSaved,
  saveError,
}: {
  steps: ConnectionStep[]
  stepIndex: number
  stepTabsId: string
  setStepIndex: (index: number) => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  onNext: (event: MouseEvent<HTMLButtonElement>) => void
  onBack: () => void
  createdAppDatasetId: string | null
  isValidConnection: boolean
  isSaving: boolean
  isSaved: boolean
  saveError: unknown
}) {
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === steps.length - 1
  return (
    <form onSubmit={onSubmit} className="flex h-full min-h-0 w-full flex-col">
      <ConnectionStepPanels
        steps={steps}
        stepIndex={stepIndex}
        stepTabsId={stepTabsId}
      />
      <ConnectionStepTabs
        steps={steps}
        stepIndex={stepIndex}
        stepTabsId={stepTabsId}
        setStepIndex={setStepIndex}
      />
      <ConnectionActions
        onNext={onNext}
        onBack={onBack}
        state={connectionActionState({
          isFirstStep,
          isLastStep,
          canFinish: Boolean(createdAppDatasetId) || isValidConnection,
          isSaving,
          isSaved,
          saveError,
        })}
      />
    </form>
  )
}

function ConnectionStepPanels({
  steps,
  stepIndex,
  stepTabsId,
}: {
  steps: ConnectionStep[]
  stepIndex: number
  stepTabsId: string
}) {
  return steps.map((step, index) => (
    <div
      key={step.id}
      id={`${stepTabsId}-${step.id}-panel`}
      role="tabpanel"
      aria-labelledby={`${stepTabsId}-${step.id}-tab`}
      hidden={stepIndex !== index}
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden py-2"
    >
      {stepIndex === index ? step.content : null}
    </div>
  ))
}

function ConnectionStepTabs({
  steps,
  stepIndex,
  stepTabsId,
  setStepIndex,
}: {
  steps: ConnectionStep[]
  stepIndex: number
  stepTabsId: string
  setStepIndex: (index: number) => void
}) {
  return (
    <div
      className="flex w-full justify-center gap-1"
      role="tablist"
      aria-label="Setup steps"
    >
      {steps.map((step, index) => (
        <button
          key={step.id}
          id={`${stepTabsId}-${step.id}-tab`}
          type="button"
          role="tab"
          aria-selected={stepIndex === index}
          aria-controls={`${stepTabsId}-${step.id}-panel`}
          aria-label={step.label}
          onClick={() => setStepIndex(index)}
          className={cn(
            'size-1.5 rounded-full transition',
            stepIndex === index ? 'bg-primary' : 'bg-muted-foreground/35',
          )}
        />
      ))}
    </div>
  )
}

function ConnectionActions({
  onNext,
  onBack,
  state,
}: {
  onNext: (event: MouseEvent<HTMLButtonElement>) => void
  onBack: () => void
  state: ConnectionActionState
}) {
  if (state.kind === 'first') {
    return (
      <div className="py-3">
        {state.saveError ? <ConnectionSaveError /> : null}
        <Button type="button" className="w-full" size="lg" onClick={onNext}>
          Continue
        </Button>
      </div>
    )
  }
  return (
    <div className="py-3">
      {state.saveError ? <ConnectionSaveError /> : null}
      <div className="flex gap-1">
        <Button
          type="button"
          size="lg"
          onClick={onBack}
          aria-label="Previous step"
        >
          <ChevronLeft />
        </Button>
        {state.kind === 'finish' ? (
          <FinishButton state={state.finish} />
        ) : (
          <Button type="button" className="flex-1" size="lg" onClick={onNext}>
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}

type FinishState =
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'ready'; label: 'Retry' | 'Finish'; canFinish: boolean }

type ConnectionActionState =
  | { kind: 'first'; saveError: unknown }
  | { kind: 'middle'; saveError: unknown }
  | { kind: 'finish'; saveError: unknown; finish: FinishState }

function FinishButton({ state }: { state: FinishState }) {
  const label =
    state.kind === 'saving'
      ? 'Saving…'
      : state.kind === 'saved'
        ? 'Saved'
        : state.label
  return (
    <Button
      type="submit"
      className="flex-1"
      size="lg"
      disabled={state.kind !== 'ready' || !state.canFinish}
    >
      {label}
    </Button>
  )
}

function connectionActionState({
  isFirstStep,
  isLastStep,
  canFinish,
  isSaving,
  isSaved,
  saveError,
}: {
  isFirstStep: boolean
  isLastStep: boolean
  canFinish: boolean
  isSaving: boolean
  isSaved: boolean
  saveError: unknown
}): ConnectionActionState {
  if (isFirstStep) return { kind: 'first', saveError }
  if (!isLastStep) return { kind: 'middle', saveError }
  const finish: FinishState = isSaving
    ? { kind: 'saving' }
    : isSaved
      ? { kind: 'saved' }
      : {
          kind: 'ready',
          label: saveError ? 'Retry' : 'Finish',
          canFinish,
        }
  return { kind: 'finish', saveError, finish }
}

function ConnectionSaveError() {
  return (
    <p className="mb-2 text-center text-xs text-destructive" role="alert">
      We couldn&apos;t save this configuration. Please try again.
    </p>
  )
}
