import { Link } from '@tanstack/react-router'
import { Database } from 'lucide-react'
import Card from '#/components/ui/card'
import DatasetIcon from '#/components/ui/dataset-icon'
import EmptyState from '#/components/ui/empty-state'
import type { AvailableDatasets } from '#/integrations/notion/api'
import { Route as DatasetConnectionRoute } from '#/routes/_authed/app_.$datasetId.connect'

type AvailableDataset = AvailableDatasets[number]

type AppHomeDatasetListProps = {
  datasets: AvailableDatasets
  className?: string
}

export default function AppHomeDatasetList({
  datasets,
  className,
}: AppHomeDatasetListProps) {
  if (!datasets.length) {
    return (
      <EmptyState
        className={className}
        icon={<Database />}
        message="No authorized datasets available."
      />
    )
  }

  return (
    <Card className={className} aria-label="Available datasets" tabIndex={0}>
      {datasets.map((dataset) => (
        <AvailableDatasetRow key={dataset.id} dataset={dataset} />
      ))}
    </Card>
  )
}

function AvailableDatasetRow({ dataset }: { dataset: AvailableDataset }) {
  return (
    <Link
      to={DatasetConnectionRoute.to}
      params={{ datasetId: dataset.id }}
      className="block cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted"
    >
      <div className="flex items-center gap-2 p-3">
        <DatasetIcon iconUrl={dataset.iconUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{dataset.title}</p>
          {dataset.description ? (
            <p className="truncate text-xs text-muted-foreground">
              {dataset.description}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
