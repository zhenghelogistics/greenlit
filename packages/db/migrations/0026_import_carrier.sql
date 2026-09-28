-- 0026 — the carrier on an import
--
-- Export jobs have carried one since 0001. Import jobs never have, and the
-- creation form asks for it on both: a controller picks the line from the
-- master list, saves, and on an import the answer goes nowhere.
--
-- It is the one field that decides where the rest of the job's answers come
-- from. `packages/engine/src/carriers.ts` holds, per line, where the last free
-- day is found and where the empty return yard is found — on the notice, on
-- Portnet, on the carrier's website, or by an email somebody has to send and
-- wait for. Without the carrier recorded, none of that can be shown, and the
-- knowledge goes back to being something the longest-serving person remembers.
--
-- Null on existing rows, which is honest: nobody recorded it, because nothing
-- could.

alter table import_jobs
  add column if not exists carrier text;

comment on column import_jobs.carrier is
  'The shipping line, as a code from the engine''s carrier master. Decides '
  'where the last free day and the empty return yard are looked up.';
