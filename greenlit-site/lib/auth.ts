import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRepository } from "./greenlit";
import { canJoin, joiningRole, suggestedDisplayName, type Principal } from "@greenlit/engine";

/**
 * §7 and §13. Who is acting, established rather than claimed.
 *
 * Every command used to take an `actor` in its request body. The roles were
 * enforced against it, so the permissions were real — but the identity was
 * not: anyone who could reach the API could send `actor: "john"` and be an
 * administrator. §13 requires that a change be traceable to a person, and a
 * name someone typed about themselves is not that.
 *
 * The actor now comes from a verified Supabase session and is never read from
 * a request body. The directory still decides what that person may do; the
 * session decides who they are.
 */

/** The anon key is safe in the browser: it grants nothing without a session. */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** A Supabase client bound to this request's cookies. */
export async function serverAuthClient() {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The signed-in principal, or null.
 *
 * Someone signing in for the first time is provisioned here, because Supabase
 * knows that they exist and knows nothing about what they may do. Their role
 * comes from joiningRole — never from the session, the request, or anything
 * else the person controls. Everyone lands on OPERATIONS; an administrator
 * raises them afterwards.
 *
 * Null means nobody is signed in, or the address is not a company one, or the
 * account has been switched off. All three read the same way from outside: an
 * outsider learning which of them applies is an outsider learning who works
 * here.
 */
export async function currentPrincipal(): Promise<Principal | null> {
  const client = await serverAuthClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;

  const email = data.user.email;
  // Re-checked on every sign-in rather than only at registration: an address
  // that stops being a company one must stop being able to read the book.
  if (!canJoin(email).ok) return null;

  const existing = await getRepository().getPrincipalByEmail(email);
  if (existing) return existing.active ? existing : null;

  // First sign-in. The name they gave at registration is on the auth record.
  const name = typeof data.user.user_metadata?.display_name === "string"
    ? data.user.user_metadata.display_name
    : suggestedDisplayName(email);

  return getRepository().ensurePrincipal(email, name, joiningRole(email));
}

/** Whether sign-in is configured at all. Without it the app cannot be used. */
export function authConfigured(): boolean {
  return supabaseEnv() !== null;
}
