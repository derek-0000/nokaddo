import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useReducer } from 'react'
import { describe, expect, it } from 'vitest'
import { renderWithQuery } from '../../../../test/support/render'
import DatasetCardCustomizer from './dataset-card-customizer'
import {
  createDatasetConnectionState,
  datasetConnectionReducer,
} from './dataset-connection-reducer'
import type { DatasetColumn } from './dataset-connection-reducer'

const columns: DatasetColumn[] = [
  { id: 'one', name: 'One', type: 'title' },
  { id: 'two', name: 'Two', type: 'rich_text' },
  { id: 'three', name: 'Three', type: 'number' },
  { id: 'four', name: 'Four', type: 'checkbox' },
  { id: 'five', name: 'Five', type: 'select' },
]

function CustomizerHarness() {
  const [connection, dispatch] = useReducer(
    datasetConnectionReducer,
    columns,
    createDatasetConnectionState,
  )

  return (
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
  )
}

function finishFlip() {
  const surface = screen.getByRole('group', { name: /Flashcard (front|back)/ })

  fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
  fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
}

describe('card field customization', () => {
  it('toggles unique fields, enforces the front limit, and removes fields', async () => {
    const { user } = renderWithQuery(<CustomizerHarness />)

    expect(screen.queryByText('Empty side')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    const firstColumn = screen.getByRole('button', { name: 'One' })

    await user.click(firstColumn)
    expect(firstColumn.getAttribute('aria-pressed')).toBe('true')
    await user.click(firstColumn)
    expect(firstColumn.getAttribute('aria-pressed')).toBe('false')

    for (const name of ['One', 'Two', 'Three', 'Four']) {
      await user.click(screen.getByRole('button', { name }))
    }

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Five' }).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Choose fields' }),
      ).toBeNull(),
    )

    expect(screen.queryByRole('button', { name: 'Add field' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'One' })).toHaveLength(1)
    expect(
      ['One', 'Two', 'Three', 'Four'].map(
        (name) =>
          screen.getByRole('button', { name: `Remove ${name} field` })
            .ariaLabel,
      ),
    ).toEqual([
      'Remove One field',
      'Remove Two field',
      'Remove Three field',
      'Remove Four field',
    ])

    await user.click(screen.getByRole('button', { name: 'Remove One field' }))
    expect(screen.getByRole('button', { name: 'Add field' })).toBeTruthy()
  })

  it('enforces the back limit while permitting cross-face reuse', async () => {
    const { user } = renderWithQuery(<CustomizerHarness />)

    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.click(screen.getByRole('button', { name: 'Two' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Choose fields' }),
      ).toBeNull(),
    )

    await user.click(screen.getByRole('button', { name: 'Flip' }))
    finishFlip()
    expect(screen.getByText('Back')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add field' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add field' }))
    const reusedColumn = screen.getByRole('button', { name: 'Two' })
    expect((reusedColumn as HTMLButtonElement).disabled).toBe(false)
    await user.click(reusedColumn)
    for (const name of ['One', 'Three', 'Four']) {
      await user.click(screen.getByRole('button', { name }))
    }
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Five' }).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(screen.getByText('Two')).toBeTruthy())
  })

  it('dismisses the field drawer from the keyboard and restores trigger focus', async () => {
    const { user } = renderWithQuery(<CustomizerHarness />)
    const trigger = screen.getByRole('button', { name: 'Add field' })

    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'Choose fields' })).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Choose fields' }),
      ).toBeNull(),
    )
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})
