import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";

export const metadata: Metadata = {
  title: "Siden findes ikke",
  description: "Den side, du ledte efter, findes ikke på Find Beskyttelsesrum.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-medium uppercase tracking-wider text-gray-400">404</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Siden findes ikke</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-300">
          Tjek adressen, eller gå til forsiden eller kommuneoversigten.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Forside
          </Link>
          <Link
            href="/kommune"
            className="inline-flex items-center rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-gray-100 transition hover:bg-white/10"
          >
            Kommuneoversigt
          </Link>
        </div>
      </div>

      <GlobalFooter />
    </main>
  );
}
