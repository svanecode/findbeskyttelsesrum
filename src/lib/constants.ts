// Critical: Use timestamp-based versioning to ensure every build is unique
// This MUST change on every deployment to force cache invalidation
// Format: YYYYMMDD-HHMMSS-commithash or timestamp-based fallback
export const APP_VERSION =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    ? `${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}-${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 8)}`
    : (process.env.NODE_ENV === 'development'
        ? 'dev'
        : `build-${Date.now()}`) 