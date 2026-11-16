-- Canary: row-level security as code.
-- Based on the live policies on project gkwjteifkypunbqhttzm as inspected on 14 Nov 2026 (pg_policies,
-- information_schema grants). Idempotent: safe to re-run.
--
-- Read-only public key: anon may SELECT every board table and nothing else. Every write (engine sync, engine
-- /corrections, web sign-off and corrections via Next server actions in web/src/lib/actions.ts) uses the
-- service-role key, which bypasses RLS.

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

-- write: none for anon. Drop the earlier browser-write policies and the grants behind them.
drop policy if exists anon_correct on public.corrections;
drop policy if exists anon_log on public.steps;
drop policy if exists anon_decide on public.drafts;

revoke insert, update, delete, truncate on
  public.runs, public.loans, public.signals, public.forecasts,
  public.evidence, public.steps, public.drafts, public.corrections
from anon;
revoke update (status, decided_by, decided_at, note) on public.drafts from anon;
