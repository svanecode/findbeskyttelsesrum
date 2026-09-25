import { NextRequest, NextResponse } from "next/server";

import { consumeDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { readBoundedRequestText } from "@/lib/http/read-bounded-request-text";
import { isSameOriginRequest } from "@/lib/http/request-context";
import { rateLimit } from "@/lib/rate-limit";
import { isShelterReportType } from "@/lib/reporting/shelter-report";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumBodyBytes = 24_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IncomingReport = {
  shelterId?: unknown;
  reportType?: unknown;
  message?: unknown;
  website?: unknown;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return json({ error: "Ugyldig oprindelse." }, 403);
  }

  if (!rateLimit(request, { maxRequests: 5, windowMs: 60 * 60 * 1_000 }, "shelter-reports")) {
    return NextResponse.json(
      { error: "Du har sendt for mange rapporter. Prøv igen senere." },
      {
        status: 429,
        headers: { "Cache-Control": "private, no-store", "Retry-After": "3600" },
      },
    );
  }

  const bodyResult = await readBoundedRequestText(request, maximumBodyBytes);
  if (!bodyResult.ok && bodyResult.reason === "too_large") {
    return json({ error: "Rapporten er for lang." }, 413);
  }
  if (!bodyResult.ok) return json({ error: "Rapporten kunne ikke læses." }, 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyResult.text) as unknown;
  } catch {
    return json({ error: "Rapporten kunne ikke læses." }, 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return json({ error: "Rapporten skal være et JSON-objekt." }, 400);
  }
  const body = parsed as IncomingReport;

  // Quietly accept obvious bot submissions without writing them.
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ success: true });
  }

  const shelterId = typeof body.shelterId === "string" ? body.shelterId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!uuidPattern.test(shelterId) || !isShelterReportType(body.reportType)) {
    return json({ error: "Registreringen eller fejltypen er ugyldig." }, 400);
  }

  if (message.length < 10 || message.length > 1_500) {
    return json({ error: "Beskrivelsen skal være mellem 10 og 1.500 tegn." }, 400);
  }

  const sharedLimit = await consumeDistributedRateLimit(
    request,
    { maxRequests: 5, windowMs: 60 * 60 * 1_000 },
    "shelter-reports",
  );
  if (!sharedLimit.available) {
    return json({ error: "Rapportering er midlertidigt utilgængelig. Prøv igen senere." }, 503);
  }
  if (!sharedLimit.allowed) {
    return NextResponse.json(
      { error: "Du har sendt for mange rapporter. Prøv igen senere." },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(sharedLimit.retryAfterSeconds),
        },
      },
    );
  }

  try {
    const admin = createAppV2AdminClient();
    const { error } = await admin.rpc("submit_public_shelter_report", {
      p_shelter_id: shelterId,
      p_report_type: body.reportType,
      p_message: message,
      p_contact_email: null,
    });

    if (error) {
      console.error("Could not submit public shelter report:", { code: error.code });
      return json({ error: "Rapporten kunne ikke gemmes lige nu. Prøv igen senere." }, 502);
    }

    return json({ success: true }, 201);
  } catch (error) {
    console.error("Public shelter report route failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: "Rapporten kunne ikke gemmes lige nu. Prøv igen senere." }, 500);
  }
}
