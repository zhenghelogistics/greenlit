/**
 * What somebody tells us is wrong, and whether it can be acted on.
 *
 * ## The rule this encodes
 *
 * A report is fixable when it says where it happened, not when it is well
 * written. September's review produced most of that month's fixes because it
 * named job numbers and exact steps; almost nobody writes like that, and
 * asking them to is how a fault goes unreported instead.
 *
 * So the words are never required to be anything. What is required is the
 * context, and the application captures that itself — the person only has to
 * say what went wrong in whatever words they have.
 *
 * ## Why the captured state matters more than the error
 *
 * Almost nothing found in September was a crash. The controller board showed
 * containers it should not have, one gate contradicted another, a ticked box
 * was discarded on save. Nothing threw, so no error tracker would have seen
 * any of it.
 *
 * What identifies those is the derived state at the time — what the engine
 * said the job was waiting on, next to what the screen showed. That is the
 * comparison nobody else can make for us, and it is why this exists rather
 * than an off-the-shelf tool.
 */

/** How urgent, as the person describing it would judge it. */
export type ReportPriority =
  /** Work has stopped. Somebody cannot do their job. */
  | 'BLOCKER'
  /** Wrong or confusing, and there is a way around it. */
  | 'PROBLEM'
  /** Would be better, nothing is broken. */
  | 'NICE_TO_HAVE';

export const REPORT_PRIORITIES: readonly ReportPriority[] = ['BLOCKER', 'PROBLEM', 'NICE_TO_HAVE'];

export const PRIORITY_WORDS: Record<ReportPriority, string> = {
  BLOCKER: 'Stopping work',
  PROBLEM: 'Wrong, but there is a way round it',
  NICE_TO_HAVE: 'Would be better',
};

/** A report written up as something a developer can act on. */
export interface StructuredReport {
  /** One sentence. What is being asked for. */
  summary: string;
  /** What happens now that causes a problem. */
  painPoint: string;
  /** What good would look like. */
  goal: string;
  /** What they were doing, in order, as far as it can be told. */
  steps: string[];
  priority: ReportPriority;
  /**
   * What the write-up could not work out from what was said.
   *
   * Kept rather than guessed. A report that quietly invents the missing half
   * reads as complete and sends somebody to fix the wrong thing.
   */
  openQuestions: string[];
}

/** What the application knew when the report was made. */
export interface ReportContext {
  /** Which screen they were on. */
  screen?: string;
  /** The job and container being looked at, so it can be reproduced. */
  jobNumber?: string | null;
  jobId?: string | null;
  containerNumber?: string | null;
  /** Their role, because a good many faults are somebody seeing the wrong thing. */
  role?: string | null;
  /** The commit deployed, so a fault already fixed is recognised as such. */
  release?: string | null;
  /**
   * What the engine had derived for that job.
   *
   * The most useful field here by a distance. A screen disagreeing with the
   * engine is the shape of nearly every fault found so far, and it can only be
   * seen by putting the two side by side.
   */
  derived?: Record<string, unknown>;
  /** A request that failed, if one did. */
  failedRequest?: { method: string; path: string; status: number; body?: string } | null;
  /** Anything the browser logged. */
  consoleErrors?: string[];
}

export interface ReportReadiness {
  /** Whether somebody could start on this without going back to ask. */
  actionable: boolean;
  /** What is missing, in the words the person triaging would use. */
  missing: string[];
}

/**
 * Whether a report can be acted on, and what it is short of.
 *
 * Judged on the context and never on the writing. A report saying only "this
 * is broken" from a named screen, on a named job, with the engine's state
 * attached, is worth more than a paragraph with none of that.
 *
 * Deliberately does not require a screenshot. It helps and it is not always
 * possible — a browser may refuse, and somebody reporting on a phone may have
 * moved on by the time they open the form.
 */
export function reportReadiness(
  brainDump: string, context: ReportContext,
): ReportReadiness {
  const missing: string[] = [];

  if (!brainDump.trim()) missing.push('what went wrong, in their own words');
  if (!context.screen) missing.push('which screen it happened on');
  if (!context.release) missing.push('which version was deployed');

  // Only for reports about a job. Plenty are about a list or a screen, and
  // demanding a job number would make those unreportable.
  if (context.jobId && !context.derived) {
    missing.push("what the engine had derived for that job");
  }

  return { actionable: missing.length === 0, missing };
}

/**
 * The instruction the write-up is produced under.
 *
 * Kept here, next to the shape it has to produce, because the two are one
 * decision: changing what is asked for without changing `StructuredReport`
 * gives a write-up nothing reads.
 *
 * Two things it is told not to do. It must not invent the parts that were not
 * said — a report that reads as complete sends somebody to fix the wrong
 * thing — and it must not tidy the words into somebody else's. The original is
 * kept beside it either way.
 */
export const WRITE_UP_INSTRUCTION = `You are a technical business analyst.

Below is an unstructured account from someone using a container haulage
operations system, together with what the application itself recorded at that
moment. They may be describing a fault, a confusion, or something they want.
They are operations staff, not technical, and were told to write in whatever
words they had.

Write it up so a developer can act on it:

- summary: one sentence saying what is being asked for.
- painPoint: what happens now that causes the problem. Use the recorded
  context where it says more than the words do.
- goal: what good would look like for them.
- steps: what they were doing, in order, as far as it can be told. An empty
  list is correct when they did not say.
- priority: BLOCKER if work has stopped, PROBLEM if it is wrong but there is a
  way round it, NICE_TO_HAVE if nothing is broken.
- openQuestions: what you could not work out and would have to ask. Be honest
  here; this is the most useful field when the account is short.

Do not invent what was not said. Do not soften or reword what they reported as
their experience. If the account and the recorded context disagree, say so in
openQuestions rather than choosing between them.

Return only JSON matching the shape you were given.`;
