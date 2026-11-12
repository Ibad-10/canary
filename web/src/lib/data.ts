import "server-only";
import { cache } from "react";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Bundle, Run } from "./types";

const TABLES = ["loans", "signals", "forecasts", "evidence", "steps", "drafts"] as const;

async function readJson<T>(dir: string, name: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(path.join(process.cwd(), dir, `${name}.json`), "utf8");
    const j = JSON.parse(txt);
    return j as T;
  } catch {
    return null;
  }
}

const asArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : x ? [x as T] : []);

/** Keep rows of the chosen run; if the rows carry no matching run_id (e.g. a single-run export) keep them all. */
function forRun<T extends { run_id?: string }>(rows: T[], runId: string): T[] {
  const matching = rows.filter((r) => r.run_id === runId);
  return matching.length ? matching : rows.filter((r) => !r.run_id);
}

function pickRuns(runs: Run[]) {
  const byNew = [...runs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const live = byNew.find((r) => r.mode === "live") ?? byNew[0];
  const scoreRun = byNew.find((r) => r.score) ?? null;
  return { live, scoreRun };
}

async function fromSupabase(): Promise<Bundle | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data: runs, error } = await sb
      .from("runs")
      .select("*")
      .eq("mode", "live")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !runs?.length) return null;
    const run = runs[0] as Run;
    const { data: scoreRuns } = await sb
      .from("runs")
      .select("*")
      .not("score", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const get = async (t: string) => {
      let q = sb.from(t).select("*");
      if (t !== "loans") q = q.eq("run_id", run.id);
      const { data, error: e } = await q;
      if (e) throw new Error(`${t}: ${e.message}`);
      return data ?? [];
    };
    const [loans, signals, forecasts, evidence, steps, drafts] = await Promise.all(TABLES.map(get));
    if (!loans.length || !forecasts.length) return null;
    return {
      source: "supabase",
      run,
      loans,
      signals,
      forecasts,
      evidence,
      steps: steps.sort((a, b) => a.seq - b.seq),
      drafts,
      scoreRun: (scoreRuns?.[0] as Run) ?? null,
    } as Bundle;
  } catch (e) {
    console.warn("[canary] supabase read failed, falling back:", (e as Error).message);
    return null;
  }
}

async function fromFiles(dir: string, source: Bundle["source"]): Promise<Bundle | null> {
  const runsRaw = await readJson<unknown>(dir, "runs");
  if (!runsRaw) return null;
  const runs = asArray<Run>(runsRaw);
  if (!runs.length) return null;
  const { live, scoreRun } = pickRuns(runs);
  const t: Record<string, unknown[]> = {};
  for (const name of TABLES) t[name] = asArray(await readJson<unknown>(dir, name));
  if (!t.loans.length || !t.forecasts.length) return null;
  return {
    source,
    run: live,
    loans: t.loans,
    signals: forRun(t.signals as { run_id?: string }[], live.id),
    forecasts: forRun(t.forecasts as { run_id?: string }[], live.id),
    evidence: forRun(t.evidence as { run_id?: string }[], live.id),
    steps: (forRun(t.steps as { run_id?: string }[], live.id) as { seq: number }[]).sort((a, b) => a.seq - b.seq),
    drafts: forRun(t.drafts as { run_id?: string }[], live.id),
    scoreRun,
  } as unknown as Bundle;
}

/** Supabase -> public/data/*.json (engine output) -> fixtures/*.json (sample). */
export const getBundle = cache(async (): Promise<Bundle> => {
  const b =
    (await fromSupabase()) ??
    (await fromFiles("public/data", "files")) ??
    (await fromFiles("fixtures", "fixture"));
  if (!b) throw new Error("No data: Supabase, public/data and fixtures all empty");
  return b;
});
