import { NextRequest, NextResponse } from "next/server";

import {
  isContactAccessKey,
  isContactReference,
  normalizeContactAccessKey,
  normalizeContactReference,
} from "@/lib/contact/privacy-contact";
import { isSameOriginContactRequest, readContactJsonBody } from "@/lib/contact/privacy-contact-api";
import { appendPrivacyContactMessage, getPrivacyContactCase } from "@/lib/contact/privacy-contact-server";
import { consumeDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IncomingMessage = { reference?: unknown; accessKey?: unknown; message?: unknown; website?: unknown };

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

  const limitConfig = { maxRequests: 10, windowMs: 60 * 60 * 1_000 };
  if (!rateLimit(request, limitConfig, "privacy-contact-message")) {
    return json({ error: "Du har sendt for mange beskeder. Prøv igen senere." }, 429, 3600);
  }
  const sharedLimit = await consumeDistributedRateLimit(request, limitConfig, "privacy-contact-message");
  if (!sharedLimit.allowed) {
    return json({ error: "Du har sendt for mange beskeder. Prøv igen senere." }, 429, sharedLimit.retryAfterSeconds);
  }

  const body = await readContactJsonBody<IncomingMessage>(request, 8_192);
  if (!body) return json({ error: "Beskeden kunne ikke læses eller var for stor." }, 400);
  if (typeof body.website === "string" && body.website.trim()) return json({ success: true }, 201);

  const reference = normalizeContactReference(body.reference);
  const accessKey = normalizeContactAccessKey(body.accessKey);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!isContactReference(reference) || !isContactAccessKey(accessKey)) {
    return json({ error: "Sagsnummeret eller adgangskoden er ugyldig." }, 400);
  }
  if (message.length < 2 || message.length > 4_000) {
    return json({ error: "Beskeden skal være mellem 2 og 4.000 tegn." }, 400);
  }

  try {
    await appendPrivacyContactMessage(reference, accessKey, message);
    const contactCase = await getPrivacyContactCase(reference, accessKey);
    if (!contactCase) return json({ error: "Sagen blev ikke fundet. Kontrollér begge oplysninger." }, 404);
    return json({ success: true, case: contactCase }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "CONTACT_CASE_NOT_FOUND") {
      return json({ error: "Sagen blev ikke fundet. Kontrollér begge oplysninger." }, 404);
    }
    if (error instanceof Error && error.message === "CONTACT_CASE_CLOSED") {
      return json({ error: "Sagen er lukket og kan ikke modtage flere beskeder." }, 409);
    }
    return json({ error: "Beskeden kunne ikke gemmes lige nu. Prøv igen senere." }, 502);
  }
}
