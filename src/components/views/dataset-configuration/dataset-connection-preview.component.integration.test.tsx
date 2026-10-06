import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../../../test/support/render'
import DatasetConnectionPreview from './dataset-connection-preview'
import type { CardBindings, DatasetColumn } from './dataset-connection-reducer'

const boundaries = vi.hoisted(() => ({
  datasetItems: vi.fn(),
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: vi.fn(),
  getNotionDataset: vi.fn(),
  getNotionDatasetItems: boundaries.datasetItems,
}))

const columns: DatasetColumn[] = [
  { id: 'encoded%3Aid', name: 'Encoded', type: 'title' },
  { id: 'fallback-id', name: 'Fallback', type: 'rich_text' },
  { id: 'empty-id', name: 'Empty', type: 'number' },
  { id: 'missing-id', name: 'Missing', type: 'checkbox' },
]

const frontBindings: CardBindings = {
  front: ['encoded%3Aid', 'fallback-id', 'empty-id', 'missing-id'],
  back: [],
}

function renderPreview(bindings: CardBindings = frontBindings) {
  return renderWithQuery(
    <DatasetConnectionPreview
      datasetId="source-dataset"
      columns={columns}
      mode="grouped"
      groupingColumnId="fallback-id"
      bindings={bindings}
    />,
  )
}

beforeEach(() => {
  boundaries.datasetItems.mockResolvedValue([])
})

describe('dataset configuration preview', () => {
  it('requests the configured fields and represents loading, no-row, and error states', async () => {
    let resolveItems: (items: []) => void = () => undefined
    boundaries.datasetItems.mockReturnValueOnce(
      new Promise<[]>((resolve) => {
        resolveItems = resolve
      }),
    )

    const loading = renderPreview()
    expect(screen.getByRole('status').textContent).toMatch(
      /loading an example/i,
    )
    expect(boundaries.datasetItems).toHaveBeenCalledWith({
      data: {
        dataSetId: 'source-dataset',
        limit: 1,
        fields: columns.map(({ id, type }) => ({ id, type })),
        requirePopulatedField: true,
      },
    })

    resolveItems([])
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(
        /no items to preview/i,
      ),
    )
    loading.unmount()

    boundaries.datasetItems.mockRejectedValueOnce(new Error('provider detail'))
    renderPreview()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /couldn't load an example/i,
      ),
    )
    expect(screen.queryByText('provider detail')).toBeNull()
  })

  it('renders populated bindings in face order and omits empty or missing values', async () => {
    boundaries.datasetItems.mockResolvedValueOnce([
      {
        id: 'row-a',
        properties: [
          { id: 'encoded:id', name: 'Fallback', value: 'Value by ID' },
          { id: 'other-id', name: 'Fallback', value: 'Value by name' },
          { id: 'empty-id', name: 'Empty', value: '' },
          {
            id: 'same-name-sentinel',
            name: 'Empty',
            value: 'must not replace empty ID match',
          },
        ],
      },
    ])

    const { user } = renderPreview({
      front: frontBindings.front,
      back: ['fallback-id', 'encoded%3Aid'],
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Encoded').textContent).toBe('Value by ID'),
    )
    expect(screen.getByLabelText('Fallback').textContent).toBe('Value by name')
    expect(screen.queryByLabelText('Empty')).toBeNull()
    expect(screen.queryByLabelText('Missing')).toBeNull()
    expect(screen.queryByText('must not replace empty ID match')).toBeNull()
    const frontSurface = screen.getByRole('group', {
      name: 'Flashcard front',
    })
    expect(
      within(frontSurface)
        .getAllByLabelText(/^(Encoded|Fallback)$/)
        .map((element) => element.getAttribute('aria-label')),
    ).toEqual(['Encoded', 'Fallback'])

    await user.click(screen.getByRole('button', { name: 'Flip' }))
    fireEvent(frontSurface, new Event('webkitAnimationEnd', { bubbles: true }))
    const backSurface = screen.getByRole('group', { name: 'Flashcard back' })

    expect(
      within(backSurface)
        .getAllByLabelText(/^(Fallback|Encoded)$/)
        .map((element) => element.getAttribute('aria-label')),
    ).toEqual(['Fallback', 'Encoded'])
  })
})
