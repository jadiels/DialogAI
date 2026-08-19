import type { McpTool } from '../../lib/mcp'
import { Modal } from '../ui/Modal'

interface SchemaProperty {
  type?: string | string[]
  description?: string
  enum?: unknown[]
  default?: unknown
}

/** Parameters extracted from a tool's JSON Schema, best-effort. */
function schemaParams(schema: Record<string, unknown> | undefined) {
  const properties = (schema?.properties ?? {}) as Record<string, SchemaProperty>
  const required = new Set(Array.isArray(schema?.required) ? (schema.required as string[]) : [])
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    required: required.has(name),
    type: Array.isArray(prop.type) ? prop.type.join(' | ') : (prop.type ?? ''),
    description: prop.description,
    options: prop.enum,
    defaultValue: prop.default,
  }))
}

/** Modal listing every tool an online MCP server exposes, with full details. */
export default function McpToolsModal({
  serverName,
  tools,
  onClose,
}: {
  serverName: string
  tools: McpTool[]
  onClose: () => void
}) {
  return (
    <Modal title={`${serverName} — ${tools.length} tool${tools.length === 1 ? '' : 's'}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        {tools.map((tool) => {
          const params = schemaParams(tool.inputSchema)
          return (
            <div key={tool.name} className="rounded-xl border border-white/10 p-3">
              <div className="font-mono text-sm text-gray-100">{tool.name}</div>
              {tool.description && (
                <p className="mt-1 text-sm whitespace-pre-wrap text-gray-400">{tool.description}</p>
              )}
              {params.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                    Parameters
                  </div>
                  {params.map((param) => (
                    <div key={param.name} className="text-sm">
                      <span className="font-mono text-gray-200">{param.name}</span>
                      {param.type && <span className="ml-1.5 text-xs text-gray-500">{param.type}</span>}
                      {param.required && <span className="ml-1.5 text-xs text-amber-400">required</span>}
                      {param.options && (
                        <span className="ml-1.5 text-xs text-gray-500">
                          {param.options.map((o) => JSON.stringify(o)).join(' | ')}
                        </span>
                      )}
                      {param.defaultValue !== undefined && (
                        <span className="ml-1.5 text-xs text-gray-500">
                          default: {JSON.stringify(param.defaultValue)}
                        </span>
                      )}
                      {param.description && (
                        <div className="text-xs text-gray-400">{param.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {tool.inputSchema && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
                    Raw input schema
                  </summary>
                  <pre className="mt-1.5 overflow-x-auto rounded-lg bg-white/5 p-2 text-xs whitespace-pre-wrap text-gray-400">
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )
        })}
        {tools.length === 0 && (
          <p className="text-sm text-gray-500">This server exposes no tools.</p>
        )}
      </div>
    </Modal>
  )
}
