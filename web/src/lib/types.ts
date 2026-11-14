export type Status = "green" | "amber" | "red";

export type Run = {
  id: string;
  created_at: string;
  mode: string;
  as_of: string;
  cutoff: string | null;
  llm: string | null;
  score: Score | null;
};

export type Covenants = {
  icr_min?: number;
  icr_cash_trap?: number;
  ltv_max?: number;
  ltv_cash_trap?: number;
  occupancy_min?: number;
  occupancy_cash_trap?: number;
  test?: string;
};

export type Loan = {
  id: string;
  name: string;
  borrower: string;
  sector: string;
  owner: string;
  amount_gbp: number;
  rate_pct: number;
  value_gbp: number;
  covenants: Covenants;
  development_ids: string[];
  building_ids: string[];
  contract_file: string | null;
  synthetic_note: string | null;
};

export type Source = Record<string, unknown>;

export type Signal = {
  id: number;
  run_id: string;
  loan_id: string;
  building_id: string | null;
  month: string;
  kind: string;
  value: number;
  unit: string;
  detail: string;
  source: Source;
};

export type Band = { lo: number; mid: number; hi: number };
export type Metric = {
  now: number;
  m3: Band;
  m6: Band;
  limit?: number | null;
  cash_trap?: number | null;
  series?: { month: string; value: number }[];
};
export type MetricKey = "icr" | "ltv" | "occupancy";

export type Driver = {
  kind: string;
  label: string;
  effect_text: string;
  delta: { metric: string; amount: number };
  signal_ids: number[];
  evidence_ids: number[];
};

export type Forecast = {
  run_id: string;
  loan_id: string;
  status: Status;
  breach_metric: string | null;
  breach_month: string | null;
  metrics: Partial<Record<MetricKey, Metric>>;
  drivers: Driver[];
};

export type Evidence = {
  id: number;
  run_id: string;
  loan_id: string;
  kind: string;
  title: string;
  value: number | null;
  unit: string | null;
  effect: { metric?: string; amount?: number } | null;
  label: string;
  source: Source;
};

export type Step = {
  id: number;
  run_id: string;
  seq: number;
  step: string;
  owner: string;
  status: "done" | "fallback" | "failed" | "waiting" | string;
  detail: string;
  started_at: string | null;
  finished_at: string | null;
};

export type Draft = {
  id: number;
  run_id: string;
  loan_id: string | null;
  kind: "memo" | "chase" | string;
  title: string;
  body_md: string;
  model: string;
  status: "draft" | "approved" | "dismissed" | string;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
};

export type Score = {
  caught?: number;
  missed?: number;
  false_alarms?: number;
  note?: string;
  per_loan?: unknown;
  [k: string]: unknown;
};

export type Bundle = {
  source: "supabase" | "files" | "fixture" | "demo";
  run: Run;
  loans: Loan[];
  signals: Signal[];
  forecasts: Forecast[];
  evidence: Evidence[];
  steps: Step[];
  drafts: Draft[];
  scoreRun: Run | null;
};
