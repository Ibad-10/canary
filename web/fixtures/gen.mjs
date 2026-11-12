// Generates sample fixture rows matching docs/SPEC.md section 1. Run: node fixtures/gen.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RUN = "run_2026-11-12_sample";
const BT = "bt_2026-05-31_sample";
const AS_OF = [2026, 11];

const mIdx = ([y, m]) => y * 12 + (m - 1);
const fromIdx = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
const addM = (n) => fromIdx(mIdx(AS_OF) + n);
const r = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// [name, borrower, sector, city, owner, amount, rate, value, icr[now,m3,m6], ltv[...], occ[...] , covenants, buildings]
const L = [
  ["L-014", "Riverside BTR", "Riverside Living Ltd", "BTR", "Manchester", "Priya Shah", 14.5, 6.1, 22.0, [1.62, 1.52, 1.38], [0.66, 0.68, 0.705], [0.93, 0.92, 0.91], { icr_min: 1.5, icr_cash_trap: 1.55, ltv_max: 0.7, ltv_cash_trap: 0.68, occupancy_min: 0.85, test: "ICR" }, [41, 42, 43], "FA-BTR-014.pdf"],
  ["L-031", "Quayside Offices", "Quayside Estates plc", "Office", "Leeds", "Tom Hale", 11.2, 6.4, 16.8, [1.62, 1.6, 1.58], [0.665, 0.705, 0.745], [0.78, 0.77, 0.76], { icr_min: 1.35, icr_cash_trap: 1.45, ltv_max: 0.7, ltv_cash_trap: 0.68, occupancy_min: 0.7, test: "ICR" }, [88], "FA-OFF-031.pdf"],
  ["L-022", "Canal Street Student", "Canal Street PBSA LLP", "PBSA", "Birmingham", "Priya Shah", 9.8, 6.0, 16.9, [1.71, 1.62, 1.52], [0.58, 0.59, 0.6], [0.88, 0.87, 0.86], { icr_min: 1.4, icr_cash_trap: 1.55, ltv_max: 0.65, ltv_cash_trap: 0.62, occupancy_min: 0.8, test: "ICR" }, [61, 62], null],
  ["L-007", "Hartley Court", "Hartley Block Holdings", "BTL", "Bristol", "Maya Okafor", 6.1, 5.9, 11.1, [1.74, 1.7, 1.66], [0.55, 0.62, 0.68], [0.94, 0.93, 0.93], { icr_min: 1.25, icr_cash_trap: 1.4, ltv_max: 0.75, ltv_cash_trap: 0.65, occupancy_min: 0.85, test: "ICR" }, [23], null],
  ["L-019", "Market Row", "Market Row Retail Ltd", "Retail", "Sheffield", "Tom Hale", 7.4, 6.5, 12.9, [1.78, 1.74, 1.7], [0.57, 0.58, 0.59], [0.88, 0.85, 0.82], { icr_min: 1.3, icr_cash_trap: 1.4, ltv_max: 0.65, ltv_cash_trap: 0.62, occupancy_min: 0.8, test: "ICR" }, [95], "FA-RET-019.pdf"],
  ["L-003", "Aldgate Lofts", "Aldgate Living Ltd", "BTR", "London", "Maya Okafor", 21.0, 5.8, 40.4, [1.98, 1.98, 1.97], [0.52, 0.52, 0.52], [0.97, 0.97, 0.97], { icr_min: 1.5, icr_cash_trap: 1.6, ltv_max: 0.65, ltv_cash_trap: 0.6, occupancy_min: 0.85, test: "ICR" }, [5, 6]],
  ["L-011", "Ferry Lane Student", "Ferry Lane PBSA Ltd", "PBSA", "Glasgow", "Priya Shah", 8.3, 5.9, 16.9, [2.12, 2.1, 2.1], [0.49, 0.49, 0.49], [0.99, 0.98, 0.98], { icr_min: 1.4, icr_cash_trap: 1.55, ltv_max: 0.65, ltv_cash_trap: 0.62, occupancy_min: 0.8, test: "ICR" }, [71]],
  ["L-025", "Kingsway", "Kingsway BTR Ltd", "BTR", "Liverpool", "Maya Okafor", 16.7, 6.0, 30.9, [1.89, 1.88, 1.87], [0.54, 0.54, 0.54], [0.95, 0.95, 0.95], { icr_min: 1.5, icr_cash_trap: 1.6, ltv_max: 0.65, ltv_cash_trap: 0.6, occupancy_min: 0.85, test: "ICR" }, [33, 34]],
  ["L-028", "Elm Park", "Elm Park Residential", "BTL", "Leicester", "Tom Hale", 4.9, 5.7, 10.4, [2.2, 2.2, 2.19], [0.47, 0.47, 0.47], [0.96, 0.96, 0.96], { icr_min: 1.25, icr_cash_trap: 1.4, ltv_max: 0.75, ltv_cash_trap: 0.65, occupancy_min: 0.85, test: "ICR" }, [12]],
  ["L-033", "Northgate House", "Northgate Offices Ltd", "Logistics", "Cambridge", "Priya Shah", 18.9, 6.2, 37.8, [2.05, 2.04, 2.03], [0.5, 0.5, 0.5], [0.92, 0.92, 0.91], { icr_min: 1.35, icr_cash_trap: 1.45, ltv_max: 0.65, ltv_cash_trap: 0.6, occupancy_min: 0.8, test: "ICR" }, [102], "FA-LOG-033.pdf"],
  ["L-036", "Wharf Yard", "Wharf Yard BTR LLP", "BTR", "Newcastle", "Maya Okafor", 12.6, 5.9, 24.7, [1.94, 1.93, 1.93], [0.51, 0.51, 0.51], [0.96, 0.96, 0.96], { icr_min: 1.5, icr_cash_trap: 1.6, ltv_max: 0.65, ltv_cash_trap: 0.6, occupancy_min: 0.85, test: "ICR" }, [44, 45]],
  ["L-040", "St Anne's Student", "St Anne's PBSA Ltd", "PBSA", "Nottingham", "Tom Hale", 10.2, 6.1, 19.2, [1.87, 1.86, 1.85], [0.53, 0.53, 0.54], [0.93, 0.93, 0.92], { icr_min: 1.4, icr_cash_trap: 1.55, ltv_max: 0.65, ltv_cash_trap: 0.62, occupancy_min: 0.8, test: "ICR" }, [81]],
];

