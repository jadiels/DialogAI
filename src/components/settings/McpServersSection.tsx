import { useEffect, useState } from 'react'
import type { McpServerEntry } from '../../lib/types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useMcpStore } from '../../stores/mcpStore'
import { Icon } from '../ui/icons'

const inputClass =
  'w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-white/25'

/** Settings section: configure remote MCP servers (Streamable HTTP). */
export default function McpServersSection() {
  const servers = useSettingsStore((s) => s.settings.mcpServers ?? [])
  const saveMcpServer = useSettingsStore((s) => s.saveMcpServer)
  const deleteMcpServer = useSettingsStore((s) => s.deleteMcpServer)
  const toggleMcpServerEnabled = useSettingsStore((s) => s.toggleMcpServerEnabled)
  const connections = useMcpStore((s) => s.connections)
  const connect = useMcpStore((s) => s.connect)
  const disconnect = useMcpStore((s) => s.disconnect)

  const [editing, setEditing] = useState<McpServerEntry | 'new' | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  // Connect enabled servers on mount so status/tools show up.
  useEffect(() => {
    useMcpStore.getState().connectEnabled()
  }, [])

  function startEdit(server: McpServerEntry | 'new') {
    setEditing(server)
    setName(server === 'new' ? '' : server.name)
    setUrl(server === 'new' ? '' : server.url)
    setToken(server === 'new' ? '' : (server.headers?.Authorization?.replace(/^Bearer /, '') ?? ''))
  }

  function save() {
    if (!name.trim() || !url.trim()) return
    const existing = editing !== 'new' && editing ? editing : undefined
    const id = saveMcpServer({
      id: existing?.id,
      name: name.trim(),
      url: url.trim(),
      headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined,
      enabled: existing?.enabled ?? true,
    })
    setEditing(null)
    // (Re)connect with the new config.
    const server = useSettingsStore.getState().settings.mcpServers?.find((s) => s.id === id)
    if (server?.enabled) void connect(server)
  }

  return (
    <section className="mt-10">
      <h2 className="font-medium text-gray-200">MCP servers</h2>
      <p className="text-sm text-gray-500">
        Remote MCP servers (Streamable HTTP) whose tools the model can call in chats. Because
        DialogAI runs in the browser, the server must allow this origin via CORS; stdio servers
        can&apos;t be reached. Enable tools per chat via the gear next to the model selector.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {servers.map((server) => {
          const conn = connections[server.id]
          return (
            <div
              key={server.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5"
            >
              <button
                onClick={() => {
                  toggleMcpServerEnabled(server.id)
                  const updated = useSettingsStore
                    .getState()
                    .settings.mcpServers?.find((s) => s.id === server.id)
                  if (updated?.enabled) void connect(updated)
                  else disconnect(server.id)
                }}
                role="switch"
                aria-checked={server.enabled}
                aria-label={`Enable ${server.name}`}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  server.enabled ? 'bg-accent' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
                    server.enabled ? 'left-4.5' : 'left-0.5'
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-gray-200">
                  <span className="truncate">{server.name}</span>
                  {server.enabled && conn && (
                    <span
                      className={`shrink-0 text-xs ${
                        conn.status === 'online'
                          ? 'text-accent'
                          : conn.status === 'error'
                            ? 'text-red-400'
                            : 'text-gray-500'
                      }`}
                    >
                      {conn.status === 'online'
                        ? `${conn.tools.length} tool${conn.tools.length === 1 ? '' : 's'}`
                        : conn.status === 'error'
                          ? 'offline'
                          : 'connecting…'}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-gray-500" title={conn?.error ?? server.url}>
                  {conn?.status === 'error' && conn.error ? conn.error : server.url}
                </div>
              </div>
              <button
                onClick={() => startEdit(server)}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                aria-label={`Edit ${server.name}`}
              >
                <Icon name="edit" size={14} />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete MCP server "${server.name}"?`)) {
                    disconnect(server.id)
                    deleteMcpServer(server.id)
                  }
                }}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-red-400"
                aria-label={`Delete ${server.name}`}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-white/10 p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-300">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Docs search"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-300">Endpoint URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-300">
              Bearer token <span className="text-gray-500">(optional)</span>
            </span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Sent as Authorization: Bearer …"
              className={inputClass}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              className="rounded-full px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || !url.trim()}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => startEdit('new')}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"
        >
          <Icon name="plus" size={15} />
          Add MCP server
        </button>
      )}
    </section>
  )
}
