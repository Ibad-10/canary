# Canary - spec and build plan (12 Nov 2026, freeze 22:10)

Approved design: Python engine computes everything and writes to Supabase; Next.js reads Supabase; FastAPI only for live re-run and the stress slider. Real partner data everywhere; **only loan terms are synthetic**. See DATA.md for every source, LOAN_RULES.md for covenant levels, mockup/index.html (v2) for the UI.

## 1. Data contract (Supabase project `canary`, eu-west-2)

The engine writes, the web reads. These tables are the only interface between them.

```
runs(id text pk, created_at timestamptz, mode text  -- 'live' | 'backtest'
     as_of date, cutoff date null, llm text, score jsonb null)

loans(id text pk, name text, borrower text, sector text  -- 'BTR' | 'PBSA' | 'BTL' | 'Office' | 'Retail' | 'Logistics'
      owner text, amount_gbp numeric, rate_pct numeric, value_gbp numeric,
      covenants jsonb,      -- {icr_min, icr_cash_trap, ltv_max, ltv_cash_trap, occupancy_min?, test: 'ICR'|'DSCR'}
      development_ids text[], building_ids text[], contract_file text, synthetic_note text)

signals(id bigserial pk, run_id text, loan_id text, building_id text null, month date,
        kind text,          -- 'arrears' | 'sc_overspend' | 'compliance_overdue' | 'compliance_missing'
                            -- | 'ews_remediation' | 'higher_risk' | 'emergency_tickets' | 'reopened_tickets' | 'vacancy'
        value numeric, unit text, detail text,
        source jsonb)       -- {dataset:'cortile', table, row_ids:[...]} | {dataset:'listings', listing_ids:[...]} | {url}

forecasts(run_id text, loan_id text, status text,  -- 'green' | 'amber' (cash trap) | 'red' (breach)
          breach_metric text null, breach_month date null,
          metrics jsonb,    -- {icr:{now, m3:{lo,mid,hi}, m6:{lo,mid,hi}, limit, cash_trap, series:[{month,value}]},
                            --  ltv:{...same...}, occupancy:{...}}
          drivers jsonb,    -- [{kind, label, effect_text, delta:{metric, amount}, signal_ids:[...], evidence_ids:[...]}]
          primary key (run_id, loan_id))
      -- metric units in JSON: LTV and occupancy as percent (e.g. 65.0); ICR as multiple (e.g. 1.25)

evidence(id bigserial pk, run_id text, loan_id text,
         kind text,         -- 'rent_comp' | 'value_comp' | 'auction' | 'msci' | 'hpi' | 'news' | 'lease' | 'dwelly'
         title text, value numeric null, unit text null, effect jsonb null,
         label text,        -- display label, e.g. 'MSCI RCA' (derived figures only, never raw MSCI rows)
         source jsonb)

steps(id bigserial pk, run_id text, seq int, step text, owner text,  -- 'Canary engine' | 'Grok' | analyst name
      status text,          -- 'done' | 'fallback' | 'failed' | 'waiting'
      detail text, started_at timestamptz, finished_at timestamptz)

drafts(id bigserial pk, run_id text, loan_id text null,  -- null = portfolio memo
       kind text,           -- 'memo' | 'chase'
       title text, body_md text, model text,
       status text default 'draft',  -- 'draft' | 'approved' | 'dismissed'  (never 'sent')
       decided_by text null, decided_at timestamptz null, note text null)

corrections(id bigserial pk, loan_id text, signal_kind text, note text, author text, created_at timestamptz default now())
```

