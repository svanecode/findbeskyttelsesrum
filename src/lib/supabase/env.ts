function getFirstDefined(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim());
}

export class SupabaseConfigurationError extends Error {
  readonly code = "SUPABASE_CONFIGURATION_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabaseWriteEnv() {
  const url = getFirstDefined(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secretKey = getFirstDefined(process.env.SUPABASE_SECRET_KEY);

  if (!url || !secretKey) {
    throw new SupabaseConfigurationError(
      "Missing server Supabase write environment variables. Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }

  return { url, secretKey };
}

export function getSupabasePublicEnv() {
  const url = getFirstDefined(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = getFirstDefined(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url || !publishableKey) {
    throw new SupabaseConfigurationError(
      "Missing public Supabase environment variables. Expected NEXT_PUBLIC_SUPABASE_URL and a publishable or legacy anon key.",
    );
  }

  return { url, publishableKey };
}
