import { describe, expect, it } from 'vitest'
import { hasAvailableDatasetFields } from './dataset-response-validators'

const fullDataset = {
  object: 'data_source',
  id: 'source-id',
  title: [{ plain_text: 'Biology' }],
  description: [{ plain_text: 'Study cards' }],
  icon: null,
  cover: null,
}

describe('available-dataset response guard', () => {
  it('accepts full responses containing every app-consumed field', () => {
    expect(hasAvailableDatasetFields(fullDataset)).toBe(true)
  })

  it.each([
    null,
    {},
    { ...fullDataset, object: 'page' },
    { ...fullDataset, id: '' },
    { ...fullDataset, id: undefined },
    { ...fullDataset, title: undefined },
    { ...fullDataset, title: [null] },
    { ...fullDataset, title: [[]] },
    { ...fullDataset, title: [{}] },
    { ...fullDataset, description: undefined },
    { ...fullDataset, description: [{}] },
    { ...fullDataset, icon: {} },
    { ...fullDataset, icon: { type: 'emoji', emoji: '' } },
    {
      ...fullDataset,
      icon: { type: 'external', external: { url: '' } },
    },
    { ...fullDataset, cover: {} },
    { ...fullDataset, cover: { type: 'file', file: { url: '' } } },
  ])('rejects partial, other, or malformed response %#', (response) => {
    expect(hasAvailableDatasetFields(response)).toBe(false)
  })

  it('accepts the full icon and cover variants consumed by the app', () => {
    const icons = [
      null,
      { type: 'emoji', emoji: '📚' },
      { type: 'icon', icon: { name: 'book' } },
      {
        type: 'custom_emoji',
        custom_emoji: { url: 'https://example.test/custom-emoji.png' },
      },
      {
        type: 'external',
        external: { url: 'https://example.test/icon.png' },
      },
      {
        type: 'file',
        file: { url: 'https://example.test/icon.png' },
      },
    ]
    const covers = [
      null,
      {
        type: 'external',
        external: { url: 'https://example.test/cover.png' },
      },
      {
        type: 'file',
        file: { url: 'https://example.test/cover.png' },
      },
    ]

    for (const icon of icons) {
      for (const cover of covers) {
        expect(hasAvailableDatasetFields({ ...fullDataset, icon, cover })).toBe(
          true,
        )
      }
    }
  })

  it('requires consumed fields to be own properties', () => {
    const inheritedTitle = Object.create({
      title: fullDataset.title,
    }) as typeof fullDataset
    Object.assign(inheritedTitle, fullDataset)
    delete (inheritedTitle as Partial<typeof fullDataset>).title

    expect(hasAvailableDatasetFields(inheritedTitle)).toBe(false)
  })
})
