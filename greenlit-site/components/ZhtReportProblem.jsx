"use client";

import { useEffect, useState } from "react";

/**
 * Tell us something is wrong, in whatever words you have.
 *
 * ## Why it asks for so little
 *
 * The people using this are not technical and read the screen all shift. Asked
 * for steps to reproduce, a severity and an expected result, most will close
 * the form and carry on working around the fault. So it asks one question and
 * captures the rest itself.
 *
 * What it captures is what makes a report fixable: which screen, which job,
 * what the engine had derived for it, the last request that failed, and the
 * deployed commit. Almost nothing found so far was a crash — a board showed
 * containers it should not have, one gate contradicted another — and what
 * identifies those is the derived state, not an error.
 *
 * ## The three prompts
 *
 * Not a form, and not required. They are there because "it's broken" and "I
 * clicked Save on DKSH-001 and the permit line still said missing" are the
 * same report, and the second one gets fixed. Somebody who ignores them still
 * gets a usable report, because the capture does the work.
 */
export default function ZhtReportProblem({ screen, job, container }) {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [failed, setFailed] = useState("");

  // The last request that failed, whatever it was. Collected continuously
  // rather than at report time, because by the time somebody opens this form
  // the request that went wrong is long gone.
  useEffect(() => {
    if (typeof window === "undefined" || window.__glFetchPatched) return;
    window.__glFetchPatched = true;
    window.__glFailed = null;
    window.__glErrors = [];
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (!response.ok) {
        window.__glFailed = {
          method: args[1]?.method ?? "GET",
          path: String(args[0]).split("?")[0],
          status: response.status,
        };
      }
      return response;
    };
    window.addEventListener("error", (e) => {
      window.__glErrors = [...(window.__glErrors ?? []), String(e.message)].slice(-5);
    });
  }, []);

  async function send(event) {
    event.preventDefault();
    setSending(true);
    setFailed("");

    const context = {
      screen: screen ?? "",
      jobNumber: job?.id ?? null,
      jobId: job?.apiId ?? null,
      containerNumber: container?.number ?? null,
      // What the engine said, which is the half a screenshot cannot show.
      derived: job?.derived ?? null,
      failedRequest: typeof window !== "undefined" ? window.__glFailed ?? null : null,
      consoleErrors: typeof window !== "undefined" ? window.__glErrors ?? [] : [],
      viewport: typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight}` : null,
    };

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brainDump: words, context }),
    }).catch(() => null);

    const payload = await response?.json().catch(() => ({}));
    setSending(false);
    if (!response?.ok) {
      setFailed(payload?.error ?? "That did not send. Try again in a moment.");
      return;
    }
    setSent(payload?.report?.structured ?? null);
    setWords("");
  }

  if (!open) {
    return (
      <div className="zht">
        <button className="btn ghost report-launch" type="button" onClick={() => setOpen(true)}>
          Report a problem
        </button>
      </div>
    );
  }

  return (
    <div className="zht report-sheet-wrap" role="dialog" aria-label="Report a problem">
      <form className="creation-section report-form" onSubmit={send}>
        <div className="creation-section-head">
          <div>
            <div className="section-title">Report a problem</div>
            <div className="muted">
              Write it however you like. We already know which screen you are on
              and which job you are looking at.
            </div>
          </div>
        </div>

        {sent ? (
          <>
            <div className="noa-note" role="status">
              Thank you. This is how it was written up. If it is wrong, say so below
              and send again.
            </div>
            <div className="card" style={{ marginTop: 10 }}>
              <b>{sent.summary}</b>
              <div className="muted" style={{ marginTop: 6 }}>{sent.painPoint}</div>
              {sent.openQuestions?.length ? (
                <div className="permit-alert" style={{ marginTop: 8 }}>
                  Still not clear: {sent.openQuestions.join(" · ")}
                </div>
              ) : null}
            </div>
            <div className="action-row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
              <button className="btn primary" type="button"
                onClick={() => { setSent(null); setOpen(false); }}>Done</button>
            </div>
          </>
        ) : (
          <>
            {failed ? <div className="callout" role="alert">{failed}</div> : null}
            <div className="field full">
              <label htmlFor="report-words">What happened?</label>
              <textarea id="report-words" rows={6} required value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="It did not do what I expected…" />
              <span className="field-helper">
                If you can, say these three things. Any of them helps, none of
                them is required.
              </span>
            </div>

            {/* Asked as questions rather than fields, because a field left
                blank reads as a failure and a question left unanswered does
                not. Somebody who ignores all three still gets a usable report,
                because the capture does the work. */}
            <ul className="report-prompts">
              <li>What were you trying to do?</li>
              <li>What did it do instead?</li>
              <li>Is this stopping you working, or is there a way round it?</li>
            </ul>

            <div className="action-row" style={{ marginTop: 10, gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={sending || !words.trim()}>
                {sending ? "Sending…" : "Send report"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
