import Anthropic from "@anthropic-ai/sdk";
import { WRITE_UP_INSTRUCTION, type ReportContext, type StructuredReport }
  from "@greenlit/engine";

/**
 * Turn what somebody said into something a developer can act on.
 *
 * The account and the recorded context both go in. The context is frequently
 * the more useful of the two: somebody writes "the permit thing is wrong" and
 * the capture says which job, what the engine had derived for it, and which
 * request failed.
 *
 * Returns null rather than throwing. The report is already worth keeping
 * without a write-up — the words and the context are the evidence, and this is
 * a reading of them. Losing a report because a model call failed would be the
 * worse trade, and the write-up can be produced again later from what was kept.
 */
export async function writeUpReport(
  brainDump: string, context: ReportContext,
): Promise<StructuredReport | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const SHAPE = {
    summary: "string, one sentence",
    painPoint: "string",
    goal: "string",
    steps: ["string"],
    priority: "BLOCKER | PROBLEM | NICE_TO_HAVE",
    openQuestions: ["string"],
  };

  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      system: WRITE_UP_INSTRUCTION,
      messages: [{
        role: "user",
        content: [
          "Shape to return:",
          JSON.stringify(SHAPE, null, 2),
          "",
          "What the application recorded at that moment:",
          JSON.stringify(context, null, 2),
          "",
          "What they said:",
          brainDump,
        ].join("\n"),
      }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text).join("");

    // Fenced or bare, both happen.
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) return null;

    const parsed = JSON.parse(json[0]) as StructuredReport;
    // A priority outside the three is not a priority. Falling back to PROBLEM
    // rather than dropping the write-up: the rest of it is still worth having.
    if (!["BLOCKER", "PROBLEM", "NICE_TO_HAVE"].includes(parsed.priority)) {
      parsed.priority = "PROBLEM";
    }
    parsed.steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    parsed.openQuestions = Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [];
    return parsed;
  } catch {
    return null;
  }
}
