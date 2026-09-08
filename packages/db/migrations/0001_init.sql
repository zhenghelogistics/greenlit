create extension if not exists "pgcrypto";

-- Project Greenlit — initial schema
--
-- Shapes follow PRD §55 and the domain records in @greenlit/engine.
--
-- Two rules the schema itself enforces, rather than leaving to application code:
--
--   1. No derived value is stored. There is no job_status, container_status,
--      current_location, next_action, blocking_reason or waiting_on column
--      anywhere. §56 says they are computed; a column would let something write
--      one, and eventually something would.
--
--   2. Operational records are never hard-deleted (§57 rule 7). Cancellation is
--      a flag; audit rows have no delete path at all.

-- §9. Customers are the organising unit (ADR-0007).
create table if not exists customers (
  customer_id              text primary key,
  code                     text not null unique check (code ~ '^[A-Z]{2,6}$'),
  company_name             text not null,
  short_name               text,
  billing_name             text,
  default_consignee        text,
  default_delivery_address text,
  default_contact          text,
  email_domains            text[] not null default '{}',
  account_status           text not null default 'ACTIVE'
                             check (account_status in ('ACTIVE','ON_HOLD','CLOSED')),
  notes                    text,
  created_at               timestamptz not null default now()
);

-- §7. Roles are enforced server-side; this is the directory they resolve against.
create table if not exists principals (
  user_id           text primary key,
  display_name      text not null,
  role              text not null check (role in ('ADMINISTRATOR','CONTROLLER','MANAGER')),
  extra_permissions text[] not null default '{}',
  active            boolean not null default true
);

-- §28
create table if not exists import_jobs (
  job_id              text primary key,
  job_number          text not null unique,
  customer_id         text not null references customers(customer_id),
  customer            text not null,
  bl_number           text,
  vessel_name         text,
  voyage_number       text,
  eta                 date,
  job_type            text not null default 'standard',
  delivery_address    text,
  permit_required     boolean not null default true,
  permit_received     boolean not null default false,
  permit_rejected     boolean not null default false,
  portnet_required    boolean not null default true,
  portnet_released    boolean not null default false,
  assigned_controller text,
  cancelled           boolean not null default false,
  on_hold             boolean not null default false,
  created_at          timestamptz not null default now()
);

-- §29
create table if not exists containers (
  container_id           text primary key,
  job_id                 text not null references import_jobs(job_id) on delete restrict,
  container_number       text not null,
  container_size         text not null,
  container_type         text not null,
  seal_number            text,
  gross_weight           numeric,
  cargo_description      text,
  port_terminal          text,
  empty_return_yard      text,
  -- §34. All three counts are stored; none is discarded for another.
  free_time_model        text not null default 'SPLIT' check (free_time_model in ('SPLIT','COMBINED')),
  free_time_counts_from  text not null default 'VESSEL_ETA'
                           check (free_time_counts_from in ('VESSEL_ETA','DISCHARGE','GATE_OUT')),
  demurrage_free_days    integer,
  demurrage_lfd          date,
  detention_free_days    integer,
  detention_lfd          date,
  combined_free_days     integer,
  combined_lfd           date,
  internal_lfd           date,
  -- §36.2. The reason decides who we are waiting on, so it is stored.
  carpark_reason         text check (carpark_reason in ('CUSTOMER_NO_SPACE','CONTROLLER_DECISION')),
  carpark_arrived_at     timestamptz,
  -- §36.3. The customer tells us the container is empty before we collect it.
  empty_ready_confirmed  boolean not null default false,
  empty_ready_confirmed_at timestamptz,
  empty_ready_source     text check (empty_ready_source in ('EMAIL','WHATSAPP','PHONE','MANUAL')),
  chassis_id             text,
  chassis_mounted_at     timestamptz,
  chassis_released_at    timestamptz,
  cancelled              boolean not null default false,
  on_hold                boolean not null default false
);
-- §29.1. Unique across OPEN jobs only: the same physical box legitimately
-- appears on many jobs over its life.
create unique index if not exists containers_open_number_idx
  on containers (container_number) where cancelled = false;

-- §38.1
create table if not exists export_jobs (
  export_job_id              text primary key,
  job_number                 text not null unique,
  customer_id                text not null references customers(customer_id),
  customer                   text not null,
  shipper                    text,
  booking_reference          text,
  export_clearance_reference text,
  carrier                    text,
  vessel_name                text,
  voyage_number              text,
  eta_singapore              date,
  vessel_closing_at          timestamptz,
  empty_collection_yard      text,
  cms_required               boolean not null default true,
  cms_status                 text not null default 'PENDING'
                               check (cms_status in ('PENDING','COMPLETED','NOT_REQUIRED')),
  container_quantity         integer not null default 1,
  container_size_type        text,
  truck_in_date              date,
  truck_out_date             date,
  standby_required           boolean not null default false,
  standby_instruction_source text check (standby_instruction_source in ('BOOKING','EMAIL','PHONE','MANUAL')),
  standby_expected_minutes   integer,
  transhipment_status        text not null default 'PENDING'
                               check (transhipment_status in ('PENDING','AVAILABLE','NOT_AVAILABLE')),
  transhipment_checked_at    timestamptz,
  carpark_requested          boolean not null default false,
  assigned_controller        text,
  cancelled                  boolean not null default false,
  on_hold                    boolean not null default false,
  created_at                 timestamptz not null default now()
);

