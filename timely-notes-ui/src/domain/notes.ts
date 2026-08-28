const DEFAULT_EXCERPT_LENGTH = 40

/**
 * One-line plain-text summary for the button that opens a note. Crude by design — enough to tell
 * two notes apart, not a markdown renderer.
 */
export function noteExcerpt(content: string, maxLength = DEFAULT_EXCERPT_LENGTH): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.replace(/^\s*(?:#{1,6}|[-*+]|>|\d+\.)\s+/, '').trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    return 'Empty note'
  }

  const collapsed = firstLine.replace(/\s+/g, ' ')

  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}…` : collapsed
}
