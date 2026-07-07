import { describe, expect, it } from 'vitest'
import { resolveSampling } from './sampling'

describe('resolveSampling', () => {
  it('returns an empty object when nothing is set', () => {
    expect(resolveSampling(undefined, undefined, undefined)).toEqual({})
    expect(resolveSampling({}, {}, {})).toEqual({})
  })

  it('later layers override earlier ones per field', () => {
    const global = { temperature: 0.2, top_p: 0.9, max_tokens: 100 }
    const agent = { temperature: 0.7 }
    const chat = { max_tokens: 500 }
    expect(resolveSampling(global, agent, chat)).toEqual({
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 500,
    })
  })

  it('does not let undefined fields override a set value', () => {
    expect(resolveSampling({ temperature: 0.5 }, { temperature: undefined })).toEqual({
      temperature: 0.5,
    })
  })

  it('drops non-finite and non-number values', () => {
    // NaN can come from an empty number input parsed via Number('').
    const layer = { temperature: NaN, seed: 0, top_p: Infinity } as Record<string, number>
    expect(resolveSampling(layer)).toEqual({ seed: 0 })
  })

  it('keeps a zero value (valid for seed / penalties)', () => {
    expect(resolveSampling({ presence_penalty: 0, frequency_penalty: 0 })).toEqual({
      presence_penalty: 0,
      frequency_penalty: 0,
    })
  })
})
