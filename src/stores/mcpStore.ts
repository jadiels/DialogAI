import { create } from 'zustand'
import type { McpServerEntry } from '../lib/types'
import type { ToolDefinition } from '../lib/api'
import { errorMessage } from '../lib/api'
import { McpClient, splitToolName, toToolDefinition, type McpTool } from '../lib/mcp'
import { useSettingsStore } from './settingsStore'

export type McpStatus = 'connecting' | 'online' | 'error'

export interface McpConnection {
  status: McpStatus
  serverName?: string
  tools: McpTool[]
  error?: string
}

interface McpState {
  /** Live connection state per configured server id. */
  connections: Record<string, McpConnection>
  /** Connect (or reconnect) one server and list its tools. */
  connect: (server: McpServerEntry) => Promise<void>
  /** Connect every enabled server from Settings that isn't connected yet. */
  connectEnabled: () => void
  disconnect: (serverId: string) => void
  /** Run a namespaced tool (serverId__toolName) with parsed arguments. */
  callTool: (
    namespaced: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<string>
}

const clients: Record<string, McpClient> = {}

export const useMcpStore = create<McpState>((set, get) => ({
  connections: {},

  async connect(server) {
    set((s) => ({
      connections: { ...s.connections, [server.id]: { status: 'connecting', tools: [] } },
    }))
    try {
      const client = new McpClient(server)
      const { serverName } = await client.connect()
      const tools = await client.listTools()
      clients[server.id] = client
      set((s) => ({
        connections: { ...s.connections, [server.id]: { status: 'online', serverName, tools } },
      }))
    } catch (err) {
      delete clients[server.id]
      set((s) => ({
        connections: {
          ...s.connections,
          [server.id]: { status: 'error', tools: [], error: errorMessage(err) },
        },
      }))
    }
  },

  connectEnabled() {
    const servers = useSettingsStore.getState().settings.mcpServers ?? []
    for (const server of servers) {
      if (server.enabled && !get().connections[server.id]) void get().connect(server)
    }
  },

  disconnect(serverId) {
    delete clients[serverId]
    set((s) => {
      const connections = { ...s.connections }
      delete connections[serverId]
      return { connections }
    })
  },

  async callTool(namespaced, args, signal) {
    const parts = splitToolName(namespaced)
    if (!parts) throw new Error(`Unknown tool: ${namespaced}`)
    const client = clients[parts.serverId]
    if (!client) throw new Error(`MCP server for "${namespaced}" is not connected.`)
    return client.callTool(parts.toolName, args, signal)
  },
}))

/** OpenAI tool definitions for the given namespaced tool names (online servers only). */
export function toolDefinitionsFor(names: string[] | undefined): ToolDefinition[] {
  if (!names?.length) return []
  const { connections } = useMcpStore.getState()
  const defs: ToolDefinition[] = []
  for (const namespaced of names) {
    const parts = splitToolName(namespaced)
    if (!parts) continue
    const conn = connections[parts.serverId]
    const tool = conn?.status === 'online' && conn.tools.find((t) => t.name === parts.toolName)
    if (tool) defs.push(toToolDefinition(parts.serverId, tool))
  }
  return defs
}
