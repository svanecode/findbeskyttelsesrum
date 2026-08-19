import { NextRequest, NextResponse } from "next/server";

import { consumeDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { rateLimit } from "@/lib/rate-limit";
import { isShelterReportType } from "@/lib/reporting/shelter-report";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxBodyChars = 6_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type IncomingReport = {
  shelterId?: unknown;
  reportType?: unknown;
  message?: unknown;
  contactEmail?: unknown;
  website?: unknown;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
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

  const sharedLimit = await consumeDistributedRateLimit(
    request,
    { maxRequests: 5, windowMs: 60 * 60 * 1_000 },
    "shelter-reports",
  );
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

  const raw = await request.text();
  if (raw.length > maxBodyChars) {
    return json({ error: "Rapporten er for lang." }, 413);
  }

  let body: IncomingReport;
  try {
    body = JSON.parse(raw) as IncomingReport;
  } catch {
    return json({ error: "Rapporten kunne ikke læses." }, 400);
  }

  // Quietly accept obvious bot submissions without writing them.
  if (typeof body.website === "string" && body.website.trim()) {
    return json({ success: true });
  }

  const shelterId = typeof body.shelterId === "string" ? body.shelterId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim().toLowerCase() : "";

  if (!uuidPattern.test(shelterId) || !isShelterReportType(body.reportType)) {
    return json({ error: "Registreringen eller fejltypen er ugyldig." }, 400);
  }

  if (message.length < 10 || message.length > 1_500) {
    return json({ error: "Beskrivelsen skal være mellem 10 og 1.500 tegn." }, 400);
  }

  if (contactEmail && (contactEmail.length > 254 || !emailPattern.test(contactEmail))) {
    return json({ error: "E-mailadressen er ugyldig." }, 400);
  }

  try {
    const admin = createAppV2AdminClient();
    const { error } = await admin.rpc("submit_public_shelter_report", {
      p_shelter_id: shelterId,
      p_report_type: body.reportType,
      p_message: message,
      p_contact_email: contactEmail || null,
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
