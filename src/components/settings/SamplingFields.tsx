import type { SamplingParams } from '../../lib/types'
import { SAMPLING_FIELDS, type SamplingField } from '../../lib/sampling'

const FIELD_META: Record<
  SamplingField,
  { label: string; placeholder: string; step: string; min?: number; max?: number }
> = {
  temperature: { label: 'Temperature', placeholder: '0 – 2', step: '0.1', min: 0, max: 2 },
  top_p: { label: 'Top P', placeholder: '0 – 1', step: '0.05', min: 0, max: 1 },
  max_tokens: { label: 'Max tokens', placeholder: 'e.g. 4096', step: '1', min: 1 },
  presence_penalty: { label: 'Presence penalty', placeholder: '-2 – 2', step: '0.1', min: -2, max: 2 },
  frequency_penalty: { label: 'Frequency penalty', placeholder: '-2 – 2', step: '0.1', min: -2, max: 2 },
  seed: { label: 'Seed', placeholder: 'e.g. 42', step: '1' },
}

const inputClass =
  'w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-white/25'

/**
 * The six sampling inputs, shared by Settings (global), the agent form and the
 * per-chat popover. Empty input = field unset (inherit / provider default).
 * `inherited` supplies placeholder values resolved from the outer layers so the
 * user can see what a blank field currently falls back to.
 */
export default function SamplingFields({
  value,
  onChange,
  inherited,
}: {
  value: SamplingParams
  onChange: (patch: SamplingParams) => void
  inherited?: SamplingParams
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {SAMPLING_FIELDS.map((key) => {
        const meta = FIELD_META[key]
        const inheritedValue = inherited?.[key]
        return (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-300">{meta.label}</span>
            <input
              type="number"
              inputMode="decimal"
              step={meta.step}
              min={meta.min}
              max={meta.max}
              value={value[key] ?? ''}
              placeholder={inheritedValue !== undefined ? String(inheritedValue) : meta.placeholder}
              onChange={(e) => {
                const raw = e.target.value
                const num = raw === '' ? undefined : Number(raw)
                onChange({ [key]: num !== undefined && Number.isFinite(num) ? num : undefined })
              }}
              className={inputClass}
            />
          </label>
        )
      })}
    </div>
  )
}
