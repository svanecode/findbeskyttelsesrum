import type { Route } from "next";
import Link from "next/link";

import type { ModeratorProfile } from "@/lib/moderation/auth";

type AdminSection = "reports" | "contact" | "drift";

const sections: Array<{ id: AdminSection; href: Route; label: string }> = [
  { id: "reports", href: "/admin", label: "Fejlrapporter" },
  { id: "contact", href: "/admin/kontakt", label: "Kontaktkø" },
  { id: "drift", href: "/admin/drift", label: "Datadrift" },
];

/** Shared heading, section tabs and sign-out for every signed-in admin page. */
export default function AdminHeader({
  current,
  title,
  description,
  profile,
  signOutAction,
}: {
  current: AdminSection;
  title: string;
  description?: string;
  profile: Pick<ModeratorProfile, "providerLogin" | "role">;
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <p className="text-sm text-gray-400">
          <span className="font-semibold uppercase tracking-wide text-orange-300">Privat administration</span>
          <span aria-hidden> · </span>
          {profile.providerLogin} ({profile.role === "owner" ? "ejer" : "moderator"}, MFA bekræftet)
        </p>
        <form action={signOutAction}>
          <button type="submit" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-gray-200 underline underline-offset-4 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
            Log ud
          </button>
        </form>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Administration">
        {sections.map((section) => {
          const active = section.id === current;
          return (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-[44px] items-center rounded-lg border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${active ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/15 text-gray-200 hover:bg-white/5"}`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <h1 className="mt-6 text-3xl font-bold sm:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">{description}</p> : null}
    </header>
  );
}
