import { describe, it, expect } from 'vitest'
import { formatPEN } from './format.js'
import { buildWaUrl, cartMessage, cartTotal, packMessage, contactMessage } from './whatsapp.js'
import { cartReducer, MAX_PROFILES } from './cartReducer.js'

const netflix = { platformId: 'netflix', platformName: 'Netflix', planId: '1m', planLabel: '1 mes', unitPrice: 15, profiles: 2 }
const disney = { platformId: 'disney', platformName: 'Disney+', planId: '1m', planLabel: '1 mes', unitPrice: 12, profiles: 1 }

describe('formatPEN', () => {
  it('formats soles with two decimals', () => {
    expect(formatPEN(15)).toBe('S/ 15.00')
    expect(formatPEN(42.5)).toBe('S/ 42.50')
  })
  it('falls back to zero for invalid input', () => {
    expect(formatPEN(NaN)).toBe('S/ 0.00')
    expect(formatPEN(undefined)).toBe('S/ 0.00')
  })
})

describe('buildWaUrl', () => {
  it('strips non-digits from the phone and encodes the text', () => {
    const url = buildWaUrl('+51 999-999-999', 'Hola & adiós\n¿ok?')
    expect(url).toBe('https://wa.me/51999999999?text=Hola%20%26%20adi%C3%B3s%0A%C2%BFok%3F')
  })
  it('omits the query when there is no text', () => {
    expect(buildWaUrl('51999999999')).toBe('https://wa.me/51999999999')
  })
})

describe('cart messages', () => {
  it('lists each item with profiles, plan and line total', () => {
    const msg = cartMessage([netflix, disney])
    expect(msg).toContain('• Netflix – 2 perfiles × 1 mes – S/ 30.00')
    expect(msg).toContain('• Disney+ – 1 perfil × 1 mes – S/ 12.00')
    expect(msg).toContain('Total: S/ 42.00')
    expect(cartTotal([netflix, disney])).toBe(42)
  })
  it('returns a generic greeting for an empty cart', () => {
    expect(cartMessage([])).toMatch(/información/)
  })
  it('builds pack and contact messages', () => {
    expect(packMessage({ name: 'Pack Cine', price: 35, period: 'mes' }, ['Netflix', 'Max'])).toBe(
      'Hola, me interesa el Pack Cine (Netflix, Max) a S/ 35.00 al mes. ¿Cómo lo activo?',
    )
    expect(contactMessage({ name: ' Ana ', topic: 'Netflix', message: '  ¿Tienen stock?  ' })).toBe(
      'Hola, soy Ana.\nConsulta sobre: Netflix.\n¿Tienen stock?',
    )
  })
})

describe('cartReducer', () => {
  it('adds new items with a key', () => {
    const state = cartReducer([], { type: 'add', item: netflix })
    expect(state).toHaveLength(1)
    expect(state[0].key).toBe('netflix:1m')
  })
  it('merges same platform+plan and caps profiles', () => {
    let state = cartReducer([], { type: 'add', item: { ...netflix, profiles: 5 } })
    state = cartReducer(state, { type: 'add', item: { ...netflix, profiles: 4 } })
    expect(state).toHaveLength(1)
    expect(state[0].profiles).toBe(MAX_PROFILES)
  })
  it('sets profiles within range, removes and clears', () => {
    let state = cartReducer([], { type: 'add', item: netflix })
    state = cartReducer(state, { type: 'setProfiles', key: 'netflix:1m', profiles: 0 })
    expect(state[0].profiles).toBe(1)
    state = cartReducer(state, { type: 'add', item: disney })
    state = cartReducer(state, { type: 'remove', key: 'netflix:1m' })
    expect(state.map((i) => i.key)).toEqual(['disney:1m'])
    expect(cartReducer(state, { type: 'clear' })).toEqual([])
  })
})
