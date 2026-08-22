import { NextRequest, NextResponse } from "next/server";

import { isPrivacyContactCategory } from "@/lib/contact/privacy-contact";
import { isSameOriginContactRequest, readContactJsonBody } from "@/lib/contact/privacy-contact-api";
import { submitPrivacyContactCase } from "@/lib/contact/privacy-contact-server";
import { consumeDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IncomingContactCase = {
  category?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

function json(body: Record<string, unknown>, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...extraHeaders },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginContactRequest(request)) return json({ error: "Ugyldig oprindelse." }, 403);

  const limitConfig = { maxRequests: 5, windowMs: 60 * 60 * 1_000 };
  if (!rateLimit(request, limitConfig, "privacy-contact-create")) {
    return json({ error: "Du har sendt for mange henvendelser. Prøv igen senere." }, 429, { "Retry-After": "3600" });
  }
  const sharedLimit = await consumeDistributedRateLimit(request, limitConfig, "privacy-contact-create");
  if (!sharedLimit.allowed) {
    return json(
      { error: "Du har sendt for mange henvendelser. Prøv igen senere." },
      429,
      { "Retry-After": String(sharedLimit.retryAfterSeconds) },
    );
  }

  const body = await readContactJsonBody<IncomingContactCase>(request, 8_192);
  if (!body) return json({ error: "Henvendelsen kunne ikke læses eller var for stor." }, 400);

  if (typeof body.website === "string" && body.website.trim()) {
    return json({ success: true }, 201);
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!isPrivacyContactCategory(body.category)) return json({ error: "Vælg en gyldig henvendelsestype." }, 400);
  if (subject.length < 3 || subject.length > 120) {
    return json({ error: "Emnet skal være mellem 3 og 120 tegn." }, 400);
  }
  if (message.length < 10 || message.length > 4_000) {
    return json({ error: "Beskeden skal være mellem 10 og 4.000 tegn." }, 400);
  }

  try {
    const credentials = await submitPrivacyContactCase({ category: body.category, subject, message });
    return json({ success: true, ...credentials }, 201);
  } catch {
    return json({ error: "Henvendelsen kunne ikke gemmes lige nu. Prøv igen senere." }, 502);
  }
}