const interp = (a, b, t) => a + (b - a) * t;
const pt = (v, k) => v; // placeholder
function band(now, m3, m6, spread) {
  return {
    m3: { lo: r(m3 - spread * 0.5), mid: r(m3), hi: r(m3 + spread * 0.5) },
    m6: { lo: r(m6 - spread), mid: r(m6), hi: r(m6 + spread) },
  };
}
function series(now, m6, noiseAmp, seed) {
  // history: reconstruct a gentle trend into the past
  const slope = (m6 - now) / 6;
  const out = [];
  for (let i = -11; i <= 0; i++) {
    const v = now + slope * 0.6 * i + Math.sin(i * 1.7 + seed) * noiseAmp;
    out.push({ month: addM(i), value: r(i === 0 ? now : v) });
  }
  return out;
}
// first month index (0..6, fractional) where mid crosses a limit; null if never
function crossing(vals, limit, dir) {
  const pts = [0, 3, 6];
  const bad = (v) => (dir === "below" ? v < limit : v > limit);
  if (bad(vals[0])) return 0;
  for (let k = 1; k < 3; k++) {
    if (bad(vals[k])) {
      const a = vals[k - 1], b = vals[k];
      return pts[k - 1] + ((limit - a) / (b - a)) * (pts[k] - pts[k - 1]);
    }
  }
  return null;
}
const hits = (vals, trap, dir) => vals.some((v) => (dir === "below" ? v <= trap : v >= trap));

