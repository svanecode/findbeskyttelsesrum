import { getAppV2PublicDataStats } from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function healthResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const stats = await getAppV2PublicDataStats();
    const shelterCount = stats.publicRegistrations;
    const latestImportedAt = stats.latestPublicImportAt;
    const latestImportTime = latestImportedAt ? new Date(latestImportedAt).getTime() : Number.NaN;

    if (shelterCount < 1 || !Number.isFinite(latestImportTime)) {
      return healthResponse(
        {
          status: "degraded",
          checkedAt,
          database: {
            reachable: true,
            shelterCount,
            latestImportedAt,
          },
        },
        503,
      );
    }

    return healthResponse({
      status: "ok",
      checkedAt,
      database: {
        reachable: true,
        shelterCount,
        latestImportedAt,
        dataAgeHours: Math.round(((Date.now() - latestImportTime) / 3_600_000) * 10) / 10,
      },
    });
  } catch (error) {
    console.error("[health] Public database check failed:", error instanceof Error ? error.name : "unknown");
    return healthResponse(
      {
        status: "error",
        checkedAt,
        database: { reachable: false },
      },
      503,
    );
  }
}
