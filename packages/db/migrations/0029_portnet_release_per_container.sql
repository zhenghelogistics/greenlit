-- 0029 — Portnet release, per container
--
-- Release has been one flag on the job since the start. The release email is
-- frequently not: it names particular containers, and the rest of the job is
-- still waiting.
--
-- Recording that as "the job is released" is wrong in the direction that
-- matters. It tells a controller a box can be collected when Portnet has not
-- released it, and the trip is refused at the terminal with the driver there.
--
-- So release moves to the container, where discharge already lives, and the
-- job-level flag becomes what it always meant in practice: every box is
-- released. Existing rows are backfilled from it, which is exactly true of
-- them — until now there was no way to say anything else.

alter table containers
  add column if not exists portnet_released_at timestamptz,
  add column if not exists portnet_released_by text;

comment on column containers.portnet_released_at is
  'When Portnet released this container. Null until it does. Per container '
  'because a release email often names some boxes and not others.';

-- Every box on an already-released job was released, because the flag could
-- not have meant anything else.
update containers c
   set portnet_released_at = j.created_at,
       portnet_released_by = 'migration:0029'
  from import_jobs j
 where j.job_id = c.job_id
   and j.portnet_released
   and c.portnet_released_at is null;

create index if not exists containers_portnet_release
  on containers (job_id, portnet_released_at);
