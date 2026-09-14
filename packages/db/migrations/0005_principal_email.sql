-- §7. An auth account is matched to a principal by email.
--
-- The directory already says who may do what. Authentication adds the part it
-- never had: proof that the person at the keyboard is the person named. Until
-- now the actor arrived in the request body, so any caller could claim to be
-- an administrator — the roles were enforced, but against a claim rather than
-- an identity.
--
-- Email is the join because it is what a person signs in with and what the
-- business already holds for staff. Indexed lower-cased: a controller typing
-- Winnie@ is the same person as winnie@.

alter table principals
  add column if not exists email text;

create unique index if not exists principals_email_idx
  on principals (lower(email)) where email is not null;
