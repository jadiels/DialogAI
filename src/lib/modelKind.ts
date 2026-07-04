export type ModelKind = 'chat' | 'image' | 'embedding' | 'audio'

// The OpenAI-compatible /v1/models endpoint exposes no capability/type field,
// so kind is inferred from the model id by name. Heuristic — overridable by the
// user typing a custom model anywhere a model is picked.
const IMAGE = /dall-?e|gpt-image|stable-?diffusion|sdxl|\bsd[ ._-]?[0-9]|flux|playground-v|kandinsky|imagen|midjourney|ideogram|recraft|seedream|hidream|image[ ._-]?gen/i
const EMBEDDING = /embed|\bbge\b|\bgte[-_]|\be5[-_]|nomic-embed|text-embedding|rerank/i
const AUDIO = /whisper|\btts\b|text-to-speech|\baudio\b|\bvoice\b|parler|\bbark\b|xtts/i

export function classifyModel(id: string): ModelKind {
  if (IMAGE.test(id)) return 'image'
  if (EMBEDDING.test(id)) return 'embedding'
  if (AUDIO.test(id)) return 'audio'
  return 'chat'
}

export const isImageModel = (id: string): boolean => classifyModel(id) === 'image'
export const isChatModel = (id: string): boolean => classifyModel(id) === 'chat'
