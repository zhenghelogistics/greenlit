-- The handover from operations to the controller.
--
-- Operations gather a job; the controller plans it. Between the two there was
-- nothing. The controller's board showed every job that existed, finished or
-- not, and the only way to tell which ones could be worked was to open them
-- one at a time and read them. So the board was either full of jobs nobody
-- could act on, or it was filtered on a guess about what "ready" meant, and
-- the guess was different on every screen that made one.
--
-- The alternative to a guess is to ask. A person in operations decides a
-- container is ready and says so, and that is what puts it on the board.
-- Recorded per container rather than per job, because containers on one job
-- are chased separately and finish at different times: three boxes ready and
-- two waiting on a permit is an ordinary Tuesday, and holding all five back
-- until the fifth is ready helps nobody.
--
-- An instant and a name rather than a boolean. The question asked afterwards
-- is never "is this handed over" -- the row's presence answers that -- but
-- "when did this land on me, and who from".
--
-- Nothing withdraws it. If the requirements were re-tested continuously, a
-- container would disappear from the controller's board because somebody in
-- operations opened the delivery address to fix a typo: the controller is
-- mid-plan, the row vanishes, and nobody can explain where it went. This
-- records a decision a person made, and a person unmakes it.

alter table containers
  add column if not exists handed_over_at timestamptz,
  add column if not exists handed_over_by text;

comment on column containers.handed_over_at is
  'When operations handed this container to the controller. Null until they do. '
  'Never cleared by the system: a handover is withdrawn by a person, not by an edit.';

comment on column containers.handed_over_by is
  'Who handed it over. Kept for the question the controller actually asks, '
  'which is who to go back to.';

-- The controller's board reads exactly this: handed over, not finished.
-- Partial, because the rows that matter are a minority of the table and stay
-- a minority as history accumulates.
create index if not exists containers_handed_over_idx
  on containers (handed_over_at)
  where handed_over_at is not null;
