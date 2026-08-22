import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import { ui } from "@/components/ui-classes";

import PrivacyContactPortal from "./privacy-contact-portal";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Send og følg en privat henvendelse til Find Beskyttelsesrum uden at bruge e-mail.",
  alternates: { canonical: "/kontakt" },
};

export default function ContactPage() {
  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="max-w-3xl space-y-4">
          <p className={ui.eyebrow}>Privat kontakt</p>
          <h1 className={ui.pageTitle}>Kontakt uden e-mail</h1>
          <p className="text-lg leading-8 text-gray-300">
            Send en henvendelse direkte til den private kontaktkø. Du får et sagsnummer og en adgangskode, som du
            senere bruger til at læse svar. Der indsamles ingen e-mailadresse.
          </p>
        </header>

        <PrivacyContactPortal />
      </div>
      <GlobalFooter />
    </main>
  );
}
