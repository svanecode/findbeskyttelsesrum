import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { createAppV2AdminClient } from "@/lib/supabase/app-v2";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function loginRedirect(request: NextRequest, error: string) {
  const url = new URL("/admin/login", request.url);
  url.searchParams.set("error", error);
  return url;
}

export async function GET(request: NextRequest) {
  const target = new URL("/admin", request.url);
  const response = NextResponse.redirect(target, 303);
  const { url, publishableKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, authHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(authHeaders).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    response.headers.set("Location", loginRedirect(request, "missing_code").toString());
    return response;
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    response.headers.set("Location", loginRedirect(request, "oauth_failed").toString());
    return response;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const githubIdentity = userData.user?.identities?.find((identity) => identity.provider === "github");
  if (userError || !userData.user || !githubIdentity?.id) {
    await supabase.auth.signOut();
    response.headers.set("Location", loginRedirect(request, "identity_missing").toString());
    return response;
  }

  const providerLogin =
    typeof githubIdentity.identity_data?.user_name === "string"
      ? githubIdentity.identity_data.user_name
      : "GitHub-bruger";

  const admin = createAppV2AdminClient();
  const { data: linked, error: linkError } = await admin.rpc("link_moderator_identity_v1", {
    p_auth_user_id: userData.user.id,
    p_provider: "github",
    p_provider_subject: githubIdentity.id,
    p_provider_login: providerLogin,
  });

  if (linkError || linked !== true) {
    await supabase.auth.signOut();
    response.headers.set("Location", loginRedirect(request, "not_authorized").toString());
    return response;
  }

  response.headers.set("Location", new URL("/admin/mfa", request.url).toString());
  return response;
}
