import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * §7 and §13. The actor is established, never claimed.
 *
 * Every command used to take an `actor` in its request body. Roles were
 * enforced against it, so the permissions were real — but the identity was
 * not: any caller could send actor: "john" and act as an administrator, and
 * the audit trail would name John. §13 exists so a change traces to a person,
 * and a name someone typed about themselves is not that.
 *
 * These are structural assertions rather than request tests, because the thing
 * worth guarding is that no route ever reintroduces the parameter.
 */
async function routeFiles(dir = "app/api", found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await routeFiles(path, found);
    else if (entry.name === "route.ts") found.push(path);
  }
  return found;
}

const routes = await routeFiles();

test("no route reads an actor from the request body", async () => {
  const offenders = [];
  for (const path of routes) {
    const source = await readFile(path, "utf8");
    if (/body\??\.actor|actor\?: string/.test(source)) offenders.push(path);
  }
  assert.deepEqual(offenders, [],
    "a route taking an actor from the body lets a caller choose who they are");
});

test("every command route authorises before it acts", async () => {
  // A route that writes without asking is one anybody can call.
  const offenders = [];
  for (const path of routes) {
    const source = await readFile(path, "utf8");
    if (!/export async function POST/.test(source)) continue;
    // Ending your own session needs no permission: the only thing it can do
    // is take something away from the person asking.
    if (path.includes("/sign-out/")) continue;
    if (!/authorize\(/.test(source)) offenders.push(path);
  }
  assert.deepEqual(offenders, []);
});

test("authorize takes a permission and nothing else", async () => {
  const source = await readFile("lib/command.ts", "utf8");
  assert.match(source, /export async function authorize\(\s*permission: Permission,/,
    "an actor parameter would mean the caller still chooses");
  assert.match(source, /currentPrincipal\(\)/, "identity comes from the session");
});

test("the browser never names the acting user", async () => {
  const source = await readFile("GreenlitControlTower.jsx", "utf8");
  assert.doesNotMatch(source, /actor:\s*CURRENT_USER/,
    "the screen deciding who somebody is was the dropdown's mistake in a constant");
  assert.doesNotMatch(source, /const CURRENT_USER\s*=/);
});

test("middleware gates everything except the two doors and the health check", async () => {
  // The list is asserted exactly rather than by length, so adding a public
  // route is a deliberate edit to this test and not a silent one. Anything
  // else public is a screen somebody forgot to check.
  const source = await readFile("middleware.ts", "utf8");
  assert.match(source, /const PUBLIC = \["\/sign-in", "\/sign-up", "\/api\/health"\]/);
  assert.match(source, /auth\.getUser\(\)/,
    "getUser revalidates; getSession would trust a cookie the browser handed us");
});

test("registration cannot choose its own role", async () => {
  // The one thing self-service registration must not decide. A person who
  // could pass a role to the provisioning call would be choosing it.
  const auth = await readFile("lib/auth.ts", "utf8");
  assert.match(auth, /ensurePrincipal\(email, name, joiningRole\(email\)\)/,
    "the role must come from joiningRole, never from the session or the request");
  assert.match(auth, /if \(!canJoin\(email\)\.ok\) return null;/,
    "the domain is re-checked server-side on every sign-in, not only at registration");

  // What the browser sends, not what the file mentions: an earlier version of
  // this assertion matched role="alert" on an error message and the word in a
  // comment, which would have failed on correct code and passed on a rename.
  const form = await readFile("app/sign-up/SignUpForm.tsx", "utf8");
  const payload = form.slice(form.indexOf("auth.signUp("), form.indexOf("setBusy(false)"));
  assert.doesNotMatch(payload, /\brole\b/,
    "the registration request must not carry a role for the server to trust");
});
