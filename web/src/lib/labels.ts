import type { Evidence, Forecast, Loan, MetricKey, Status } from "./types";

/**
 * One place for every word that appears on screen.
 * Plain English, sentence case, short. Engine keys (snake_case) never reach the UI.
 */

export const STATUS_NAME: Record<Status, string> = { green: "On track", amber: "Watch", red: "Breach risk" };
export const STATUS_HINT: Record<Status, string> = {
  green: "No covenant limit is forecast to be hit in the next six months.",
  amber: "Heading for a cash-trap level: the lender may start holding back cash.",
  red: "An interest-cover breach or loan-to-value valuation risk is forecast within six months.",
};
/** LTV crossing its limit is a valuation risk (it hinges on a revaluation); ICR crossing is a breach. */
export const breachWord = (metric: string | null | undefined) => (metric === "ltv" ? "Valuation risk" : "Breach");
export const firstBreachLabel = (metric: string | null | undefined) => (metric === "ltv" ? "Valuation risk from" : "First breach");
export const STATUS_ORDER: Status[] = ["red", "amber", "green"];
export const STATUS_COLOR: Record<Status, { dot: string; text: string; bg: string; bd: string }> = {
  red: { dot: "#D92D20", text: "#B42318", bg: "#FEF3F2", bd: "#FECDCA" },
  amber: { dot: "#F79009", text: "#B54708", bg: "#FFFAEB", bd: "#FEDF89" },
  green: { dot: "#17B26A", text: "#067647", bg: "#ECFDF3", bd: "#ABEFC6" },
};

export const METRIC_NAME: Record<MetricKey, string> = {
  icr: "Interest cover",
  ltv: "Loan-to-value",
  occupancy: "Occupancy",
};
export const METRIC_TIP: Record<MetricKey, string> = {
  icr: "Interest cover (ICR): how many times the rent pays the interest bill. 1.5x means £1.50 of rent for every £1 of interest. Lower is riskier.",
  ltv: "Loan-to-value (LTV): the share of the property's value that is borrowed. Higher is riskier.",
  occupancy: "Occupancy: the share of homes or space that is let. Lower is riskier.",
};

export const L = {
  icrNow: "Interest cover now",
  icr6: "Interest cover in 6 months",
  limit: "Covenant limit",
  cashTrap: "Cash-trap level",
  headroom: "Headroom",
  ltv: "Loan-to-value",
  ltvNow: "Loan-to-value now",
  ltv6: "Loan-to-value in 6 months",
  occupancy: "Occupancy",
  firstBreach: "First breach",
  mainReason: "Main reason",
  loanSize: "Loan size",
  sector: "Sector",
  status: "Status",
  owner: "Owner",
  borrower: "Borrower",
  rate: "Interest rate",
  propertyValue: "Property value",
  loan: "Loan",
} as const;

const SECTOR: Record<string, string> = {
  BTR: "Build-to-rent",
  PBSA: "Student housing",
  BTL: "Buy-to-let",
  Office: "Office",
  Retail: "Retail",
  Logistics: "Logistics",
};
export const sectorName = (s: string) => SECTOR[s] ?? s;
export const RESIDENTIAL = new Set(["BTR", "PBSA", "BTL"]);

/** Warning-sign kinds (signals and drivers). */
export const SIGNAL_NAME: Record<string, string> = {
  arrears: "Rent arrears",
  sc_overspend: "Service charge overspend",
  compliance_overdue: "Overdue fire-safety checks",
  compliance_missing: "Missing safety certificates",
  ews_remediation: "Cladding remediation",
  higher_risk: "Higher-risk building",
  emergency_tickets: "Emergency repairs",
  reopened_tickets: "Repeat repairs",
  vacancy: "Empty homes",
  trend: "Recent trend",
  news: "News",
  market: "Market trend (MSCI RCA)",
};
export const signalName = (k: string) => SIGNAL_NAME[k] ?? humanise(k);

export const EVIDENCE_NAME: Record<string, string> = {
  rent_comp: "Rent comparables",
  value_comp: "Sale comparables",
  auction: "Auction results",
  msci: "Market trend (MSCI RCA)",
  hpi: "House prices",
  news: "News",
  lease: "Loan agreement",
  dwelly: "Rental listings",
};
export const evidenceName = (k: string) => EVIDENCE_NAME[k] ?? humanise(k);

