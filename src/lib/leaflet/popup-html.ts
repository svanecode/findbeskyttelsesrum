import { getAnvendelseskodeBeskrivelse } from "@/lib/anvendelseskoder";
import type { Anvendelseskode } from "@/types/anvendelseskode";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeShelterName(name: string) {
  const trimmed = name.trim();
  const prefix = "Shelter at ";
  if (trimmed.startsWith(prefix)) {
    return `Beskyttelsesrum ved ${trimmed.slice(prefix.length)}`;
  }
  return trimmed;
}

export type PopupHtmlArgs = {
  title: string;
  usageLine?: string | null;
  postalLine?: string | null;
  capacity: number;
  href: string;
};

export function buildLeafletPopupHtml({ title, usageLine, postalLine, capacity, href }: PopupHtmlArgs) {
  const cap = capacity.toLocaleString("da-DK");
  const hasMeta = Boolean((usageLine ?? "").trim()) || Boolean((postalLine ?? "").trim());

  const metaBlock = hasMeta
    ? `<div class="fb-popup__address">
        ${usageLine ? `<p class="fb-popup__line">${escapeHtml(usageLine)}</p>` : ""}
        ${postalLine ? `<p class="fb-popup__line">${escapeHtml(postalLine)}</p>` : ""}
      </div>`
    : "";

  return `<div class="fb-popup" style="min-width:240px;">
    <p class="fb-popup__title">${escapeHtml(title)}</p>
    ${metaBlock}
    <p class="fb-popup__capacity">${escapeHtml(cap)} pladser</p>
    <a class="fb-popup__link" href="${escapeHtml(href)}">Se detaljer</a>
  </div>`;
}

export function usageFromSourceApplicationCode(
  sourceApplicationCode: string | null | undefined,
  anvendelseskoder: Anvendelseskode[],
) {
  const text = getAnvendelseskodeBeskrivelse(sourceApplicationCode ?? null, anvendelseskoder).trim();
  return text || "";
}

