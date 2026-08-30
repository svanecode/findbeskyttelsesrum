export const runtime = "nodejs";

export function GET() {
  return Response.json(
    {
      status: "ok",
      checkedAt: new Date().toISOString(),
      application: {
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
      },
    },
  );
}
