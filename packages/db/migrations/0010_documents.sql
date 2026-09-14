-- §10. Documents are not generic attachments.
--
-- Extraction reads an arrival notice, records which page and which line every
-- value came from, and then discards the file. So a controller holding a
-- demurrage dispute has a quote and no document to check it against, which is
-- most of the value of having read it.
--
-- The file itself lives in the `documents` storage bucket, private, because
-- these are customers' commercial papers. This table is the metadata §10 asks
-- for, and the row is what makes the file findable.

create table if not exists documents (
  document_id       text primary key,
  job_id            text not null,
  container_id      text,
  movement_id       text,
  document_type     text not null,
  filename          text not null,
  -- The path inside the bucket. Not a URL: a signed URL expires, and storing
  -- one would leave rows pointing at links that stopped working.
  storage_path      text not null,
  byte_size         integer,
  source            text not null default 'MANUAL_UPLOAD',
  received_at       timestamptz not null default now(),
  received_from     text,

  -- §10. Versioning. A corrected arrival notice does not replace the first
  -- one: the job was worked off the original, and the history has to say so.
  version            integer not null default 1,
  is_current_version boolean not null default true,

  extraction_status text not null default 'PENDING',
  uploaded_by       text not null,
  created_at        timestamptz not null default now()
);

create index if not exists documents_job_idx on documents (job_id);

-- One current version per document lineage. A second would make "the current
-- arrival notice" a question with two answers.
create unique index if not exists documents_one_current
  on documents (job_id, document_type, filename)
  where is_current_version;
