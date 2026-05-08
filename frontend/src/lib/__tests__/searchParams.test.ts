import { describe, expect, it } from 'vitest'
import { updateParam } from '../searchParams'


describe('updateParam', () => {
  it('adds new key', () => {
    const prev = new URLSearchParams('a=1')
    const next = updateParam(prev, 'b', '2')
    expect(next.get('b')).toBe('2')
    expect(next.get('a')).toBe('1')
  })


  it('overwrites existing key', () => {
    const prev = new URLSearchParams('q=old')
    const next = updateParam(prev, 'q', 'new')
    expect(next.get('q')).toBe('new')
  })


  it('deletes when value is null', () => {
    const prev = new URLSearchParams('a=1&b=2')
    const next = updateParam(prev, 'b', null)
    expect(next.get('b')).toBeNull()
    expect(next.get('a')).toBe('1')
  })


  it('deletes when value is empty string', () => {
    const prev = new URLSearchParams('a=1')
    const next = updateParam(prev, 'a', '')
    expect(next.get('a')).toBeNull()
  })


  it('deletes when value is undefined', () => {
    const prev = new URLSearchParams('x=1')
    const next = updateParam(prev, 'x', undefined)
    expect(next.get('x')).toBeNull()
  })


  it('does not mutate input', () => {
    const prev = new URLSearchParams('a=1')
    updateParam(prev, 'b', '2')
    expect(prev.get('b')).toBeNull()  // prev still unchanged
  })
})
