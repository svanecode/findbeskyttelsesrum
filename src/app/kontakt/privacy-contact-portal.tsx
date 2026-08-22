"use client";

import { useRef, useState, type FormEvent } from "react";

import { ui } from "@/components/ui-classes";
import {
  formatContactAccessKey,
  privacyContactCategories,
  type PrivacyContactCase,
  type PrivacyContactCategory,
  type PrivacyContactStatus,
} from "@/lib/contact/privacy-contact";

type Credentials = { reference: string; accessKey: string };
type RequestState = "idle" | "submitting";

const statusLabels: Record<PrivacyContactStatus, string> = {
  open: "Modtaget",
  reviewing: "Under behandling",
  answered: "Besvaret",
  closed: "Lukket",
};

const categoryLabels = Object.fromEntries(
  privacyContactCategories.map((category) => [category.value, category.label]),
) as Record<PrivacyContactCategory, string>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function statusClass(status: PrivacyContactStatus) {
  if (status === "open") return "border-orange-400/30 bg-orange-500/10 text-orange-100";
  if (status === "reviewing") return "border-blue-400/30 bg-blue-500/10 text-blue-100";
  if (status === "answered") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  return "border-white/15 bg-white/5 text-gray-300";
}

function CaseConversation({ contactCase }: { contactCase: PrivacyContactCase }) {
  return (
    <div className="mt-5 space-y-3" aria-label="Sagens beskeder">
      {contactCase.messages.map((message) => (
        <article
          key={message.id}
          className={`rounded-lg border p-4 ${
            message.authorType === "moderator"
              ? "border-emerald-400/20 bg-emerald-500/[0.07]"
              : "border-white/10 bg-black/20"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className={message.authorType === "moderator" ? "font-semibold text-emerald-200" : "font-semibold text-gray-300"}>
              {message.authorType === "moderator" ? "Svar fra Find Beskyttelsesrum" : "Din besked"}
            </p>
            <time className="text-gray-500" dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">{message.message}</p>
        </article>
      ))}
    </div>
  );
}

export default function PrivacyContactPortal() {
  const [createState, setCreateState] = useState<RequestState>("idle");
  const [lookupState, setLookupState] = useState<RequestState>("idle");
  const [replyState, setReplyState] = useState<RequestState>("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<Credentials | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [contactCase, setContactCase] = useState<PrivacyContactCase | null>(null);
  const [messageLength, setMessageLength] = useState(0);
  const [replyLength, setReplyLength] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  const caseHeadingRef = useRef<HTMLHeadingElement>(null);

  const loadCase = async (caseCredentials: Credentials) => {
    setLookupState("submitting");
    setLookupError(null);
    setContactCase(null);

    try {
      const response = await fetch("/api/app-v2/privacy-contact/cases/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caseCredentials),
      });
      const result = (await response.json()) as { success?: boolean; case?: PrivacyContactCase; error?: string };
      if (!response.ok || !result.success || !result.case) {
        throw new Error(result.error || "Sagen kunne ikke hentes.");
      }

      setCredentials(caseCredentials);
      setContactCase(result.case);
      window.requestAnimationFrame(() => caseHeadingRef.current?.focus());
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Sagen kunne ikke hentes. Prøv igen senere.");
    } finally {
      setLookupState("idle");
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setCreateState("submitting");
    setCreateError(null);
    setCopyStatus(null);

    const form = new FormData(formElement);
    const payload = {
      category: form.get("category"),
      subject: form.get("subject"),
      message: form.get("message"),
      website: form.get("website"),
    };

    try {
      const response = await fetch("/api/app-v2/privacy-contact/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        success?: boolean;
        reference?: string;
        accessKey?: string;
        error?: string;
      };
      if (!response.ok || !result.success || !result.reference || !result.accessKey) {
        throw new Error(result.error || "Henvendelsen kunne ikke gemmes.");
      }

      const nextCredentials = { reference: result.reference, accessKey: result.accessKey };
      setCreatedCredentials(nextCredentials);
      setCredentials(nextCredentials);
      setContactCase(null);
      formElement.reset();
      setMessageLength(0);
      window.requestAnimationFrame(() => receiptHeadingRef.current?.focus());
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Henvendelsen kunne ikke gemmes. Prøv igen senere.");
    } finally {
      setCreateState("idle");
    }
  };

  const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await loadCase({
      reference: String(form.get("reference") ?? ""),
      accessKey: String(form.get("accessKey") ?? ""),
    });
  };

  const handleReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!credentials) return;
    const formElement = event.currentTarget;

    setReplyState("submitting");
    setReplyError(null);
    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/app-v2/privacy-contact/cases/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          message: form.get("message"),
          website: form.get("website"),
        }),
      });
      const result = (await response.json()) as { success?: boolean; case?: PrivacyContactCase; error?: string };
      if (!response.ok || !result.success || !result.case) {
        throw new Error(result.error || "Beskeden kunne ikke gemmes.");
      }

      setContactCase(result.case);
      formElement.reset();
      setReplyLength(0);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Beskeden kunne ikke gemmes. Prøv igen senere.");
    } finally {
      setReplyState("idle");
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    try {
      await navigator.clipboard.writeText(
        `Find Beskyttelsesrum\nSagsnummer: ${createdCredentials.reference}\nAdgangskode: ${formatContactAccessKey(createdCredentials.accessKey)}\nSvar: ${window.location.origin}/kontakt`,
      );
      setCopyStatus("Sagsoplysningerne er kopieret.");
    } catch {
      setCopyStatus("Kopiering blev blokeret. Markér og kopiér oplysningerne manuelt.");
    }
  };

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className={`${ui.panel} p-5 sm:p-6`} aria-labelledby="new-contact-heading">
        <h2 id="new-contact-heading" className="text-xl font-semibold text-white">Send en ny henvendelse</h2>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          Skriv kun det, der er nødvendigt. Undlad CPR-nummer, helbredsoplysninger, billeder af ID og andre følsomme
          oplysninger i den første besked.
        </p>

        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div>
            <label htmlFor="privacy-contact-category" className="block text-sm font-medium text-gray-200">Hvad handler det om?</label>
            <select id="privacy-contact-category" name="category" required defaultValue="" className={`mt-2 ${ui.input}`}>
              <option value="" disabled>Vælg type</option>
              {privacyContactCategories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="privacy-contact-subject" className="block text-sm font-medium text-gray-200">Emne</label>
            <input id="privacy-contact-subject" name="subject" required minLength={3} maxLength={120} className={`mt-2 ${ui.input}`} />
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="privacy-contact-message" className="block text-sm font-medium text-gray-200">Besked</label>
              <span className="text-xs tabular-nums text-gray-400">{messageLength}/4.000</span>
            </div>
            <textarea
              id="privacy-contact-message"
              name="message"
              required
              minLength={10}
              maxLength={4_000}
              rows={7}
              onChange={(event) => setMessageLength(event.target.value.length)}
              className={`${ui.input} mt-2 min-h-40 py-3`}
            />
          </div>

          <div className="sr-only" aria-hidden="true">
            <label htmlFor="privacy-contact-website">Websted</label>
            <input id="privacy-contact-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          {createError ? <p className="text-sm text-red-200" role="alert">{createError}</p> : null}
          <button type="submit" disabled={createState === "submitting"} className={`${ui.primaryAction} min-h-[48px] disabled:cursor-wait disabled:opacity-60`}>
            {createState === "submitting" ? "Gemmer henvendelse …" : "Send henvendelse"}
          </button>
        </form>

        {createdCredentials ? (
          <div className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-500/[0.08] p-4" role="status">
            <h3 ref={receiptHeadingRef} tabIndex={-1} className="text-lg font-semibold text-emerald-100">Henvendelsen er modtaget</h3>
            <p className="mt-2 text-sm leading-6 text-gray-200">
              Gem begge oplysninger nu. Adgangskoden vises kun her og kan ikke genskabes.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-gray-400">Sagsnummer</dt>
              <dd className="break-all font-mono font-semibold text-white">{createdCredentials.reference}</dd>
              <dt className="text-gray-400">Adgangskode</dt>
              <dd className="break-all font-mono font-semibold text-white">{formatContactAccessKey(createdCredentials.accessKey)}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={copyCredentials} className={ui.secondaryAction}>Kopiér sagsoplysninger</button>
              <button type="button" onClick={() => void loadCase(createdCredentials)} className={ui.secondaryAction}>Åbn sagen</button>
            </div>
            {copyStatus ? <p className="mt-3 text-xs leading-5 text-gray-300" aria-live="polite">{copyStatus}</p> : null}
          </div>
        ) : null}
      </section>

      <section className={`${ui.panel} p-5 sm:p-6`} aria-labelledby="existing-contact-heading">
        <h2 id="existing-contact-heading" className="text-xl font-semibold text-white">Læs svar eller fortsæt en sag</h2>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          Svar sendes ikke på mail. Gå tilbage hertil med det sagsnummer og den adgangskode, du fik ved indsendelsen.
        </p>

        <form key={credentials?.reference ?? "empty"} onSubmit={handleLookup} className="mt-5 space-y-4">
          <div>
            <label htmlFor="privacy-contact-reference" className="block text-sm font-medium text-gray-200">Sagsnummer</label>
            <input
              id="privacy-contact-reference"
              name="reference"
              required
              maxLength={21}
              autoCapitalize="characters"
              autoComplete="off"
              defaultValue={credentials?.reference ?? ""}
              placeholder="FBR-2026-XXXXXXXX"
              className={`mt-2 font-mono uppercase ${ui.input}`}
            />
          </div>
          <div>
            <label htmlFor="privacy-contact-access-key" className="block text-sm font-medium text-gray-200">Adgangskode</label>
            <input
              id="privacy-contact-access-key"
              name="accessKey"
              type="password"
              required
              maxLength={48}
              autoComplete="off"
              defaultValue={credentials ? formatContactAccessKey(credentials.accessKey) : ""}
              className={`mt-2 font-mono uppercase ${ui.input}`}
            />
          </div>
          {lookupError ? <p className="text-sm text-red-200" role="alert">{lookupError}</p> : null}
          <button type="submit" disabled={lookupState === "submitting"} className={`${ui.secondaryAction} disabled:cursor-wait disabled:opacity-60`}>
            {lookupState === "submitting" ? "Henter sag …" : "Hent sag"}
          </button>
        </form>

        {contactCase ? (
          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 ref={caseHeadingRef} tabIndex={-1} className="text-lg font-semibold text-white">{contactCase.subject}</h3>
                <p className="mt-1 text-xs text-gray-400">{contactCase.reference} · {categoryLabels[contactCase.category]}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(contactCase.status)}`}>
                {statusLabels[contactCase.status]}
              </span>
            </div>

            <CaseConversation contactCase={contactCase} />

            {contactCase.status !== "closed" ? (
              <form onSubmit={handleReply} className="mt-5 border-t border-white/10 pt-5">
                <div className="flex items-end justify-between gap-3">
                  <label htmlFor="privacy-contact-reply" className="block text-sm font-medium text-gray-200">Send en opfølgning</label>
                  <span className="text-xs tabular-nums text-gray-400">{replyLength}/4.000</span>
                </div>
                <textarea
                  id="privacy-contact-reply"
                  name="message"
                  required
                  minLength={2}
                  maxLength={4_000}
                  rows={5}
                  onChange={(event) => setReplyLength(event.target.value.length)}
                  className={`${ui.input} mt-2 min-h-32 py-3`}
                />
                <div className="sr-only" aria-hidden="true">
                  <label htmlFor="privacy-contact-reply-website">Websted</label>
                  <input id="privacy-contact-reply-website" name="website" tabIndex={-1} autoComplete="off" />
                </div>
                {replyError ? <p className="mt-3 text-sm text-red-200" role="alert">{replyError}</p> : null}
                <button type="submit" disabled={replyState === "submitting"} className={`${ui.secondaryAction} mt-3 disabled:cursor-wait disabled:opacity-60`}>
                  {replyState === "submitting" ? "Gemmer besked …" : "Send opfølgning"}
                </button>
              </form>
            ) : (
              <p className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-gray-300">
                Sagen er lukket. Opret en ny henvendelse, hvis du har et nyt spørgsmål.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <aside className="lg:col-span-2 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-gray-400">
        Henvendelser gennemgås manuelt. Anmodninger om persondatarettigheder besvares hurtigst muligt og som
        udgangspunkt senest inden én måned. Det kan være nødvendigt at bede om mindst mulig yderligere information for
        at sikre, at oplysninger udleveres til den rette person.
      </aside>
    </div>
  );
}