const loans = [], forecasts = [];
L.forEach((c, idx) => {
  const [id, name, borrower, sector, city, owner, amt, rate, val, icr, ltv, occ, cov, bids, file] = c;
  loans.push({
    id, name, borrower, sector, owner,
    amount_gbp: amt * 1e6, rate_pct: rate, value_gbp: val * 1e6,
    covenants: cov, development_ids: [200 + idx], building_ids: bids,
    contract_file: file, synthetic_note: `Synthetic loan terms on a real Cortile development in ${city}.`,
  });
  const sp = { icr: 0.04 + (icr[0] - icr[2] > 0.08 ? 0.05 : 0), ltv: 0.012, occ: 0.012 };
  const metrics = {
    icr: { now: icr[0], ...band(icr[0], icr[1], icr[2], sp.icr), limit: cov.icr_min, cash_trap: cov.icr_cash_trap, series: series(icr[0], icr[2], 0.012, idx) },
    ltv: { now: ltv[0], ...band(ltv[0], ltv[1], ltv[2], sp.ltv), limit: cov.ltv_max, cash_trap: cov.ltv_cash_trap, series: series(ltv[0], ltv[2], 0.004, idx + 3) },
    occupancy: { now: occ[0], ...band(occ[0], occ[1], occ[2], sp.occ), limit: cov.occupancy_min, cash_trap: r(cov.occupancy_min + 0.05, 2), series: series(occ[0], occ[2], 0.006, idx + 7) },
  };
  const defs = [
    ["icr", icr, cov.icr_min, cov.icr_cash_trap, "below"],
    ["ltv", ltv, cov.ltv_max, cov.ltv_cash_trap, "above"],
    ["occupancy", occ, cov.occupancy_min, metrics.occupancy.cash_trap, "below"],
  ];
  let status = "green", bm = null, bmonth = null, best = 99;
  for (const [m, v, lim, trap, dir] of defs) {
    const x = crossing(v, lim, dir);
    if (x !== null && x < best) { best = x; bm = m; bmonth = addM(Math.max(1, Math.ceil(x))); status = "red"; }
  }
  if (status !== "red") for (const [, v, , trap, dir] of defs) if (hits(v, trap, dir)) status = "amber";
  forecasts.push({ run_id: RUN, loan_id: id, status, breach_metric: bm, breach_month: bmonth, metrics, drivers: [] });
});

const src = (table, ids) => ({ dataset: "cortile", table, row_ids: ids });
let sid = 0, eid = 0;
const signals = [], evidence = [];
const S = (loan_id, building_id, kind, value, unit, detail, source, month = addM(0)) => {
  const row = { id: ++sid, run_id: RUN, loan_id, building_id, month, kind, value, unit, detail, source };
  signals.push(row); return row.id;
};
const E = (loan_id, kind, title, value, unit, label, source, effect = null) => {
  const row = { id: ++eid, run_id: RUN, loan_id, kind, title, value, unit, effect, label, source };
  evidence.push(row); return row.id;
};
const F = (id) => forecasts.find((f) => f.loan_id === id);
const D = (loan_id, d) => F(loan_id).drivers.push(d);

