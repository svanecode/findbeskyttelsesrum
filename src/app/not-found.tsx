import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import { ui } from "@/components/ui-classes";

export const metadata: Metadata = {
  title: "Siden findes ikke",
  description: "Den side, du ledte efter, findes ikke på Find Beskyttelsesrum.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
        <p className={ui.eyebrow}>404</p>
        <h1 className={`mt-2 ${ui.pageTitle}`}>Siden findes ikke</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-300">
          Tjek adressen, eller gå til forsiden eller kommuneoversigten.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className={ui.primaryAction}
          >
            Forside
          </Link>
          <Link
            href="/kommune"
            className={ui.secondaryAction}
          >
            Kommuneoversigt
          </Link>
        </div>
      </div>

      <GlobalFooter />
    </main>
  );
}
