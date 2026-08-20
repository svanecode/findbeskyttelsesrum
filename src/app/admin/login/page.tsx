import type { Metadata } from "next";
import { redirect } from "next/navigation";

import GlobalFooter from "@/components/GlobalFooter";
import { getOptionalModeratorSession } from "@/lib/moderation/auth";

import LoginButton from "./login-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moderatorlogin",
  robots: { index: false, follow: false },
};

const errorMessages: Record<string, string> = {
  missing_code: "Loginforløbet manglede en godkendelseskode. Prøv igen.",
  oauth_failed: "GitHub-login kunne ikke gennemføres. Prøv igen.",
  identity_missing: "GitHub-identiteten kunne ikke bekræftes.",
  not_authorized: "GitHub-kontoen er ikke godkendt som moderator.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getOptionalModeratorSession();
  if (session?.profile?.assuranceLevel === "aal2") redirect("/admin");
  if (session?.profile) redirect("/admin/mfa");

  const { error } = await searchParams;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-xl border border-white/10 bg-white/5 p-6 shadow-2xl sm:p-8">
          <p className="text-sm uppercase tracking-wide text-orange-300">Privat administration</p>
          <h1 className="mt-3 text-3xl font-bold">Moderatorlogin</h1>
          <p className="mt-4 text-sm leading-6 text-gray-300">
            Adgang kræver en godkendt GitHub-konto og en efterfølgende kode fra en authenticator-app.
          </p>
          {error ? (
            <p className="mt-5 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
              {errorMessages[error] ?? "Login kunne ikke gennemføres."}
            </p>
          ) : null}
          <div className="mt-6">
            <LoginButton />
          </div>
        </section>
      </div>
      <GlobalFooter />
    </main>
  );
}