// --- L-014 Riverside BTR
{
  const a = S("L-014", 42, "arrears", 6.8, "% of rent roll", "29 of 214 leases more than 30 days in arrears, GBP 96,400 owed. Up from 3.1% in June.", src("lease_arrears", [4211, 4212, 4219, 4230]));
  const b = S("L-014", 42, "sc_overspend", 212000, "GBP", "Service charge budget GBP 1.18m, spent GBP 1.39m year to date. Biggest lines: reactive repairs, insurance.", src("service_charge_ledger", [880, 881, 882]));
  const c = S("L-014", 43, "compliance_overdue", 47, "days", "Fire risk assessment due 26 Sep 2026, not completed.", src("compliance_items", [3301]));
  const d = S("L-014", 43, "ews_remediation", 1, "EWS1 form", "EWS1 form requested 3 Aug 2026, still pending.", src("ews_forms", [77]));
  const e = S("L-014", 42, "emergency_tickets", 14, "tickets / month", "Emergency repair tickets, up from 6 a month in spring.", src("tickets", [9101, 9102, 9103, 9110]));
  S("L-014", 41, "reopened_tickets", 3, "tickets", "Reopened tickets, within normal range.", src("tickets", [8801, 8802]));
  const e1 = E("L-014", "value_comp", "Estimated value from 6 comparable BTR sales", 20950000, "GBP", "Sample market trend (illustrative)", { label: "Sample market trend (illustrative)", note: "Derived range GBP 20.1m - 21.8m. Licensed data, raw rows not shown." }, { metric: "ltv", amount: 0.025 });
  const e2 = E("L-014", "rent_comp", "Median 2-bed rent nearby", 1450, "GBP pcm", "Listings", { dataset: "listings", listing_ids: ["lst_88123", "lst_88140", "lst_88171", "lst_88202"] });
  const e3 = E("L-014", "news", "Ground-floor gym operator announces 9 site closures", null, null, "News", { url: "https://example.com/news/gym-operator-closures", retrieved: "2026-11-08", note: "Parallel search; classified operator_distress (moderate)" }, { metric: "occupancy", amount: -0.01 });
  const e4 = E("L-014", "lease", "Interest cover covenant: not less than 150%", 1.5, "x", "Loan agreement", { dataset: "contract", file: "FA-BTR-014.pdf", page: 14, clause: "21.2", note: "Synthetic loan agreement" });
  D("L-014", { kind: "arrears", label: "Arrears climbing", effect_text: "Less rent collected each month; takes about 0.09x off interest cover.", delta: { metric: "icr", amount: -0.09 }, signal_ids: [a], evidence_ids: [e2] });
  D("L-014", { kind: "sc_overspend", label: "Service costs over budget", effect_text: "Overspend the landlord cannot recover from leaseholders; about -0.07x.", delta: { metric: "icr", amount: -0.07 }, signal_ids: [b], evidence_ids: [] });
  D("L-014", { kind: "emergency_tickets", label: "More emergency repairs", effect_text: "Repair cost is rising; about -0.03x.", delta: { metric: "icr", amount: -0.03 }, signal_ids: [e], evidence_ids: [] });
  D("L-014", { kind: "compliance_overdue", label: "Fire check overdue, EWS1 pending", effect_text: "Value haircut while remediation is open; adds about 2.5pp to loan-to-value.", delta: { metric: "ltv", amount: 0.025 }, signal_ids: [c, d], evidence_ids: [e1] });
  D("L-014", { kind: "news", label: "Gym operator in the news", effect_text: "Small tenant, about -1pp occupancy. Covenant: see clause 21.2.", delta: { metric: "occupancy", amount: -0.01 }, signal_ids: [], evidence_ids: [e3, e4] });
}
// --- L-031 Quayside Offices
{
  const a = S("L-031", 88, "vacancy", 22, "% vacant", "Two floors vacant since the anchor tenant left in September.", { dataset: "listings", listing_ids: ["lst_71001", "lst_71002"] });
  const b = S("L-031", 88, "compliance_missing", 1, "certificate", "No electrical safety report (EICR) on file for floors 4-6.", src("compliance_items", [5120]));
  const c = S("L-031", 88, "sc_overspend", 64000, "GBP", "Service charge overspend, voids not recovered.", src("service_charge_ledger", [1201, 1202]));
  const e1 = E("L-031", "msci", "Leeds office capital value index, 12 months", -4.1, "%", "Sample market trend (illustrative)", { label: "Sample market trend (illustrative)", note: "Derived figure, raw rows not shown." }, { metric: "ltv", amount: 0.04 });
  const e2 = E("L-031", "value_comp", "Comparable office sales, GBP per sq ft", 212, "GBP / sq ft", "Auction results", { dataset: "listings", result_ids: ["auc_2291", "auc_2305"] });
  D("L-031", { kind: "msci", label: "Office values drifting down", effect_text: "Leeds office values fell 4.1% in 12 months; pushes loan-to-value past its limit in about 3 months.", delta: { metric: "ltv", amount: 0.04 }, signal_ids: [], evidence_ids: [e1, e2] });
  D("L-031", { kind: "vacancy", label: "22% of space empty", effect_text: "Lower rent roll and weaker valuation; about -2pp occupancy.", delta: { metric: "occupancy", amount: -0.02 }, signal_ids: [a], evidence_ids: [] });
  D("L-031", { kind: "compliance_missing", label: "EICR missing", effect_text: "Valuers may apply a haircut until the certificate is in.", delta: { metric: "ltv", amount: 0.005 }, signal_ids: [b, c], evidence_ids: [] });
}
// --- L-022 Canal Street Student
{
  const a = S("L-022", 61, "compliance_overdue", 34, "days", "Lift inspections overdue across two blocks.", src("compliance_items", [4401, 4402]));
  const b = S("L-022", 62, "emergency_tickets", 11, "tickets / month", "Emergency tickets (heating, lifts).", src("tickets", [7701, 7702, 7703]));
  const e1 = E("L-022", "rent_comp", "Median studio rent nearby", 185, "GBP pw", "Listings", { dataset: "listings", listing_ids: ["lst_55010", "lst_55044", "lst_55090"] });
  D("L-022", { kind: "emergency_tickets", label: "Repair costs rising", effect_text: "Heading for the cash-trap level of 1.55x.", delta: { metric: "icr", amount: -0.1 }, signal_ids: [b], evidence_ids: [e1] });
  D("L-022", { kind: "compliance_overdue", label: "Lift checks overdue", effect_text: "Compliance cost and insurance risk.", delta: { metric: "icr", amount: -0.04 }, signal_ids: [a], evidence_ids: [] });
}
// --- L-007 Hartley Court
{
  const a = S("L-007", 23, "higher_risk", 1, "building", "Building classed higher-risk; remediation plan lodged.", src("buildings", [23]));
  const e1 = E("L-007", "hpi", "Bristol house price index, 6 months", -2.8, "%", "UK HPI", { url: "https://www.gov.uk/government/collections/uk-house-price-index-reports" });
  D("L-007", { kind: "hpi", label: "Local prices easing", effect_text: "Loan-to-value rises above the 65% cash-trap level in about 5 months.", delta: { metric: "ltv", amount: 0.06 }, signal_ids: [a], evidence_ids: [e1] });
}
// --- L-019 Market Row
{
  const a = S("L-019", 95, "vacancy", 15, "% vacant", "Two units vacant, one anchor lease up for break in 2027.", { dataset: "listings", listing_ids: ["lst_61120", "lst_61122"] });
  const e1 = E("L-019", "news", "Anchor tenant announces store review", null, null, "News", { url: "https://example.com/news/retail-anchor-review", retrieved: "2026-11-09" }, { metric: "occupancy", amount: -0.03 });
  D("L-019", { kind: "vacancy", label: "Occupancy sliding", effect_text: "Occupancy reaches the 85% cash-trap level next quarter.", delta: { metric: "occupancy", amount: -0.03 }, signal_ids: [a], evidence_ids: [e1] });
}
// green loans: one benign signal each
for (const l of loans) {
  if (F(l.id).drivers.length) continue;
  S(l.id, l.building_ids[0], "reopened_tickets", 2, "tickets", "Reopened tickets, within normal range.", src("tickets", [100 + sid]));
  E(l.id, "rent_comp", "Median rent nearby, stable", 1200 + sid * 10, "GBP pcm", "Listings", { dataset: "listings", listing_ids: [`lst_${40000 + sid}`] });
}

