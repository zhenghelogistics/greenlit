import { authorize, badRequest, readJson } from "../../../lib/command";
import { currentPrincipal } from "../../../lib/auth";
import { getRepository, jsonError } from "../../../lib/greenlit";
import { ROLE, roleChangeProblem } from "@greenlit/engine";

/**
 * §7.1. The directory: who exists, and what each of them may do.
 *
 * Reading it needs a session — it names your colleagues and their roles, which
 * is not something to hand to anyone who finds the URL. Changing it needs
 * user.manage, which only an administrator holds.
 *
 * There is deliberately no way for a person to set their own role. Signing in
 * proves who you are; what that means is written by somebody else. A person
 * who can choose their own role has no role.
 */
export async function GET() {
  try {
    // Any signed-in member of staff may see the directory; only an
    // administrator may change it.
    const viewer = await currentPrincipal();
    if (!viewer) return Response.json({ error: "Sign in to continue" }, { status: 401 });

    const users = await getRepository().listPrincipals();
    return Response.json({
      users: users.map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        role: u.role,
        // Only an administrator sees addresses and who is switched off.
        ...(viewer.role === "ADMINISTRATOR" ? { email: u.email, active: u.active } : {}),
      })),
      canManage: viewer.role === "ADMINISTRATOR",
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Add someone, or change their name, role or address. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      userId?: string; displayName?: string; role?: string; email?: string;
    }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("user.manage");
    if (!auth.ok) return auth.response;

    const userId = body.userId?.trim().toLowerCase();
    if (!userId) return badRequest("A short username is required, e.g. winnie");
    if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(userId)) {
      return badRequest("A username is lower-case letters, digits, dot, dash or underscore");
    }
    if (!body.displayName?.trim()) {
      return badRequest("A display name is required — §13 puts it on every change they make");
    }
    if (!body.role || !ROLE.includes(body.role as (typeof ROLE)[number])) {
      return badRequest(`Role must be one of ${ROLE.join(", ")}`);
    }
    // An address that is not an address cannot be signed in with, and the
    // failure would show up as "this person cannot log in" days later.
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return badRequest("That does not look like an email address");
    }

    // §7.1. Two ways to lock the operation out of its own directory, both of
    // which look like ordinary edits at the moment they are made: stepping
    // down from administrator yourself, and standing down the last one. The
    // person genuinely holds user.manage, so neither is caught by `can`.
    const directory = await getRepository().listPrincipals();
    const administrators = directory.filter(
      (p) => p.role === "ADMINISTRATOR" && p.active).length;
    const problem = roleChangeProblem(
      auth.principal, userId, body.role as (typeof ROLE)[number], administrators);
    if (problem) return badRequest(problem);

    const principal = await getRepository().upsertPrincipal({
      userId,
      displayName: body.displayName.trim(),
      role: body.role,
      email: body.email?.trim() || null,
    }, auth.displayName);

    return Response.json({ principal }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/duplicate|already/i.test(message)) {
      return Response.json({ error: "That username or email is already in use" }, { status: 409 });
    }
    return jsonError(error);
  }
}

/** Switch someone off, or back on. */
export async function PATCH(request: Request) {
  try {
    const body = await readJson<{ userId?: string; active?: boolean }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("user.manage");
    if (!auth.ok) return auth.response;

    if (!body.userId) return badRequest("userId is required");
    if (typeof body.active !== "boolean") return badRequest("active must be true or false");

    // Switching yourself off locks you out of the screen that could switch you
    // back on, and if you are the only administrator it locks everyone out.
    const me = await currentPrincipal();
    if (me?.userId === body.userId && body.active === false) {
      return badRequest("You cannot deactivate your own account");
    }

    await getRepository().changePrincipalAccess(body.userId, body.active, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}

/**
 * Remove someone from the directory.
 *
 * §13 is unaffected: the audit trail stores the actor as text, so every past
 * change still names the person after their row is gone. Switching off is for
 * someone who has left; removal is for a row that should not exist.
 */
export async function DELETE(request: Request) {
  try {
    const body = await readJson<{ userId?: string }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("user.manage");
    if (!auth.ok) return auth.response;
    if (!body.userId) return badRequest("userId is required");

    // Removing yourself locks you out of the screen that could undo it.
    const me = await currentPrincipal();
    if (me?.userId === body.userId) {
      return badRequest("You cannot remove your own account");
    }

    await getRepository().removePrincipal(body.userId, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    // The last-administrator guard is the caller asking for something the
    // directory cannot survive, not a server fault.
    if (/last administrator/.test(message)) {
      return Response.json({
        error: "That is the only administrator left. Make someone else an "
          + "administrator first, or there would be nobody who could.",
      }, { status: 409 });
    }
    return jsonError(error);
  }
}
