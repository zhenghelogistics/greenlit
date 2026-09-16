import { authorize, badRequest, readJson, runCommand } from "../../../../../../../lib/command";

/**
 * §42. Record that the customer has been told the container's number.
 *
 * The milestone that lets stuffing start, and the one the export flow could
 * not record: the status existed, the engine raised "Send container details to
 * customer" as the next action, and nothing could write it down. A job reached
 * Awaiting Container Details Notification and stopped there permanently.
 *
 * What is stored is §42's list — flag, timestamp, sender, recipient and a
 * message reference. The sender is the signed-in principal rather than
 * anything the caller sends, for the same reason no route takes an actor.
 *
 * Whether the container *can* be notified is the engine's answer, applied in
 * the adapter against the stored row: a notification is generated from stored
 * data, so it cannot be checked against what the caller happens to have typed.
 */
export async function POST(request: Request, ctx: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<{ sentTo?: string; reference?: string }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("readiness.record");
  if (!auth.ok) return auth.response;

  if (!body.sentTo?.trim()) {
    return badRequest("sentTo is required: §42 records who the details were sent to.");
  }

  return runCommand(id, (repo) => repo.recordContainerDetailsSent(
    containerId,
    { sentTo: body.sentTo!, reference: body.reference ?? null },
    auth.displayName,
  ));
}
