import { PRIORITY_WORDS } from "@greenlit/engine";
import { authorize } from "../../../../lib/command";
import { getRepository, jsonError } from "../../../../lib/greenlit";

/**
 * Everything open, as markdown, in the order somebody should work on it.
 *
 * For handing to whoever is doing the fixing — a person or a model. The
 * context block is the point: it carries the release, the ids to reproduce
 * with, and what the engine had derived, which is the comparison that
 * identifies nearly every fault found so far.
 *
 * Their own words are last and unedited. The write-up above them is a reading
 * of those words, and when the two disagree the words win.
 */
export async function GET(request: Request) {
  try {
    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    const open = new URL(request.url).searchParams.get("all") !== "true";
    const reports = (await getRepository().listProblemReports())
      .filter((r) => (open ? r.status === "NEW" || r.status === "TRIAGED" : true));

    const RANK = { BLOCKER: 0, PROBLEM: 1, NICE_TO_HAVE: 2 } as const;
    reports.sort((a, b) =>
      (RANK[a.structured?.priority ?? "PROBLEM"] - RANK[b.structured?.priority ?? "PROBLEM"])
      || a.reportedAt.localeCompare(b.reportedAt));

    const lines: string[] = [
      `# Reported problems (${reports.length})`,
      "",
      "Ordered by priority, then by when they were reported. Each one carries "
      + "what the application recorded at the time, which is usually more use "
      + "than the description.",
    ];

    for (const r of reports) {
      const s = r.structured;
      lines.push(
        "",
        "---",
        "",
        `## ${s?.summary ?? r.brainDump.slice(0, 80)}`,
        "",
        `**${PRIORITY_WORDS[s?.priority ?? "PROBLEM"]}** · ${r.status} · `
        + `${r.reportedBy} · ${r.reportedAt.slice(0, 16).replace("T", " ")} · \`${r.reportId}\``,
      );

      if (s) {
        lines.push("", `**What happens now.** ${s.painPoint}`, "", `**What good looks like.** ${s.goal}`);
        if (s.steps.length) {
          lines.push("", "**Steps**", ...s.steps.map((step, i) => `${i + 1}. ${step}`));
        }
        if (s.openQuestions.length) {
          lines.push("", "**Not established**", ...s.openQuestions.map((q) => `- ${q}`));
        }
      }

      const c = r.context ?? {};
      lines.push("", "**Recorded at the time**", "```json", JSON.stringify({
        release: c.release, screen: c.screen, role: c.role,
        job: c.jobNumber ?? c.jobId, container: c.containerNumber,
        derived: c.derived, failedRequest: c.failedRequest, consoleErrors: c.consoleErrors,
      }, null, 2), "```");

      lines.push("", "**In their words**", "", `> ${r.brainDump.replace(/\n/g, "\n> ")}`);
    }

    return new Response(lines.join("\n"), {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
