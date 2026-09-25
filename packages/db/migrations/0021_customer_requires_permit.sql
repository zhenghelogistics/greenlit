-- 0021 — whether a customer's jobs need a permit
--
-- Operations: "If I have selected a customer that does not require a permit,
-- this should not block the job from being created if I do not input a permit
-- number."
--
-- Nothing blocked it — the create path has never asked for a permit, and the
-- handover gate already returns no gap when a job says none is required. What
-- was missing is the sentence before that one: *a customer that does not
-- require a permit*. There was nowhere to record that, so every job started
-- with the flag off and somebody had to remember to turn it on for the
-- customers that do need one.
--
-- A default the job can still overrule, not a rule. A customer who never needs
-- a permit occasionally ships something that does, and the job is where that
-- is known.

alter table customers
  add column if not exists requires_permit boolean not null default false;

comment on column customers.requires_permit is
  'Whether this customer''s jobs normally need a Customs permit. A default for '
  'new jobs, which each job may still overrule.';
