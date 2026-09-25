import assert from "node:assert/strict";
import test from "node:test";
import { ROUTES_DIR, ROUTES } from "./build-screens.mjs";

/**
 * Every endpoint, called.
 *
 * The routes import extensionless — `../../../lib/command` — which Next's
 * bundler resolves and Node's does not, so until now a route could only be
 * exercised by running the server. 62 endpoints, and the only ones with a test
 * were the ones whose logic happened to live in a library.
 *
 * These do not test what each route means. They test what every route owes
 * whatever it means: that a request missing its body, or naming something that
 * does not exist, is answered rather than crashed on. A 400 and a 404 are
 * both fine. A 500 is the route falling over, and an unhandled rejection is
 * worse, because in production that is a blank page and a log line nobody
 * reads.
 *
 * `lib/auth` is stubbed at bundle time, so these run as a signed-in
 * administrator. Permissions are not what is under test here — they have their
 * own tests, against the role table — and running as somebody who may do
 * everything is what makes the routes' own handling the only thing that fails.
 */

const HANDLERS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

/**
 * The two answers that are correct and look like failures.
 *
 * Named rather than filtered by status, so a route that starts returning 500
 * for a new reason still fails. Both of these were found by this sweep and
 * neither is a defect:
 *
 *   /sign-out exists to talk to the auth provider, and the stub that lets
 *   every other route run without one refuses on purpose;
 *
 *   the document URL route answers 503 on a deployment with no file storage,
 *   which the in-memory store is. Saying so beats handing back a dead link.
 */
const EXPECTED = new Map([
  ["POST /sign-out", /do not talk to Supabase auth/],
  ["GET /jobs/[id]/documents/[documentId]", /^503$/],
]);

const excused = (key, detail) => {
  const pattern = EXPECTED.get(key);
  return Boolean(pattern && pattern.test(detail));
};

/** A route path with its `[id]` segments filled in with something plausible. */
const withParams = (route, value) =>
  route.replace(/\[([^\]]+)\]/g, () => value);

/** The params object Next would hand the handler. */
const paramsFor = (route, value) => {
  const names = [...route.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  return Object.fromEntries(names.map((n) => [n, value]));
};

const load = (route) => import(`${ROUTES_DIR}${route}/route.js`);

const request = (route, method, body) =>
  new Request(`http://test.invalid/api${withParams(route, "does-not-exist")}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Call a handler the way Next does, and say what came back. */
async function call(route, method, body) {
  const mod = await load(route);
  const handler = mod[method];
  const ctx = { params: Promise.resolve(paramsFor(route, "does-not-exist")) };
  const response = await handler(request(route, method, body), ctx);
  return response;
}

test("every route file exports at least one handler", async () => {
  const empty = [];
  for (const route of ROUTES) {
    const mod = await load(route);
    if (!HANDLERS.some((m) => typeof mod[m] === "function")) empty.push(route);
  }
  assert.deepEqual(empty, [], "these route files export no handler, so nothing answers them");
});

test("no route crashes when its body is missing", async () => {
  // A POST with no body at all. Every one of these should say what it wanted;
  // none should throw on `body.something`.
  const crashed = [];
  for (const route of ROUTES) {
    const mod = await load(route);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      if (typeof mod[method] !== "function") continue;
      try {
        const response = await call(route, method, undefined);
        if (response.status >= 500 && !excused(`${method} ${route}`, String(response.status))) {
          crashed.push(`${method} ${route} -> ${response.status}`);
        }
      } catch (error) {
        if (!excused(`${method} ${route}`, error.message)) {
          crashed.push(`${method} ${route} threw: ${error.message}`);
        }
      }
    }
  }
  assert.deepEqual(crashed, [], "these routes fell over on a request with no body");
});

test("no route crashes on a body of the wrong shape", async () => {
  // Every field a number, which is the wrong type for essentially all of them.
  // A route may refuse this; it may not throw reading it.
  const crashed = [];
  const nonsense = { id: 1, name: 2, containerIds: 3, code: 4, permitNumber: 5, movementType: 6 };
  for (const route of ROUTES) {
    const mod = await load(route);
    for (const method of ["POST", "PATCH", "PUT"]) {
      if (typeof mod[method] !== "function") continue;
      try {
        const response = await call(route, method, nonsense);
        if (response.status >= 500 && !excused(`${method} ${route}`, String(response.status))) {
          crashed.push(`${method} ${route} -> ${response.status}`);
        }
      } catch (error) {
        if (!excused(`${method} ${route}`, error.message)) {
          crashed.push(`${method} ${route} threw: ${error.message}`);
        }
      }
    }
  }
  assert.deepEqual(crashed, [], "these routes fell over on a body of the wrong shape");
});

test("a GET for something that does not exist answers rather than crashing", async () => {
  const crashed = [];
  for (const route of ROUTES) {
    const mod = await load(route);
    if (typeof mod.GET !== "function") continue;
    try {
      const response = await call(route, "GET", undefined);
      if (response.status >= 500 && !excused(`GET ${route}`, String(response.status))) {
        crashed.push(`GET ${route} -> ${response.status}`);
      }
    } catch (error) {
      if (!excused(`GET ${route}`, error.message)) {
        crashed.push(`GET ${route} threw: ${error.message}`);
      }
    }
  }
  assert.deepEqual(crashed, [], "these routes fell over asking for something that is not there");
});

test("a refusal says what was wrong, in words", async () => {
  // A 400 whose body is `{}` tells the screen nothing, so the screen shows
  // "That did not save" and the operator has no idea what to change. Every
  // refusal has to carry a sentence.
  const silent = [];
  for (const route of ROUTES) {
    const mod = await load(route);
    for (const method of ["POST", "PATCH", "PUT"]) {
      if (typeof mod[method] !== "function") continue;
      const response = await call(route, method, undefined).catch(() => null);
      if (!response || response.status !== 400) continue;
      const body = await response.json().catch(() => ({}));
      const message = String(body?.error ?? "");
      if (message.trim().length < 8) silent.push(`${method} ${route}: ${JSON.stringify(body)}`);
    }
  }
  assert.deepEqual(silent, [], "these routes refuse without saying why");
});
