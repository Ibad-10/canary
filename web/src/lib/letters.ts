import { METRICS, fmt, fmtCov } from "./calc";
import { METRIC_NAME, firstBreachLabel } from "./labels";
import { monthYear } from "./view";
import type { Forecast, MetricKey } from "./types";

/** The covenant the forecast is worried about, falling back to the first metric on file. */
export function focusMetric(f: Forecast): MetricKey | null {
  const k = f.breach_metric as MetricKey | null;
  if (k && f.metrics[k]) return k;
  return METRICS.find((m) => f.metrics[m]) ?? null;
}

export function letterFigures(f: Forecast | undefined): { label: string; value: string; tone?: "red" | "amber" }[] {
  if (!f) return [];
  const k = focusMetric(f);
  const m = k ? f.metrics[k] : undefined;
  if (!k || !m) return [];
  const tone = f.status === "green" ? undefined : f.status;
  const out: { label: string; value: string; tone?: "red" | "amber" }[] = [
    { label: `${METRIC_NAME[k]} now`, value: fmt(k, m.now) },
    { label: "In 6 months", value: fmt(k, m.m6.mid), tone },
    { label: "Limit", value: fmtCov(k, m.limit) },
  ];
  if (m.cash_trap != null) out.push({ label: "Cash trap", value: fmtCov(k, m.cash_trap) });
  if (f.status === "red" && f.breach_month) out.push({ label: firstBreachLabel(f.breach_metric), value: monthYear(f.breach_month), tone: "red" });
  return out;
}

export type ParsedLetter = {
  subject: string | null;
  recipient: string | null;
  deadline: string | null;
  /** Body without the "DRAFT" banner and subject line, as markdown. */
  body: string;
  /** Plain text to paste into an email client. */
  copyText: string;
};

export function parseLetter(raw: string): ParsedLetter {
  const lines = raw.replace(/\r/g, "").split("\n");
  let subject: string | null = null;
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^draft\b.*not sent$/i.test(t)) continue;
    const s = t.match(/^subject:\s*(.+)$/i);
    if (s && subject == null) { subject = s[1].trim(); continue; }
    kept.push(line);
  }
  while (kept.length && !kept[0].trim()) kept.shift();
  const body = kept.join("\n").trimEnd();
  const recipient = body.match(/^(?:Dear|Hi|Hello)\s+([^,\n]+),/m)?.[1]?.trim() ?? null;
  const deadline = body.match(/\bby (\d{1,2} [A-Z][a-z]+(?: \d{4})?)/)?.[1] ?? null;
  const copyText = [subject ? `Subject: ${subject}` : null, body].filter(Boolean).join("\n\n");
  return { subject, recipient, deadline, body, copyText };
}

/**
 * The parts of the portfolio memo that talk about one loan: every list item or
 * paragraph naming the loan id, grouped under the memo's own headings.
 */
export function memoForLoan(md: string, loanId: string): { heading: string | null; items: string[] }[] {
  const id = new RegExp(`\\b${loanId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`);
  const out: { heading: string | null; items: string[] }[] = [];
  let heading: string | null = null;
  let para: string[] = [];
  const push = (text: string) => {
    let g = out.find((x) => x.heading === heading);
    if (!g) out.push((g = { heading, items: [] }));
    g.items.push(text);
  };
  const flush = () => {
    const text = para.join(" ").trim();
    para = [];
    if (!text || !id.test(text)) return;
    const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/).filter((s) => id.test(s));
    push(sentences.join(" "));
  };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) { flush(); heading = h[1]; continue; }
    const li = line.match(/^(?:[-*]|\d+[.)])\s+(.*)$/);
    if (li) { flush(); if (id.test(li[1])) push(li[1]); continue; }
    if (!line || line.startsWith(">") || line.startsWith("[^")) { flush(); continue; }
    para.push(line);
  }
  flush();
  return out;
}
