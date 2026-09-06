import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import * as pagination from "../src/lib/moderation/pagination";
import * as privacyContact from "../src/lib/contact/privacy-contact";
import { loadServerModule } from "./support/load-server-module";

const reportStatuses = ["open", "reviewing", "resolved", "rejected"] as const;

test("moderation pages reject invalid or unbounded page parameters", () => {
  for (const value of [undefined, "0", "-1", "2.5", "100000000000000000000", ["2"], "bad"]) {
    assert.equal(pagination.parseModerationPage(value), 1);
  }
  assert.equal(pagination.parseModerationPage("6"), 6);
});

test("report and contact DAL request the selected page and preserve global status totals", async () => {
  for (const queue of ["reports", "privacy-contacts"] as const) {
    const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
    const counts = queue === "reports" ? { open: 260, reviewing: 1 } : { open: 260, closed: 1 };
    const client = {
      schema: () => ({
        rpc: async (name: string, parameters: Record<string, unknown>) => {
          calls.push({ name, parameters });
          return { error: null, data: { rows: [], counts, totalCount: 1, page: 1, pageSize: 50, totalPages: 1 } };
        },
      }),
    } as unknown as SupabaseClient;
    const readers = await loadServerModule<Record<string, (client: SupabaseClient, status: string, page: number) => Promise<pagination.ModerationQueuePage<unknown, string>>>>(
      new URL(`../src/lib/moderation/${queue}.ts`, import.meta.url),
      { "@/lib/moderation/pagination": pagination, "@/lib/contact/privacy-contact": privacyContact },
    );
    const status = queue === "reports" ? "reviewing" : "closed";
    const method = queue === "reports" ? "getModerationReports" : "getModerationPrivacyContactCases";
    const result = await readers[method](client, status, 6);
    assert.deepEqual(calls[0].parameters, { p_status: status, p_page: 6, p_limit: 50 });
    assert.match(calls[0].name, /_v2$/);
    assert.equal(result.counts.open, 260, "status totals must not derive from the visible page");
    assert.equal(result.counts[status], 1);
    assert.equal(result.page, 1, "the UI must honor a page clamped by the database");
  }
});

test("moderation redirects preserve validated filters and pages on successful and failed actions", async (t) => {
  t.mock.method(console, "error", () => undefined);
  class ActionRedirect extends Error {
    constructor(readonly path: string) { super(path); }
  }
  for (const basePath of ["/admin", "/admin/kontakt"] as const) {
    const isContact = basePath === "/admin/kontakt";
    for (const outcome of ["success", "database_error", "invalid_action", "invalid_context", ...(isContact ? ["invalid_message"] : [])]) {
      let databaseCalls = 0;
      const actions = await loadServerModule<Record<string, (form: FormData) => Promise<void>>>(
        new URL(`../src/app${basePath}/actions.ts`, import.meta.url),
        {
          "next/cache": { revalidatePath: () => undefined },
          "next/navigation": { redirect: (path: string) => { throw new ActionRedirect(path); } },
          "@/lib/moderation/auth": { requireModerator: async () => ({ supabase: { schema: () => ({ rpc: async () => {
            databaseCalls += 1;
            return { error: outcome === "database_error" ? { code: "TEST_FAILURE" } : null };
          } }) } }) },
          "@/lib/moderation/pagination": pagination,
          "@/lib/moderation/reports": { reportStatuses },
          "@/lib/contact/privacy-contact": privacyContact,
          "@/lib/moderation/revalidate-public-data": { revalidatePublicData: () => undefined },
        },
      );
      const form = new FormData();
      form.set(isContact ? "caseId" : "reportId", outcome === "invalid_action" ? "invalid" : "94000000-0000-4000-8000-000000000003");
      form.set("action", isContact ? "close" : "resolve_no_change");
      form.set("message", outcome === "invalid_message" ? "x".repeat(4_001) : "Test message");
      form.set("returnPage", outcome === "invalid_context" ? "https://attacker.invalid" : "6");
      form.set("returnStatus", outcome === "invalid_context" ? "reviewing&redirect=https://attacker.invalid" : "reviewing");
      form.set("returnTo", "https://attacker.invalid");
      await assert.rejects(
        actions[isContact ? "moderatePrivacyContactAction" : "moderateReportAction"](form),
        (error: unknown) => {
          assert.ok(error instanceof ActionRedirect);
          const destination = new URL(error.path, "https://example.invalid");
          assert.equal(destination.origin, "https://example.invalid");
          assert.equal(destination.pathname, basePath);
          assert.equal(destination.searchParams.get("page"), outcome === "invalid_context" ? "1" : "6");
          assert.equal(destination.searchParams.get("status"), outcome === "invalid_context" ? null : "reviewing");
          const expectedError = outcome === "database_error" ? "moderation_failed"
            : outcome === "invalid_action" || outcome === "invalid_message" ? outcome : null;
          assert.equal(destination.searchParams.get("error"), expectedError);
          assert.equal(destination.searchParams.get("updated"), expectedError ? null : "1");
          return true;
        },
      );
      assert.equal(databaseCalls, outcome === "invalid_action" || outcome === "invalid_message" ? 0 : 1);
    }
  }
});

test("every rendered moderation card form posts the current clamped page and selected filter", async () => {
  const now = new Date().toISOString();
  for (const isContact of [false, true]) {
    const rows = isContact
      ? ["open", "reviewing", "closed"].map((status, index) => ({
        id: String(index), reference: `FBR-2026-AAAAAAA${index}`, subject: "Test case", status,
        category: "other", messages: [], responseDueAt: now, retentionUntil: now,
      }))
      : ["open", "reviewing", "resolved"].map((status, index) => ({
        id: String(index), status, type: "other", createdAt: now, message: "Test report",
        shelter: { slug: "test", addressLine1: "Testvej 1", postalCode: "1000", city: "Testby", municipalityName: "Test", capacity: 40 },
      }));
    const queue = { rows, counts: { open: 1, reviewing: 1, ...(isContact ? { answered: 0, closed: 1 } : { resolved: 1, rejected: 0 }) }, page: 6, pageSize: 50, totalPages: 6, totalCount: 253 };
    const page = await loadServerModule<{ default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode> }>(
      new URL(`../src/app/admin/${isContact ? "kontakt/" : ""}page.tsx`, import.meta.url),
      {
        "react/jsx-runtime": jsxRuntime,
        "next/link": ({ children, ...props }: { children: ReactNode }) => createElement("a", props, children),
        "@/components/ModerationPagination": () => null,
        "@/lib/moderation/pagination": pagination,
        "@/lib/moderation/auth": { requireModerator: async () => ({ profile: { providerLogin: "Test", role: "moderator" }, supabase: {} }) },
        "@/lib/moderation/reports": { reportStatuses, getModerationReports: async () => queue },
        "@/lib/contact/privacy-contact": privacyContact,
        "@/lib/moderation/privacy-contacts": { getModerationPrivacyContactCases: async () => queue },
        "./actions": { moderateReportAction: "/test-action", moderatePrivacyContactAction: "/test-action", signOutModeratorAction: "/sign-out" },
      },
    );
    const markup = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ page: "999", status: "reviewing" }) }));
    const forms = [...markup.matchAll(/<form\b[^>]*action="\/test-action"[^>]*>([\s\S]*?)<\/form>/g)];
    assert.equal(forms.length, isContact ? 5 : 4, "all actionable card branches must retain return context");
    for (const [, form] of forms) {
      assert.match(form, /name="returnPage" value="6"/, "use the database-clamped page, not raw page=999");
      assert.match(form, /name="returnStatus" value="reviewing"/);
    }
  }
});
