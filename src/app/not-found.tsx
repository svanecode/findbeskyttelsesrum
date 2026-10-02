import Link from "next/link";
import type { Metadata } from "next";

import AddressSearch from "@/components/AddressSearch";
import { ui } from "@/components/ui-classes";

export const metadata: Metadata = {
  title: "Siden findes ikke",
  description: "Den side, du ledte efter, findes ikke på Find Beskyttelsesrum.",
  robots: { index: false, follow: false },
};

/** A shared link that leads nowhere should still lead straight to a search. */
export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <section className="max-w-[40rem]" aria-labelledby="not-found-heading">
          <h1 id="not-found-heading" className={ui.pageTitle}>Siden findes ikke</h1>
          <p className="mt-2 text-base leading-7 text-gray-300">
            Adressen er forkert eller findes ikke længere. Søg efter beskyttelsesrum nær dig her.
          </p>

          <div suppressHydrationWarning className="relative z-20 mt-6">
            <AddressSearch />
          </div>

          <nav className="mt-6 flex flex-wrap gap-x-6 text-base" aria-label="Andre veje videre">
            <Link href="/" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Til forsiden</Link>
            <Link href="/kommune" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Find en kommune</Link>
          </nav>
        </section>
      </div>
    </main>
  );
}
