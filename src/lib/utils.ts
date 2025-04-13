export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[æøå]/g, (match) => {
      switch (match) {
        case 'æ': return 'ae'
        case 'ø': return 'oe'
        case 'å': return 'aa'
        default: return match
      }
    })
    .replace(/kobenhavns kommune/, 'kobenhavn')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-kommune$/, '')
    .replace(/-regionskommune$/, '')
} 