const t0 = "2026-11-12T19:04:00Z";
const T = (m, s = 0) => new Date(Date.parse(t0) + m * 60000 + s * 1000).toISOString();
const steps = [
  ["Load loan book", "Canary engine", "done", "12 synthetic loans on real Cortile developments", 0, 3],
  ["Pull building signals", "Canary engine", "done", "Cortile: arrears, service charge, compliance, tickets", 0, 9],
  ["Value comparables", "Canary engine", "done", "Listings and auction results, median with IQR", 0, 14],
  ["Market trend", "Canary engine", "fallback", "Sample market trend (illustrative) unavailable for 2 sectors; used UK HPI", 0, 20],
  ["Tenant news", "Grok", "done", "9 hits classified, 1 operator_distress", 0, 31],
  ["Recall corrections", "Canary engine", "done", "0 corrections applied", 0, 33],
  ["Forecast covenants", "Canary engine", "done", "6 months ahead, 2 red, 3 amber, 7 green", 0, 35],
  ["Draft memo and chases", "Grok", "done", "1 memo, 2 chases, numbers quoted from forecast only", 0, 52],
  ["Analyst sign-off", "Ibad Zuberi", "waiting", "Waiting for a human decision. Nothing is sent.", 1, 0],
].map(([step, owner, status, detail, m, s], i, a) => ({
  id: i + 1, run_id: RUN, seq: i + 1, step, owner, status, detail,
  started_at: T(m, i ? a[i - 1][5] : 0), finished_at: status === "waiting" ? null : T(m, s),
}));

