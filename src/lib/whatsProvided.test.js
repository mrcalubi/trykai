import { describe, expect, it } from 'vitest'
import {
  MAX_CUSTOM_PROVIDED,
  MAX_CUSTOM_PROVIDED_CHARS,
  customProvidedItems,
  providedForSave,
} from './whatsProvided'

describe('whatsProvided', () => {
  it('keeps custom items on the text array and drops None', () => {
    expect(providedForSave(['Materials', 'Apron'])).toEqual(['Materials', 'Apron'])
    expect(providedForSave(['None', 'Apron'])).toEqual([])
    expect(providedForSave([])).toEqual([])
  })

  it('treats anything outside the presets as a custom item', () => {
    expect(customProvidedItems(['Materials', 'Apron', 'None'])).toEqual(['Apron'])
    expect(MAX_CUSTOM_PROVIDED).toBe(5)
    expect(MAX_CUSTOM_PROVIDED_CHARS).toBe(40)
  })
})
