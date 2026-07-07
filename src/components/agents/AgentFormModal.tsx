import { useState } from 'react'
import type { Agent, SamplingParams } from '../../lib/types'
import { useAgentsStore } from '../../stores/agentsStore'
import { useActiveProfile, useSettingsStore } from '../../stores/settingsStore'
import { Modal } from '../ui/Modal'
import ModelPicker from '../settings/ModelPicker'
import SamplingFields from '../settings/SamplingFields'

export default function AgentFormModal({
  agent,
  onClose,
}: {
  agent?: Agent
  onClose: () => void
}) {
  const saveAgent = useAgentsStore((s) => s.saveAgent)
  const profile = useActiveProfile()
  const globalSampling = useSettingsStore((s) => s.settings.sampling)
  const [name, setName] = useState(agent?.name ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')
  const [defaultModel, setDefaultModel] = useState(agent?.defaultModel ?? '')
  const [sampling, setSampling] = useState<SamplingParams>(agent?.sampling ?? {})
  const [showSampling, setShowSampling] = useState(!!agent?.sampling)
  const canSave = name.trim() && systemPrompt.trim()

  function patchSampling(patch: SamplingParams) {
    setSampling((prev) => {
      const merged = { ...prev, ...patch }
      for (const k of Object.keys(merged) as (keyof SamplingParams)[]) {
        if (merged[k] === undefined) delete merged[k]
      }
      return merged
    })
  }

  return (
    <Modal
      title={agent ? 'Edit agent' : 'New agent'}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-gray-300">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code Reviewer"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-white/25"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-gray-300">
            Default model{' '}
            <span className="text-gray-500">
              (empty = connection default{profile ? `: ${profile.defaultModel}` : ''})
            </span>
          </span>
          <ModelPicker
            models={profile?.models ?? []}
            value={defaultModel}
            onChange={setDefaultModel}
            placeholder="Leave empty to use the connection default"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-gray-300">System prompt</span>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={12}
            placeholder="You are a senior engineer who reviews code for…"
            className="max-h-[55vh] min-h-40 w-full resize-y rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-white/25"
          />
        </label>

        <div>
          <button
            type="button"
            onClick={() => setShowSampling((v) => !v)}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            {showSampling ? '▾' : '▸'} Sampling parameters{' '}
            <span className="text-gray-500">(optional — overrides the global defaults)</span>
          </button>
          {showSampling && (
            <div className="mt-3">
              <SamplingFields
                value={sampling}
                onChange={patchSampling}
                inherited={globalSampling}
              />
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!canSave) return
              void saveAgent({
                id: agent?.id,
                name: name.trim(),
                systemPrompt: systemPrompt.trim(),
                defaultModel: defaultModel.trim(),
                sampling: Object.keys(sampling).length ? sampling : undefined,
              })
              onClose()
            }}
            disabled={!canSave}
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
