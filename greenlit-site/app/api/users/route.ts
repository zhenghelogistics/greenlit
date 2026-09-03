import { getRepository, jsonError } from "../../../lib/greenlit";

/**
 * §7. The user directory.
 *
 * Exposed so the interface can show who is acting until sign-in exists. It is
 * NOT authentication: choosing a user here asserts an identity rather than
 * proving one. What it does exercise is the authorisation half — the server
 * still refuses anything that user may not do.
 */
export async function GET() {
  try {
    const users = await getRepository().listPrincipals();
    return Response.json({
      users: users.filter((u) => u.active).map((u) => ({
        userId: u.userId, displayName: u.displayName, role: u.role,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
