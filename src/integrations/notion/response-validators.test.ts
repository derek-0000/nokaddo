import type { PartialPageObjectResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import { getNotionProperty, requirePageProperties } from './response-validators'
import {
  buildNotionPage,
  buildNotionTitlePageProperty,
} from '../../../test/fixtures/notion'

describe('own-property lookup', () => {
  it('does not return inherited names that collide with object prototypes', () => {
    const properties = Object.create({ toString: 'inherited' }) as Record<
      string,
      string
    >

    expect(getNotionProperty(properties, 'toString')).toBeUndefined()
  })

  it('returns an own property even when its name collides with a prototype', () => {
    const properties = Object.create(null) as unknown as Record<string, string>
    properties['toString'] = 'own property'

    expect(getNotionProperty(properties, 'toString')).toBe('own property')
  })
})

describe('full-page property requirement', () => {
  it('returns properties from a full page response', () => {
    const properties = {
      Name: buildNotionTitlePageProperty([], 'title-id'),
    }
    const page = buildNotionPage({
      id: 'page-id',
      properties,
    })

    expect(requirePageProperties(page, 'safe diagnostic')).toBe(properties)
  })

  it('throws the supplied safe diagnostic for a partial page', () => {
    const page = {
      object: 'page',
      id: 'page-id',
    } as PartialPageObjectResponse

    expect(() => requirePageProperties(page, 'safe diagnostic')).toThrow(
      'safe diagnostic',
    )
  })
})
