import "server-only";

import { createHash, randomInt } from "node:crypto";

import {
  formatContactAccessKey,
  normalizeContactAccessKey,
  type PrivacyContactCase,
  type PrivacyContactCategory,
  type PrivacyContactMessage,
  type PrivacyContactStatus,
} from "@/lib/contact/privacy-contact";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

const readableAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

type PrivacyContactCaseRow = {
  case_reference: string;
  case_category: PrivacyContactCategory;
  case_subject: string;
  case_status: PrivacyContactStatus;
  case_created_at: string;
  case_updated_at: string;
  response_due_at: string;
  retention_until: string;
  messages: PrivacyContactMessage[] | null;
};

function randomReadableString(length: number) {
  return Array.from({ length }, () => readableAlphabet[randomInt(0, readableAlphabet.length)]).join("");
}

export function createPrivacyContactCredentials() {
  const reference = `FBR-${new Date().getUTCFullYear()}-${randomReadableString(8)}`;
  const accessKey = formatContactAccessKey(randomReadableString(32));
  return { reference, accessKey };
}

export function hashPrivacyContactAccessKey(accessKey: string) {
  return createHash("sha256").update(normalizeContactAccessKey(accessKey), "utf8").digest("hex");
}

function mapContactCase(row: PrivacyContactCaseRow): PrivacyContactCase {
  return {
    reference: row.case_reference,
    category: row.case_category,
    subject: row.case_subject,
    status: row.case_status,
    createdAt: row.case_created_at,
    updatedAt: row.case_updated_at,
    responseDueAt: row.response_due_at,
    retentionUntil: row.retention_until,
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

export async function submitPrivacyContactCase(input: {
  category: PrivacyContactCategory;
  subject: string;
  message: string;
}) {
  const admin = createAppV2AdminClient();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const credentials = createPrivacyContactCredentials();
    const { error } = await admin.rpc("submit_privacy_contact_case_v1", {
      p_reference: credentials.reference,
      p_access_token_hash: hashPrivacyContactAccessKey(credentials.accessKey),
      p_category: input.category,
      p_subject: input.subject,
      p_message: input.message,
    });

    if (!error) return credentials;
    if (error.code !== "23505") {
      console.error("[privacy-contact] Could not create case:", { code: error.code });
      throw new Error("CONTACT_CASE_CREATE_FAILED");
    }
  }

  console.error("[privacy-contact] Could not allocate a unique case reference.");
  throw new Error("CONTACT_CASE_REFERENCE_FAILED");
}

export async function getPrivacyContactCase(reference: string, accessKey: string) {
  const admin = createAppV2AdminClient();
  const { data, error } = await admin
    .rpc("get_privacy_contact_case_v1", {
      p_reference: reference,
      p_access_token_hash: hashPrivacyContactAccessKey(accessKey),
    })
    .maybeSingle();

  if (error) {
    console.error("[privacy-contact] Could not read case:", { code: error.code });
    throw new Error("CONTACT_CASE_READ_FAILED");
  }

  return data ? mapContactCase(data as PrivacyContactCaseRow) : null;
}

export async function appendPrivacyContactMessage(reference: string, accessKey: string, message: string) {
  const admin = createAppV2AdminClient();
  const { error } = await admin.rpc("append_privacy_contact_message_v1", {
    p_reference: reference,
    p_access_token_hash: hashPrivacyContactAccessKey(accessKey),
    p_message: message,
  });

  if (!error) return;
  if (error.code === "P0002") throw new Error("CONTACT_CASE_NOT_FOUND");
  if (error.message.includes("closed")) throw new Error("CONTACT_CASE_CLOSED");

  console.error("[privacy-contact] Could not append message:", { code: error.code });
  throw new Error("CONTACT_CASE_APPEND_FAILED");
}
