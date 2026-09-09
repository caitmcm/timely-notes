const DEFAULT_EXCERPT_LENGTH = 40

/**
 * One-line plain-text summary of a period's note. Crude by design — enough to read the row at a
 * glance, not a markdown renderer.
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

/**
 * There is nothing to save. The one definition of empty on this side of the wire — it decides
 * *don't create*, *delete on close* and *don't display* alike, and mirrors the server's
 * `string.IsNullOrWhiteSpace`.
 */
export function isBlank(markdown: string): boolean {
  return markdown.trim().length === 0
}
