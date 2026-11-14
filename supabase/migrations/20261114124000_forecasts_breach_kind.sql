-- Wave 2: covenant vs valuation_risk driver when status is not green.
alter table public.forecasts
  add column if not exists breach_kind text;

comment on column public.forecasts.breach_kind is
  'covenant | valuation_risk | null when green';