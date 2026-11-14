-- Canary: row-level security as code.
-- Captures the live policies on project gkwjteifkypunbqhttzm as inspected on 14 Nov 2026 (pg_policies,
-- information_schema grants). Idempotent: safe to re-run.
--
-- NOT APPLIED AUTOMATICALLY. Applying it is a manual step (Supabase SQL editor, `supabase db push`, or the MCP
-- apply_migration tool) after checking the web sign-off path, which still writes from the browser with the anon key.
--
-- The engine writes every board table with the service-role key (bypasses RLS). The browser (anon key) may:
--   * SELECT every board table
--   * INSERT corrections (analyst "this is wrong" / dismissals) and steps (sign-off log line)
--   * UPDATE drafts.status/decided_by/decided_at/note only (memo sign-off), to draft/approved/dismissed
-- Anon has no UPDATE/DELETE policy on runs, loans, signals, forecasts, evidence, steps or corrections, so those
-- table grants are inert under RLS.

alter table public.runs        enable row level security;
alter table public.loans       enable row level security;
alter table public.signals     enable row level security;
alter table public.forecasts   enable row level security;
alter table public.evidence    enable row level security;
alter table public.steps       enable row level security;
alter table public.drafts      enable row level security;
alter table public.corrections enable row level security;

-- read: anon can see the board
do $$
declare t text;
begin
  foreach t in array array['runs','loans','signals','forecasts','evidence','steps','drafts','corrections'] loop
    execute format('drop policy if exists anon_read on public.%I', t);
    execute format('create policy anon_read on public.%I for select to anon using (true)', t);
  end loop;
end $$;

-- write: analyst feedback and the sign-off log
drop policy if exists anon_correct on public.corrections;
create policy anon_correct on public.corrections for insert to anon with check (true);

drop policy if exists anon_log on public.steps;
create policy anon_log on public.steps for insert to anon with check (true);

-- memo sign-off: only the decision columns, only to known statuses
revoke update on public.drafts from anon;
grant update (status, decided_by, decided_at, note) on public.drafts to anon;
drop policy if exists anon_decide on public.drafts;
create policy anon_decide on public.drafts for update to anon
  using (true)
  with check (status = any (array['draft', 'approved', 'dismissed']));

-- Planned tightening, once sign-off moves to a server route using the service-role key
-- (web/src/components/MemoDecision.tsx currently updates drafts and inserts steps from the browser):
--
--   drop policy if exists anon_decide on public.drafts;
--   revoke update on public.drafts from anon;
--   drop policy if exists anon_log on public.steps;
--   revoke insert, update, delete, truncate on public.runs, public.loans, public.signals, public.forecasts,
--     public.evidence, public.steps, public.drafts from anon;
--   revoke update, delete, truncate on public.corrections from anon;
