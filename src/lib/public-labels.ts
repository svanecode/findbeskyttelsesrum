const internalLifecyclePrefix = /^\s*\((?:udfases|udgået|historisk)\)\s*[-–—:]?\s*/i

export function normalizePublicApplicationLabel(value: string | null | undefined) {
  if (!value) return ''
  return value.replace(internalLifecyclePrefix, '').trim()
}
