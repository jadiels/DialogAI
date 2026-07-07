import type { SamplingParams } from './types'

/** The sampling fields, in a fixed order — the single source of truth for UI + merge. */
export const SAMPLING_FIELDS = [
  'temperature',
  'top_p',
  'max_tokens',
  'presence_penalty',
  'frequency_penalty',
  'seed',
] as const

export type SamplingField = (typeof SAMPLING_FIELDS)[number]

/**
 * Merge sampling params by precedence (global → agent → chat): a later layer's
 * field overrides an earlier one, and `undefined` never overrides a set value.
 * Returns only the fields that end up defined, so callers can spread it into a
 * request body and omit everything the user left blank.
 */
export function resolveSampling(...layers: (SamplingParams | undefined)[]): SamplingParams {
  const out: SamplingParams = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const key of SAMPLING_FIELDS) {
      const v = layer[key]
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    }
  }
  return out
}
