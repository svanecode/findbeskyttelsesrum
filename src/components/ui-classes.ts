export const ui = {
  page: "min-h-screen bg-[var(--surface-page)] text-white",
  panel: "rounded-xl border border-white/10 bg-[var(--surface-elevated)]",
  panelInset: "rounded-lg border border-white/10 bg-[var(--surface-inset)]",
  eyebrow: "text-xs font-semibold uppercase tracking-[0.14em] text-gray-400",
  pageTitle:
    "break-words font-space-grotesk text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl",
  sectionTitle: "break-words font-space-grotesk text-xl font-semibold tracking-[-0.015em] text-white",
  lead: "max-w-2xl text-base leading-7 text-gray-300 sm:text-lg sm:leading-8",
  input:
    "min-h-[48px] w-full rounded-lg border border-white/15 bg-[var(--surface-input)] px-4 text-base text-white placeholder:text-gray-400 focus:border-[var(--accent)] focus:bg-[var(--surface-input-focus)] focus:outline-none",
  primaryAction:
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0b0c0e] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400",
  secondaryAction:
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]",
  quietAction:
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white",
  textLink:
    "font-medium text-gray-100 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white/70",
} as const;
