// Use build ID for cache busting - this ensures every deploy gets a new version
// Fallback to stable version to prevent reload loops
export const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
                           (process.env.NODE_ENV === 'development' ? 'dev-stable' : '1.0.2-cache-fix') 