import { reportReadiness, type ReportContext } from "@greenlit/engine";
import { authorize, badRequest, readJson } from "../../../lib/command";
import { getRepository, jsonError } from "../../../lib/greenlit";
import { writeUpReport } from "../../../lib/write-up-report";

/** Everything reported, newest first. Triage reads this. */
export async function GET() {
  try {
    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;
    return Response.json({ reports: await getRepository().listProblemReports() });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Report something.
 *
 * Open to anyone signed in, deliberately. A fault is found by whoever is using
 * the screen, and putting a permission in front of saying so is how it goes
 * unreported.
 *
 * The write-up is attempted and not required. The words and the captured
 * context are the evidence; the structured version is a reading of them and
 * can be produced again later.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("dashboard.view");
    if (!auth.ok) return auth.response;

    const brainDump = String(body.brainDump ?? "").trim();
    if (!brainDump) return badRequest("Say what went wrong, in whatever words you have.");

    const context: ReportContext = {
      ...(body.context as ReportContext ?? {}),
      role: auth.principal?.role ?? null,
      // Stamped here rather than taken from the browser: a report naming a
      // release it was not running is worse than one naming none.
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    };

    const structured = await writeUpReport(brainDump, context);
    const report = await getRepository().recordProblemReport(
      { brainDump, context, structured, screenshotPath: null }, auth.displayName);

    // Said back, so somebody who reported from a screen we cannot reproduce
    // knows to add the missing piece rather than assuming it was received.
    const readiness = reportReadiness(brainDump, context);
    return Response.json({ report, readiness }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