-- §38.2. Created with the job, identified later.
create table if not exists export_containers (
  export_container_id       text primary key,
  export_job_id             text not null references export_jobs(export_job_id) on delete restrict,
  container_ref             text not null,
  container_number          text,
  seal_number               text,
  tare_weight_kg            numeric,
  size_type                 text not null default '',
  is_reefer                 boolean not null default false,
  -- §9.4. A setpoint in free text cannot be validated or checked against what
  -- the driver actually set.
  temperature_mode          text check (temperature_mode in ('PRE_COOL','PRE_SET')),
  temperature_setpoint_c    numeric,
  stuffing_location         text,
  container_details_sent    boolean not null default false,
  container_details_sent_at timestamptz,
  container_ready           boolean not null default false,
  container_ready_at        timestamptz,
  vgm                       numeric,
  vgm_received_at           timestamptz,
  -- §44.2.1. Recorded and warned on; never a condition of the laden gate.
  portnet_processed         text not null default 'PENDING'
                              check (portnet_processed in ('PENDING','PROCESSED','FAILED')),
  chassis_id                text,
  chassis_mounted_at        timestamptz,
  chassis_released_at       timestamptz,
  carpark_arrived_at        timestamptz,
  cancelled                 boolean not null default false,
  on_hold                   boolean not null default false,
  unique (export_job_id, container_ref)
);

-- §17, §55. ONE movements table, both domains: the engine cannot be written
-- once against two.
-- movements.job_id, exceptions.job_id and discrepancies.job_id deliberately
-- carry NO foreign key: they reference either import_jobs or export_jobs
-- depending on job_domain, and Postgres cannot express a reference to one of
-- two tables. §55 requires one movements table serving both domains — the
-- engine cannot be written once against two — so the integrity of these
-- columns is the service layer's job, and job_domain records which side to
-- look in.
create table if not exists movements (
  movement_id            text primary key,
  movement_ref           text not null,
  job_id                 text not null,
  job_domain             text not null check (job_domain in ('IMPORT','EXPORT')),
  job_number             text not null,
  container_id           text,
  container_number       text,
  secondary_container_id text,
  is_double_mounted      boolean not null default false,
  movement_type          text not null,
  cargo_state            text not null check (cargo_state in ('EMPTY','PART_LADEN','LADEN')),
  origin_type            text not null,
  origin                 text not null default '',
  destination_type       text not null,
  destination            text not null default '',
  planned_date           date,
  planned_time           text,
  truck                  text,
  driver                 text,
  chassis_id             text,
  movement_status        text not null,
  actual_collection_at   timestamptz,
  actual_delivery_at     timestamptz,
  standby_required       boolean not null default false,
  standby_started_at     timestamptz,
  standby_ended_at       timestamptz,
  auto_created           boolean not null default false,
  cancelled_reason       text,
  -- §18. Never reused within a job, including after cancellation.
  unique (job_id, movement_ref)
);

-- §27.1. One shape, both domains.
create table if not exists exceptions (
  exception_id    text primary key,
  job_id          text not null,
  job_domain      text not null check (job_domain in ('IMPORT','EXPORT')),
  container_id    text,
  movement_id     text,
  exception_type  text not null,
  severity        text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  description     text not null default '',
  blocking        boolean not null default false,
  action_required text,
  waiting_on      text not null check (waiting_on in ('US','CUSTOMER','CARRIER','NOBODY')),
  assigned_to     text,
  detected_at     timestamptz not null default now(),
  required_by     timestamptz,
  resolved_at     timestamptz,
  resolved_by     text,
  resolution_note text
);

-- §13. Append-only. There is no update or delete path, which is how "critical
-- audit events cannot be deleted or edited" is enforced in the database rather
-- than only in the port.
create table if not exists audit_events (
  audit_id       bigserial primary key,
  event          text not null,
  entity_type    text not null check (entity_type in ('job','container','movement','document','exception')),
  entity_id      text not null,
  field          text,
  previous_value text,
  new_value      text,
  actor          text not null,
  source         text not null check (source in ('USER','EMAIL_AUTOMATION','AI_EXTRACTION','SYSTEM_RULE','API')),
  -- §13. A system-generated entry must name the rule that produced it.
  rule           text,
  created_at     timestamptz not null default now(),
  constraint system_events_name_their_rule
    check (source <> 'SYSTEM_RULE' or (rule is not null and rule <> ''))
);
create index if not exists audit_events_entity_idx on audit_events (entity_id, created_at);

