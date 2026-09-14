import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRepository } from "./greenlit";
import type { Principal } from "@greenlit/engine";

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
 * Two ways to be null, and they mean different things: nobody is signed in, or
 * somebody is signed in whose address is not in the directory. The second is
 * an account that exists in Supabase but is not staff here, and it must read
 * as "not one of ours" rather than as an error — otherwise adding a person to
 * Supabase would silently grant them a controller's powers.
 */
export async function currentPrincipal(): Promise<Principal | null> {
  const client = await serverAuthClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;

  const principal = await getRepository().getPrincipalByEmail(data.user.email);
  return principal?.active ? principal : null;
}

/** Whether sign-in is configured at all. Without it the app cannot be used. */
export function authConfigured(): boolean {
  return supabaseEnv() !== null;
}