const memo = `> **Recommendation:** move Riverside BTR and Quayside Offices to the red watchlist, and request an updated rent roll from Riverside.

## In short
Rent at Riverside BTR is forecast to cover interest only **1.38 times** by May 2027, below the **1.50 times** the loan requires[^1]. Arrears have climbed to **6.8%** of the rent roll[^2] and service costs are **GBP 212k** over budget this year[^3]. Quayside Offices' loan-to-value is drifting from 66.5% towards **74.5%** against a 70% limit[^4].

## What changed
- Block C's fire risk assessment is **47 days overdue** and its cladding form (EWS1) is still pending[^5]. Lenders may struggle to refinance until this is fixed.
- Recent nearby sales put Riverside's value at **GBP 20.1m - 21.8m**[^6], so the loan is 66-72% of value against a 70% limit.
- Leeds office values fell **4.1%** in twelve months[^7] and 22% of Quayside's space is empty.
- The ground-floor gym operator at Riverside announced closures elsewhere[^8]. It is a small part of income.

## Next steps
1. Ask the Riverside borrower for the rent roll and arrears ageing (draft ready, not sent).
2. Order a desktop valuation for Quayside Offices before the next test.
3. Add both loans to the next credit committee.

[^1]: Loan agreement FA-BTR-014.pdf, page 14, clause 21.2 (synthetic) · Canary forecast
[^2]: Cortile · lease_arrears · rows 4211, 4212, 4219, 4230
[^3]: Cortile · service_charge_ledger · rows 880-882
[^4]: Canary forecast, loan L-031 · Sample market trend (illustrative) derived figure
[^5]: Cortile · compliance_items 3301 and ews_forms 77
[^6]: Sample market trend (illustrative) derived range (licensed, raw rows not shown)
[^7]: Sample market trend (illustrative) derived figure
[^8]: News via Parallel search, 8 Nov 2026
`;
const drafts = [
  { id: 1, run_id: RUN, loan_id: null, kind: "memo", title: "Watchlist memo: 2 red loans", body_md: memo, model: "grok-sample", status: "draft", decided_by: null, decided_at: null, note: null },
  { id: 2, run_id: RUN, loan_id: "L-014", kind: "chase", title: "Chase: Riverside BTR rent roll", body_md: "Hi Sam, ahead of the March covenant test, could you share the current rent roll and arrears ageing for Riverside Blocks A-C by 19 Nov? Thanks, Priya", model: "grok-sample", status: "draft", decided_by: null, decided_at: null, note: null },
  { id: 3, run_id: RUN, loan_id: "L-031", kind: "chase", title: "Chase: Quayside Offices tenancy schedule", body_md: "Hi Alex, could you send the current tenancy schedule and the missing EICR certificate for floors 4-6 of Quayside Offices by 20 Nov? We are also asking for a desktop valuation. Thanks, Tom", model: "grok-sample", status: "draft", decided_by: null, decided_at: null, note: null },
];

const per = [
  ["L-014", "red", "red", "caught"], ["L-031", "red", "red", "caught"], ["L-022", "amber", "amber", "caught"],
  ["L-007", "green", "amber", "missed"], ["L-019", "amber", "green", "false_alarm"],
].concat(L.slice(5).map((c) => [c[0], "green", "green", "correct"]));
const score = {
  caught: 3, missed: 1, false_alarms: 1, correct_green: 7, total_flagged_actual: 4,
  note: "backtest: forecast from data to 31 May 2026, checked against 12 Nov 2026",
  per_loan: per.map(([loan_id, predicted, actual, outcome]) => ({ loan_id, predicted, actual, outcome })),
};
const runs = [
  { id: RUN, created_at: "2026-11-12T19:04:00Z", mode: "live", as_of: "2026-11-12", cutoff: null, llm: "grok-sample", score: null },
  { id: BT, created_at: "2026-11-12T19:00:00Z", mode: "backtest", as_of: "2026-11-12", cutoff: "2026-05-31", llm: "grok-sample", score },
];

// SPEC: LTV and occupancy as percent, ICR as multiple; building/development ids are text.
const P = (v) => (v == null ? v : r(v * 100, 2));
for (const l of loans) {
  l.covenants.ltv_max = P(l.covenants.ltv_max); l.covenants.ltv_cash_trap = P(l.covenants.ltv_cash_trap); l.covenants.occupancy_min = P(l.covenants.occupancy_min);
  l.building_ids = l.building_ids.map((b) => `bld_${String(b).padStart(4, "0")}`);
  l.development_ids = l.development_ids.map((d) => `dev_${String(d).padStart(3, "0")}`);
}
for (const s of signals) if (s.building_id != null) s.building_id = `bld_${String(s.building_id).padStart(4, "0")}`;
for (const f of forecasts) for (const k of ["ltv", "occupancy"]) {
  const m = f.metrics[k];
  m.now = P(m.now); m.limit = P(m.limit); m.cash_trap = P(m.cash_trap);
  for (const b of ["m3", "m6"]) for (const q of ["lo", "mid", "hi"]) m[b][q] = P(m[b][q]);
  m.series = m.series.map((p) => ({ month: p.month, value: P(p.value) }));
}
for (const f of forecasts) for (const d of f.drivers) if (d.delta.metric !== "icr") d.delta.amount = P(d.delta.amount);
for (const e of evidence) if (e.effect && e.effect.metric !== "icr") e.effect.amount = P(e.effect.amount);

const out = { runs, loans, signals, forecasts, evidence, steps, drafts };
for (const [k, v] of Object.entries(out)) writeFileSync(join(here, `${k}.json`), JSON.stringify(v, null, 1));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), forecasts.map((f) => `${f.loan_id}:${f.status}:${f.breach_metric}:${f.breach_month}`).join(" "));