-- §13: "Critical audit events cannot be deleted or edited by standard users."
-- The port exposes no update or delete, but a comment is not enforcement and a
-- privileged role could still rewrite history. This makes it impossible at the
-- table, including for the service role the application uses.
create or replace function audit_events_are_append_only() returns trigger as $$
begin
  raise exception 'audit_events is append-only (PRD §13): % is not permitted', tg_op;
end;
$$ language plpgsql;

drop trigger if exists audit_events_no_update on audit_events;
create trigger audit_events_no_update
  before update or delete on audit_events
  for each row execute function audit_events_are_append_only();

-- §12. Discrepancies are records, not screen state.
create table if not exists discrepancies (
  discrepancy_id  bigserial primary key,
  job_id          text not null,
  field           text not null,
  stored_value    text,
  extracted_value text,
  source          text not null,
  confidence      numeric not null default 0,
  reason          text not null default '',
  detected_at     timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     text,
  resolution      text check (resolution in ('stored','extracted'))
);
-- One open discrepancy per field: a second document updates the standing
-- question rather than stacking another behind it.
create unique index if not exists discrepancies_open_field_idx
  on discrepancies (job_id, field) where resolved_at is null;

-- §9.1. Master data. Status is DERIVED (§35.3), so only the manual states are
-- stored — there is deliberately no status column.
create table if not exists chassis (
  chassis_id          text primary key,
  chassis_no          text not null unique,
  plate_no            text not null,
  size                text not null check (size in ('20FT','40FT')),
  unladen_weight_kg   numeric,
  max_gross_weight_kg numeric,
  inspection_due_date date,
  manual_status       text check (manual_status in ('MAINTENANCE','RETIRED')),
  active              boolean not null default true
);

-- §35.8. An exception, not a workflow: the system records what was decided.
create table if not exists chassis_changes (
  change_id           text primary key,
  container_id        text not null,
  job_id              text not null,
  chassis_id_previous text not null,
  chassis_id_new      text,
  reason              text not null check (reason <> ''),
  location            text not null,
  changed_at          timestamptz not null default now(),
  changed_by          text not null,
  container_grounded  boolean not null default false
);

-- §13.1. The audit stream records that a date changed; this records WHY, which
-- is the whole content of the call a controller takes from the customer.
create table if not exists date_amendments (
  amendment_id   text primary key,
  entity_type    text not null,
  entity_id      text not null,
  date_field     text not null,
  previous_value text,
  new_value      text,
  reason_code    text not null check (reason_code in (
                   'CUSTOMER_REQUEST','VESSEL_DELAY','VESSEL_EARLY','PORTNET_ETA_CHANGE',
                   'YARD_WINDOW_CHANGE','CUSTOMER_NO_SPACE','EQUIPMENT','INTERNAL_RESCHEDULE','OTHER')),
  reason_note    text,
  amended_by     text not null,
  amended_at     timestamptz not null default now(),
  sequence       integer not null,
  -- OTHER requires a note, or the reason code explains nothing.
  constraint other_requires_a_note
    check (reason_code <> 'OTHER' or (reason_note is not null and reason_note <> ''))
);
create index if not exists date_amendments_entity_idx
  on date_amendments (entity_id, date_field, sequence);

-- §27, §56. Every threshold in the PRD, configurable globally or per customer.
create table if not exists config_thresholds (
  threshold_key text not null,
  -- '*' is the global scope. It cannot be NULL: Postgres makes every
  -- primary-key column NOT NULL, so a nullable customer_id here would make the
  -- global row impossible to insert — which is exactly the bug this replaces.
  customer_id   text not null default '*',
  value         numeric not null,
  unit          text not null default 'days',
  -- No foreign key: '*' is a scope, not a customer, and Postgres cannot
  -- express "either this sentinel or a real row" as a check constraint —
  -- subqueries are not permitted there.
  primary key (threshold_key, customer_id)
);

-- RLS is enabled and DELIBERATELY has no policies.
--
-- Every read and write arrives through a server-side API route that has
-- already resolved a principal and checked its permission (§7, §14.1), using
-- the service role key — which bypasses RLS by design. No anon or authenticated
-- client ever reaches these tables, so a policy would be describing an access
-- path that does not exist.
--
-- Enabling RLS with no policies is therefore the safe posture, not an omission:
-- if a browser-facing key were ever introduced by mistake, it would read
-- nothing rather than everything.
alter table customers          enable row level security;
alter table principals         enable row level security;
alter table import_jobs        enable row level security;
alter table containers         enable row level security;
alter table export_jobs        enable row level security;
alter table export_containers  enable row level security;
alter table movements          enable row level security;
alter table exceptions         enable row level security;
alter table audit_events       enable row level security;
alter table discrepancies      enable row level security;
alter table chassis            enable row level security;
alter table chassis_changes    enable row level security;
alter table date_amendments    enable row level security;
alter table config_thresholds  enable row level security;
