-- 0027 — what people tell us is wrong
--
-- Operations find things nobody anticipated, and the finding is worth more
-- than the wording. The review that produced most of September's fixes worked
-- because it named job numbers and exact steps; almost nobody writes like
-- that, and asking them to is how a fault goes unreported instead.
--
-- So a report is two things kept apart on purpose:
--
--   `brain_dump`  what the person said, unedited, in their words.
--   `context`     what the application knew at that moment, captured without
--                 being asked for: the screen, the job, what the engine had
--                 derived, the request that failed, the deployed commit.
--
-- The context is what makes a report fixable. Almost nothing found in
-- September was a crash: the board showed containers it should not have, a
-- gate contradicted another gate, a ticked box was discarded on save. Nothing
-- threw, so no error tracker would have seen any of it. What identifies those
-- is the derived state at the time, which only this application knows.
--
-- `structured` is the same report written up as a request a developer can act
-- on. It is generated and kept beside the original rather than replacing it,
-- because the summary is a reading of what somebody meant and the original is
-- what they said.

create table if not exists problem_reports (
  report_id      text primary key,
  reported_by    text not null,
  reported_at    timestamptz not null default now(),
  -- Their words. Never edited, never required to be well formed.
  brain_dump     text not null,
  -- The write-up: what, pain, goal, steps, priority.
  structured     jsonb,
  -- What the application knew: screen, ids, derived state, failed request,
  -- deployed commit, role. Shape deliberately open — the useful fields differ
  -- by screen and a column per field would be out of date within a week.
  context        jsonb not null default '{}'::jsonb,
  -- Where the screenshot went, if one was taken.
  screenshot_path text,

  status         text not null default 'NEW'
                   check (status in ('NEW','TRIAGED','FIXED','DECLINED')),
  -- Why it was closed, which is the part somebody asks about later.
  resolution     text,
  resolved_at    timestamptz,
  resolved_by    text
);

-- Every read is "what is still open, newest first".
create index if not exists problem_reports_open
  on problem_reports (status, reported_at desc);

alter table problem_reports enable row level security;
