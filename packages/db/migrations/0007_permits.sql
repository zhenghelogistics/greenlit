-- §24. Permits belong to the shipment, and containers reference them.
--
-- The file is held once at job level. Copying it against every container makes
-- several records that can disagree with each other, and the same permit
-- routinely covers several boxes.
--
-- The link table exists because the relationship is many-to-many in both
-- directions: one permit over many containers, and one container needing more
-- than one permit. A permit_number column on containers could express neither.

create table if not exists permits (
  permit_id            text primary key,
  job_id               text not null references import_jobs(job_id) on delete cascade,
  permit_number        text,
  expiry_date          date,
  -- The sailing the permit was issued against, as read or typed. Kept as
  -- written so a controller can see what the permit actually says when it
  -- disagrees with the job.
  permit_vessel_voyage text,
  file_name            text,
  created_at           timestamptz not null default now(),
  created_by           text not null
);

create index if not exists permits_job_idx on permits (job_id);

create table if not exists permit_containers (
  permit_id    text not null references permits(permit_id) on delete cascade,
  container_id text not null references containers(container_id) on delete cascade,
  primary key (permit_id, container_id)
);

create index if not exists permit_containers_container_idx
  on permit_containers (container_id);

-- No validation columns. Whether a permit matches its sailing and outlasts the
-- arrival is derived from the job every time it is asked, never stored: a
-- stored verdict stays green after the voyage it was issued against has been
-- amended, which is the precise failure the check exists to catch. §54 says
-- derived values are not writable, and this is one.
