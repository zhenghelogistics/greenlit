-- §6. Job numbers are issued by the database, not computed from a read.
--
-- nextJobReference reads every existing reference, takes the highest and adds
-- one. Two jobs created at the same moment read the same highest and ask for
-- the same number, and the unique constraint on job_number then refuses them
-- both. Submitting ten arrival notices at once fails almost entirely.
--
-- A counter per customer, incremented and returned in one statement. Postgres
-- serialises the row lock, so concurrent callers queue rather than collide.

create table if not exists job_sequences (
  customer_code text primary key,
  next_sequence integer not null default 1
);

-- Seed from what has already been issued, so existing numbers are never reused.
insert into job_sequences (customer_code, next_sequence)
select split_part(job_number, '-', 1),
       max(split_part(job_number, '-', 2)::integer) + 1
from import_jobs
where job_number ~ '^[A-Z]+-[0-9]+$'
group by 1
on conflict (customer_code) do nothing;

insert into job_sequences (customer_code, next_sequence)
select split_part(job_number, '-', 1),
       max(split_part(job_number, '-', 2)::integer) + 1
from export_jobs
where job_number ~ '^[A-Z]+-[0-9]+$'
group by 1
on conflict (customer_code) do update
  set next_sequence = greatest(job_sequences.next_sequence, excluded.next_sequence);

/**
 * The next number for a customer, atomically.
 *
 * One statement: insert the counter if this is the customer's first job,
 * otherwise increment. The row lock held by the update is what makes ten
 * concurrent callers take ten different numbers instead of one.
 */
create or replace function next_job_sequence(p_customer_code text)
returns integer
language plpgsql
as $$
declare
  v_sequence integer;
begin
  insert into job_sequences (customer_code, next_sequence)
  values (p_customer_code, 2)
  on conflict (customer_code) do update
    set next_sequence = job_sequences.next_sequence + 1
  returning next_sequence - 1 into v_sequence;

  -- On a first insert the returning clause gives 1, which is correct: the
  -- counter is left pointing at 2 for whoever comes next.
  return v_sequence;
end;
$$;