export function humanise(s: string): string {
  const t = s.replace(/[_-]+/g, " ").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Rowan Works, Birmingham - build-to-rent block" -> "Rowan Works, Birmingham". */
export const loanTitle = (l: Pick<Loan, "name">) => l.name.split(" - ")[0];
export const loanCity = (l: Pick<Loan, "name">) => loanTitle(l).split(",")[1]?.trim() ?? "";
export const loanSite = (l: Pick<Loan, "name">) => loanTitle(l).split(",")[0];

/** Engine effect text -> plain English. "Adds 4.2pp to LTV" -> "adds 4.2 points to loan-to-value". */
export function plainEffect(text: string): string {
  const t = text.trim();
  let m = t.match(/^(rent|value)\s+([+-]?[\d.]+)%$/i);
  if (m) {
    const n = Math.abs(parseFloat(m[2]));
    const what = m[1].toLowerCase() === "rent" ? "rental income" : "property value";
    return `${parseFloat(m[2]) < 0 ? "cuts" : "lifts"} ${what} by about ${+n.toFixed(1)}%`;
  }
  m = t.match(/^(adds|cuts|takes)\s+([\d.]+)(pp|x)\s+(to|from|off)\s+(LTV|ICR)$/i);
  if (m) {
    const verb = m[1].toLowerCase() === "adds" ? "adds" : "cuts";
    const unit = m[3] === "pp" ? "points" : "x";
    const metric = m[5].toUpperCase() === "LTV" ? "loan-to-value" : "interest cover";
    const n = +parseFloat(m[2]).toFixed(2);
    // "takes 1.7pp off LTV" lowers LTV (good news); "adds Npp to LTV" raises it (bad news)
    const w = m[1].toLowerCase() === "takes" ? "lowers" : verb === "adds" ? "raises" : "lowers";
    return `${w} ${metric} by ${n}${unit === "x" ? "x" : " points"}`;
  }
  return t.replace(/\bLTV\b/g, "loan-to-value").replace(/\bICR\b/g, "interest cover").replace(/pp\b/g, " points");
}

/**
 * Plain sentence for a forecast driver.
 * "Overdue fire-safety checks: raises loan-to-value by 4.2 points."
 */
export function driverSentence(d: Forecast["drivers"][number]): string {
  const kind = signalName(d.kind);
  if (d.kind === "news") return `${trimTitle(d.label)}: ${plainEffect(d.effect_text)}.`;
  return `${kind}: ${plainEffect(d.effect_text)}.`;
}

const trimTitle = (t: string) => (t.length > 70 ? t.slice(0, 69).trimEnd() + "…" : t);

/** The driver that hurts most. Drivers arrive sorted by the engine; prefer the first one that hurts. */
export function topDriver(f: Forecast) {
  const ds = f.drivers ?? [];
  return ds.find((d) => /^(adds|cuts)/i.test(d.effect_text) || /^(rent|value)\s+-/i.test(d.effect_text)) ?? ds[0] ?? null;
}

/* ---------- news ---------- */
export type NewsItem = {
  id: number;
  loanId: string;
  headline: string;
  domain: string;
  url: string | null;
  published: string | null;
  severity: "high" | "medium" | "low";
  severityLabel: string;
  kind: string;
  why: string;
  moved: boolean;
};

const SEVERITY_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

function cleanHeadline(t: string): string {
  if (t.includes(" | ")) {
    const [a, b] = t.split(" | ");
    return `${b}: ${a}`;
  }
  return t;
}

export function newsItems(evidence: Evidence[], forecasts: Forecast[]): NewsItem[] {
  const moved = new Set<number>();
  forecasts.forEach((f) => f.drivers?.forEach((d) => d.evidence_ids?.forEach((id) => moved.add(id))));
  return evidence
    .filter((e) => e.kind === "news")
    .map((e): NewsItem => {
      const eff = (e.effect ?? {}) as { metric?: string; delta_pct?: number; label?: string; severity?: string };
      const sev = (["high", "medium", "low"].includes(String(eff.severity)) ? eff.severity : "medium") as NewsItem["severity"];
      const src = e.source as { url?: string; published?: string };
      let domain = "";
      try { domain = src.url ? new URL(src.url).hostname.replace(/^www\./, "") : ""; } catch { domain = ""; }
      const what = eff.metric === "rent" ? "rental income" : eff.metric === "value" ? "property value" : null;
      const pct = typeof eff.delta_pct === "number" ? Math.abs(eff.delta_pct) : null;
      const kind = eff.label ? eff.label.replace(/\s*\((high|medium|low)\)\s*$/i, "") : "News";
      const why = what && pct != null
        ? `${kind}. Canary ${eff.delta_pct! < 0 ? "cuts" : "lifts"} expected ${what} by about ${pct}% in the forecast.`
        : `${kind}. Context for the forecast.`;
      return {
        id: e.id, loanId: e.loan_id, headline: cleanHeadline(e.title), domain, url: src.url ?? null,
        published: src.published ?? null, severity: sev, severityLabel: SEVERITY_LABEL[sev], kind, why, moved: moved.has(e.id),
      };
    })
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
