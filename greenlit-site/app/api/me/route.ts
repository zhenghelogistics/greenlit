import { currentPrincipal } from "../../../lib/auth";

/**
 * §7. Who the server says you are.
 *
 * The screen used to name a hardcoded controller, which meant the name on
 * screen and the name on the audit trail were two independent guesses. There
 * is one answer now and this is it — asked of the server, because the browser
 * has no way to know and no business deciding.
 */
export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) return Response.json({ principal: null }, { status: 401 });

  return Response.json({
    principal: {
      userId: principal.userId,
      displayName: principal.displayName,
      role: principal.role,
    },
  });
}
