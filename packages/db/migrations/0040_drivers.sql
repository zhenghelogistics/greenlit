-- 0040 — drivers on file
--
-- The PM's demo lists every driver with the vehicle they normally drive, and
-- shows each one as planned or available. Greenlit had no driver record: a
-- driver was a name typed on a trip, so a driver with nothing planned was
-- invisible, which is exactly the one a controller is looking for.
--
-- A driver who leaves is taken out of use rather than deleted, because their
-- name is on trips that already happened.

create table if not exists drivers (
  driver_id  text primary key,
  name       text not null unique,
  vehicle    text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table drivers is 'Drivers on file, with the vehicle each normally drives.';

-- Everyone already named on a trip, so the list starts with the real drivers.
insert into drivers (driver_id, name, vehicle)
select 'drv-' || md5(upper(trim(driver))), upper(trim(driver)),
       (array_agg(upper(trim(truck)) order by planned_date desc nulls last))[1]
  from movements
 where nullif(trim(driver), '') is not null
 group by upper(trim(driver))
on conflict (name) do nothing;
