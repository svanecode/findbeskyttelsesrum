"use client";

import { useRouter } from "next/navigation";

type Props = {
  fallbackHref: string;
  label: string;
  shortLabel?: string;
};

export default function BackLinkButton({ fallbackHref, label, shortLabel }: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        // If user came from another page, go back. If this page was opened directly, fall back.
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className="-ml-2 inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg py-2 pl-2 pr-3 text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
      aria-label={label}
    >
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span className="max-w-[min(100%,14rem)] truncate text-sm font-medium text-gray-300 sm:max-w-xs">
        {shortLabel ?? label}
      </span>
    </button>
  );
}

