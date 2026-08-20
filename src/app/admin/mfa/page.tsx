import type { Metadata } from "next";
import { redirect } from "next/navigation";

import GlobalFooter from "@/components/GlobalFooter";
import { requireModerator } from "@/lib/moderation/auth";

import MfaPanel from "./mfa-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bekræft moderatoradgang",
  robots: { index: false, follow: false },
};

export default async function AdminMfaPage() {
  const { profile } = await requireModerator(false);
  if (profile.assuranceLevel === "aal2") redirect("/admin");

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-xl border border-white/10 bg-white/5 p-6 shadow-2xl sm:p-8">
          <p className="text-sm uppercase tracking-wide text-orange-300">To-faktor-godkendelse</p>
          <h1 className="mt-3 text-3xl font-bold">Bekræft din adgang</h1>
          <div className="mt-6">
            <MfaPanel />
          </div>
        </section>
      </div>
      <GlobalFooter />
    </main>
  );
}