RLS: on for all tables. `anon` may `select` everything; `anon` may `update drafts(status, decided_by, decided_at, note)` and `insert` into `corrections` and `steps` (sign-off from the UI). Engine writes with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`, server side only). The engine also writes the same rows to `engine/out/<run_id>/*.json` so the web can be built and tested before Supabase sync works.

## 2. Engine (`engine/`, Python 3, pandas, no ORM)

| File | Does |
| --- | --- |
| `loans.py` | Builds 12 synthetic loans on real Cortile developments: 5 BTR (tenure_model build_to_rent), 2 PBSA (studio-heavy developments in university cities), 2 BTL portfolios (rented units inside leasehold/mixed developments), 3 commercial (developments with commercial_lease units; Office/Retail/Logistics, each linked to an MCL lease template in data/legal). Covenant levels from LOAN_RULES.md (BTL ICR 1.25x at stressed 5.5%, LTV 75%; block/CRE ICR 1.20-1.40x, LTV 60-65%; cash trap tighter than default). Amount sized so starting LTV is 55-65% and ICR has headroom at origination. Deterministic (fixed seed). |
| `values.py` | Rent per unit and value per unit from listings v2 (let and sale rows, same postcode district, else same city, by type) and achieved auction prices; median with IQR; cites listing_id / result_id. |
| `signals.py` | Monthly signals per loan from the Cortile SQLite (Jan 2025 - Nov 2026), each with `source.row_ids`. |
| `forecast.py` | Pure functions. NOI = gross rent x occupancy - opex - unrecovered service-charge overspend - emergency repair cost - leaseholder arrears drag. ICR = NOI / interest. Value = comps value x market trend (MSCI CPPI or UK HPI, else flat) x compliance haircut (EWS remediation / overdue FRA). LTV = loan / value. Trend: linear fit on last 6 months of each signal, projected 3 and 6 months; lo/hi from residual std. Status: red if mid breaches default limit within 6 months, amber if mid hits cash trap. `stress(rate_bps, value_pct)` re-runs from cached inputs. |
| `backtest.py` | Run forecast with data cut at 2026-05-31, compare predicted red/amber against status computed on actual data at 2026-11-12. Score = caught / missed / false alarms per loan. Writes `runs.score`. |
| `news.py` | Parallel search per borrower/operator/major tenant; Grok classifies each hit into a fixed label set {operator_distress, tenant_loss, refinancing_risk, regulatory_action, irrelevant} with severity; a fixed table maps label to forecast delta (e.g. operator_distress severe = occupancy -10pp). Cache results in `engine/cache/news.json`. |
| `market.py` | MSCI RCA trendtracker (UK sector CPPI) via cached derived figures in `msci_private/` (never committed); fallback UK HPI; fallback flat. |
| `llm.py` | OpenAI-compatible client. `LLM_PROVIDER=groq` (testing) or `xai` (demo, default). |
| `memo.py` | Grok drafts portfolio memo + one chase per red loan, from forecast JSON only; must quote the citations it is given; never invents numbers. |
| `memory.py` | cognee cloud: store corrections, recall them at run start; a correction can suppress or down-weight a signal for a loan. Fallback: read `corrections` table directly. |
| `extract.py` | V7 Go extracts covenant terms from the 3 synthetic contract PDFs (`engine/contracts/*.pdf`, made by `make_contracts.py` with reportlab using MCL clause wording); fallback hand-typed terms. |
| `pipeline.py` | `python -m engine.pipeline [--backtest]`: runs every step, logs each to `steps` with owner and status ('fallback' when a service fails - the run never crashes). |
| `sync.py` | Upsert `engine/out/<run_id>/*.json` into Supabase. |
| `api.py` | FastAPI: `POST /run`, `GET /stress?rate_bps=&value_pct=`. |
| `test_forecast.py` | Asserts LOAN_RULES.md worked example: GBP 12m loan at 6%, NOI 1.12m gives ICR 1.56x; NOI 900k gives 1.25x, breach vs 1.30x; value 17m gives LTV 70.6%. |

## 3. Web (`web/`, Next.js App Router, TypeScript, Tailwind, mockup v2 look)

Screens follow mockup/index.html: greeting + "What if...?" stress slider; loan book / watchlist table (status, ICR and LTV now and 6-month, owner, filters); loan detail ("Rent may stop covering interest by March": covenant chart with lo/mid/hi band and limit lines, "How we got here" knowledge graph with `react-force-graph-2d` lighting the red path loan to building to signal to covenant, "Every number, with its source" table with Open source / Flag as wrong which writes `corrections`); watchlist memo with "Your decision" approve / dismiss (writes `drafts` + `steps`); "Who did what, and when" step log; "How accurate is Canary?" backtest score. Reads Supabase with the anon key; falls back to `engine/out/latest/*.json` copied into `web/public/data/`.

## 4. Rules

- Every number on screen has a source (table + row ids, listing id, URL, or "MSCI RCA" derived figure).
- LLM drafts text only. No numbers it was not given.
- Drafts are never sent. Human sign-off is logged.
- Never commit `.env`, `data/`, `msci_private/`, `engine/cache/`.

## 5. Build plan (parallel)

| Track | Owner | Done by |
| --- | --- | --- |
| A. Engine core: loans, values, signals, forecast, backtest, pipeline, out JSON, test | subagent (Opus, maths) | 21:30 |
| B. Integrations: llm, news, market (MSCI cache), memo, memory, extract + contract PDFs, sync, api | subagent (Sonnet) | 21:30 |
| C. Web UI from mockup against `engine/out` JSON shape | subagent (fast model) | 21:30 |
| D. Integrate, run end to end on Supabase, fix | lead | 21:55 |
| E. Final review (Fable), README, freeze | lead | 22:10 |
