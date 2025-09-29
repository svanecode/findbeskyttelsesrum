// Critical: Use build-time stable version identifier
// This is set once at build time and remains constant for the deployment
// Changes only when code is deployed (via git commit SHA)
export const APP_VERSION =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  (process.env.NODE_ENV === 'development' ? 'dev' : 'unknown') 