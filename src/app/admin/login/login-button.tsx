"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setError("GitHub-login kunne ikke startes. Prøv igen.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-orange-500 px-5 py-3 text-sm font-semibold text-[#0a0a0a] transition-colors hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Åbner GitHub…" : "Log ind med GitHub"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
    </div>
  );
}
