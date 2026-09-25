/**
 * A signed-in administrator, for the route tests.
 *
 * Swapped in for `lib/auth` when the routes are bundled, so a test can drive a
 * route without a browser, a cookie or a Supabase project. Nothing else about
 * a route changes: it still calls `authorize()`, which still consults the role
 * table, so a permission the tester does not hold is still refused.
 *
 * An administrator rather than a controller because these tests exercise what
 * a route does with its input, not who may call it. Permissions have their own
 * tests, against the role table, where they belong.
 */
export type Principal = {
  userId: string; displayName: string; email: string | null; role: string; status: string;
};

export const TEST_PRINCIPAL: Principal = {
  userId: "test-user",
  displayName: "Test Operator",
  email: "test@zhenghe.com.sg",
  role: "ADMIN",
  status: "ACTIVE",
};

export async function currentPrincipal(): Promise<Principal | null> {
  return TEST_PRINCIPAL;
}

export function authConfigured(): boolean {
  return true;
}

export function supabaseEnv(): { url: string; anonKey: string } | null {
  return { url: "https://test.invalid", anonKey: "test-anon-key" };
}

export async function serverAuthClient(): Promise<never> {
  throw new Error("The route tests do not talk to Supabase auth.");
}
