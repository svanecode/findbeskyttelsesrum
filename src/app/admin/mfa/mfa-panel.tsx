"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "loading" | "setup" | "enroll" | "challenge" | "complete";

export default function MfaPanel() {
  const router = useRouter();
  const initialized = useRef(false);
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [unverifiedFactorIds, setUnverifiedFactorIds] = useState<string[]>([]);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const supabase = createSupabaseBrowserClient();
    void supabase.auth.mfa.listFactors().then(({ data, error: factorError }) => {
      if (factorError) {
        setError("MFA-status kunne ikke hentes. Genindlæs siden.");
        setMode("setup");
        return;
      }

      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setMode("challenge");
        return;
      }

      setUnverifiedFactorIds(
        data.all
          .filter((factor) => factor.factor_type === "totp" && factor.status === "unverified")
          .map((factor) => factor.id),
      );
      setMode("setup");
    });
  }, []);

  async function beginEnrollment() {
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    for (const oldFactorId of unverifiedFactorIds) {
      await supabase.auth.mfa.unenroll({ factorId: oldFactorId });
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Find Beskyttelsesrum administration",
    });

    if (enrollError) {
      setError("Authenticator-opsætningen kunne ikke startes. Prøv igen.");
      setPending(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setMode("enroll");
    setPending(false);
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Indtast den sekscifrede kode fra din authenticator-app.");
      return;
    }

    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

    if (verifyError) {
      setError("Koden kunne ikke bekræftes. Kontrollér koden og prøv igen.");
      setPending(false);
      return;
    }

    setMode("complete");
    router.replace("/admin");
    router.refresh();
  }

  if (mode === "loading") {
    return <p className="text-sm text-gray-300" role="status">Kontrollerer MFA-status…</p>;
  }

  if (mode === "setup") {
    return (
      <div>
        <p className="text-sm leading-6 text-gray-300">
          Opsæt en gratis authenticator-app, før du kan læse eller behandle fejlrapporter.
        </p>
        <button
          type="button"
          onClick={beginEnrollment}
          disabled={pending}
          className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-lg bg-orange-500 px-5 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:opacity-60"
        >
          {pending ? "Forbereder…" : "Opsæt authenticator"}
        </button>
        {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      {mode === "enroll" && qrCode ? (
        <div className="mb-6">
          <p className="text-sm leading-6 text-gray-300">
            Scan QR-koden med din authenticator-app. Indtast derefter den sekscifrede kode nedenfor.
          </p>
          {/* A data URL returned by Supabase Auth; next/image cannot optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="QR-kode til opsætning af authenticator" className="mt-4 h-52 w-52 rounded-lg bg-white p-2" />
          {secret ? (
            <details className="mt-3 text-sm text-gray-300">
              <summary className="cursor-pointer min-h-[44px] py-3 font-medium">Kan du ikke scanne koden?</summary>
              <p className="break-all rounded-lg bg-black/30 p-3 font-mono text-xs">{secret}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mb-5 text-sm leading-6 text-gray-300">
          Indtast den aktuelle kode fra din authenticator-app for at åbne moderationskøen.
        </p>
      )}

      <form onSubmit={verifyCode}>
        <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-200">Authenticator-kode</label>
        <input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          className="mt-2 min-h-[48px] w-full rounded-lg border border-white/20 bg-black/30 px-4 text-lg tracking-[0.35em] text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
        />
        <button
          type="submit"
          disabled={pending || mode === "complete"}
          className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-orange-500 px-5 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:opacity-60"
        >
          {pending || mode === "complete" ? "Bekræfter…" : "Bekræft og fortsæt"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
    </div>
  );
}
