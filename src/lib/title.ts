const MAX_LENGTH = 40

/** Chat title = first user message, cut at a word boundary. */
export function deriveTitle(firstUserMessage: string): string {
  const text = firstUserMessage.replace(/\s+/g, ' ').trim()
  if (!text) return 'New chat'
  if (text.length <= MAX_LENGTH) return text
  const cut = text.slice(0, MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut) + '…'
}
