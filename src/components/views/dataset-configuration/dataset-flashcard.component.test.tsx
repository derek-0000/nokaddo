import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithQuery } from '../../../../test/support/render'
import DatasetFlashcard from './dataset-flashcard'

function endAnimation(surface: HTMLElement) {
  fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
}

describe('dataset flashcard interaction', () => {
  it('changes faces only between flip animations and ignores repeated flips while animating', async () => {
    const { user } = renderWithQuery(
      <DatasetFlashcard topRightLabel="2/12">
        {(face) => <p>{face === 'front' ? 'Front content' : 'Back content'}</p>}
      </DatasetFlashcard>,
    )
    const flip = screen.getByRole('button', { name: 'Flip' })
    const surface = screen.getByRole('group', { name: 'Flashcard front' })

    expect(screen.getByText('Front content')).toBeTruthy()
    expect(screen.getByText('2/12')).toBeTruthy()
    expect((flip as HTMLButtonElement).disabled).toBe(false)

    await user.click(flip)
    expect((flip as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Front content')).toBeTruthy()

    fireEvent.click(flip)
    endAnimation(surface)
    expect(screen.getByText('Back content')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Flashcard back' })).toBeTruthy()
    expect((flip as HTMLButtonElement).disabled).toBe(true)

    endAnimation(surface)
    expect((flip as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('Back content')).toBeTruthy()
  })
  it('keeps Next after repeated manual flips, including keyboard flips', async () => {
    const { user } = renderWithQuery(
      <DatasetFlashcard
        renderControls={({ flip, hasFlipped, isFlipping }) => (
          <button onClick={flip} disabled={isFlipping}>
            {hasFlipped ? 'Next' : 'Flip'}
          </button>
        )}
      >
        {(face) => <p>{face}</p>}
      </DatasetFlashcard>,
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const surface = screen.getByRole('group', { name: 'Flashcard front' })
    await user.click(surface)
    endAnimation(surface)
    endAnimation(surface)
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
    surface.focus()
    await user.keyboard('{Enter}')
    endAnimation(surface)
    endAnimation(surface)
    expect(screen.getByRole('group', { name: 'Flashcard front' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
    ).toBe(false)
  })
})
