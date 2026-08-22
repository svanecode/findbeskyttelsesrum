import { NextRequest, NextResponse } from "next/server";

import {
  isContactAccessKey,
  isContactReference,
  normalizeContactAccessKey,
  normalizeContactReference,
} from "@/lib/contact/privacy-contact";
import { isSameOriginContactRequest, readContactJsonBody } from "@/lib/contact/privacy-contact-api";
import { getPrivacyContactCase } from "@/lib/contact/privacy-contact-server";
import { consumeDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IncomingLookup = { reference?: unknown; accessKey?: unknown };

function json(body: Record<string, unknown>, status = 200, retryAfter?: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginContactRequest(request)) return json({ error: "Ugyldig oprindelse." }, 403);

  const limitConfig = { maxRequests: 20, windowMs: 15 * 60 * 1_000 };
  if (!rateLimit(request, limitConfig, "privacy-contact-lookup")) {
    return json({ error: "For mange opslag. Vent lidt, og prøv igen." }, 429, 900);
  }
  const sharedLimit = await consumeDistributedRateLimit(request, limitConfig, "privacy-contact-lookup");
  if (!sharedLimit.allowed) {
    return json({ error: "For mange opslag. Vent lidt, og prøv igen." }, 429, sharedLimit.retryAfterSeconds);
  }

  const body = await readContactJsonBody<IncomingLookup>(request, 2_048);
  if (!body) return json({ error: "Sagsoplysningerne kunne ikke læses." }, 400);

  const reference = normalizeContactReference(body.reference);
  const accessKey = normalizeContactAccessKey(body.accessKey);
  if (!isContactReference(reference) || !isContactAccessKey(accessKey)) {
    return json({ error: "Sagsnummeret eller adgangskoden er ugyldig." }, 400);
  }

  try {
    const contactCase = await getPrivacyContactCase(reference, accessKey);
    if (!contactCase) return json({ error: "Sagen blev ikke fundet. Kontrollér begge oplysninger." }, 404);
    return json({ success: true, case: contactCase });
  } catch {
    return json({ error: "Sagen kunne ikke hentes lige nu. Prøv igen senere." }, 502);
  }
}
