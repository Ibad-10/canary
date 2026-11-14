"""Sanitised public snapshot of the latest run for the read-only Vercel demo.

    python -m engine.publish

Reads engine/out/latest/*.json and writes web/demo-data/*.json with:
- every MSCI-derived row removed (evidence kind 'msci', 'market' drivers/events) and
  MSCI/RCA mentions in free text replaced with "market data";
- loan, borrower, building and development names, addresses and postcodes replaced
  with stable pseudonyms; Cortile / listing row ids hashed to opaque ids.

The mapping and its salt live only in engine/cache/publish_map.json (git-ignored, not
deployed). A leak check over the output fails the run if any original survives.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import random
import re
import secrets
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "engine" / "out" / "latest"
DST = ROOT / "web" / "demo-data"
MAP_FILE = ROOT / "engine" / "cache" / "publish_map.json"
CORTILE_DB = ROOT / "data" / "cortile" / "cortile-hackathon.sqlite"
TABLES = ["runs", "loans", "signals", "forecasts", "evidence", "steps", "drafts"]

STEMS = ["Ashlyn", "Brennick", "Corvale", "Dellmont", "Eskwood", "Farrowby", "Glenmere", "Halsey",
         "Ilbury", "Jessamy", "Kelburn", "Lenholt", "Morvale", "Nethercombe", "Pellow", "Quenby",
         "Radstone", "Selwick", "Tolland", "Wendlow"]
SUFFIXES = ["Works", "Yard", "Park", "Reach", "Quarter", "Point", "Gardens", "Heights", "Square",
            "Row", "Place", "Mews", "Court"]
BUILDING_STEMS = ["Alder", "Bramley", "Copse", "Dunmere", "Elstow", "Fenwick", "Garth", "Hollins",
                  "Ivel", "Juniper", "Kirkby", "Linton", "Medway", "Nidd", "Orwell", "Penrose",
                  "Quarry", "Rydal", "Stour", "Thorne", "Usk", "Vale", "Wensley", "Yarrow"]
BUILDING_SUFFIXES = ["House", "Court", "Lodge", "Building"]
GENERIC_BUILDING = re.compile(r"^(Block|Tower|Building|Unit|Phase)\s+[A-Z0-9]{1,3}$")

ID_PREFIXES = ["dev", "bld", "tkt", "bud", "cmp", "lse", "unt", "lsh", "mgr", "btg", "auctionhouse",
               "allsop", "bondwolfe", "carterjonas", "struttparker", "pugh", "acuitus", "savillsauc",
               "cliveemson"]
ID_RE = re.compile(r"\b(" + "|".join(ID_PREFIXES) + r")[_-]([0-9a-z]{3,})\b")
# Any prefix_hex / prefix-hex token we did not hash; run ids are ours and stay.
STRAY_ID_RE = re.compile(r"\b(?!(?:run|rec|site|bldg|lst)[_-])[a-z]{2,14}[_-][0-9a-f]{4,}\b")
POSTCODE_AREA_RE = re.compile(r"\b(district|area|postcode)\s+[A-Z]{1,2}\d{0,2}[A-Z]?\b")
FULL_POSTCODE_RE = re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b")
MSCI_RE = re.compile(r"\bMSCI(?:\s+RCA)?\b|\bRCA\b", re.I)
CORTILE_RE = re.compile(r"\bCortile(?:\s+SQLite)?\b", re.I)
CORTILE_PHRASES = [(r"\breal Cortile developments\b", "real developments"),
                   (r"\bPull Cortile signals\b", "Pull building signals"),
                   (r"\bthe Cortile SQLite\b", "the building database"),
                   (r"\b(in|from) Cortile\b", r"\1 the building data")]
URL_RE = re.compile(r"https?://\S+")
PUBLIC_URL_HOSTS = ("landlordknowledge.co.uk", "yorkshirepost.co.uk", "yorkshireeveningpost.co.uk")


def load_map() -> dict:
    if MAP_FILE.exists():
        return json.loads(MAP_FILE.read_text(encoding="utf8"))
    return {"salt": secrets.token_hex(16), "names": {}, "ids": {}}


def opaque(salt: str, prefix: str, raw: str) -> str:
    kind = {"dev": "site", "bld": "bldg"}.get(prefix, "lst" if not re.match(r"^[a-z]{3}$", prefix) else "rec")
    h = hmac.new(salt.encode(), f"{prefix}:{raw}".encode(), hashlib.sha256).hexdigest()[:8]
    return f"{kind}_{h}"


def cortile_identities(loans: list[dict]) -> tuple[list[str], list[str], list[str]]:
    """Building names, development names and address/postcode/company strings for the book."""
    if not CORTILE_DB.exists():
        print("[publish] Cortile DB not found; building names come from the bundle only", file=sys.stderr)
        return [], [], []
    dev_ids = sorted({d for l in loans for d in l.get("development_ids") or []})
    bld_ids = sorted({b for l in loans for b in l.get("building_ids") or []})
    con = sqlite3.connect(CORTILE_DB)
    q = lambda sql, ids: con.execute(sql.format(",".join("?" * len(ids))), ids).fetchall() if ids else []
    bnames, dnames, other = [], [], []
    for name, addr, postcode in q("select name, address_line_1, postcode from buildings where id in ({})", bld_ids):
        if name:
            bnames.append(name)
        other += [s for s in (addr, postcode) if s]
    for name, district, developer, freeholder in q(
            "select name, postcode_district, developer, freeholder from developments where id in ({})", dev_ids):
        if name:
            dnames.append(name)
        other += [s for s in (developer, freeholder) if s]
    con.close()
    return sorted(set(bnames)), sorted(set(dnames)), sorted(set(other))


def build_names(m: dict, loans: list[dict]) -> dict[str, str]:
    """original -> pseudonym, stable across reruns (existing entries are reused)."""
    names: dict[str, str] = m["names"]
    rng = random.Random(m["salt"])
    used = set(names.values())
    stems = [s for s in STEMS if s not in {v.split()[0] for v in used}]
    rng.shuffle(stems)
    suffixes = SUFFIXES[:]
    rng.shuffle(suffixes)
    bstems = BUILDING_STEMS[:]
    rng.shuffle(bstems)

    for i, l in enumerate(sorted(loans, key=lambda x: x["id"])):
        site = l["name"].split(",")[0].strip()
        stem = site.split()[0]
        if stem not in names:
            names[stem] = stems.pop()
        if site not in names:
            names[site] = f"{names[stem]} {suffixes[i % len(suffixes)]}"
        b = l.get("borrower") or ""
        if b and b not in names:
            names[b] = re.sub(rf"\b{re.escape(stem)}\b", names[stem], b) if stem in b else f"{names[stem]} Holdings Ltd"

    bnames, dnames, other = cortile_identities(loans)
    originals = " ".join(bnames + dnames + other + list(names)).lower()
    bstems = [s for s in bstems if s.lower() not in originals]
    taken = {v for v in names.values()} | set(bnames)
    for i, bn in enumerate(bnames):
        if bn in names or GENERIC_BUILDING.match(bn):
            continue
        cand = f"{bstems[i % len(bstems)]} {BUILDING_SUFFIXES[i % len(BUILDING_SUFFIXES)]}"
        while cand in taken:
            cand = f"{rng.choice(BUILDING_STEMS)} {rng.choice(BUILDING_SUFFIXES)}"
        names[bn] = cand
        taken.add(cand)
    for s in dnames + other:
        if s not in names:
            names[s] = "[redacted]"
    return names


def make_text_scrubber(names: dict[str, str], ids: dict[str, str], salt: str):
    # Longest first so "<stem> BTR Holdings Ltd" wins over "<stem>".
    keys = sorted(names, key=len, reverse=True)
    name_re = re.compile(r"\b(" + "|".join(re.escape(k) for k in keys) + r")\b") if keys else None

    def id_sub(mt: re.Match) -> str:
        raw = mt.group(0)
        if raw not in ids:
            ids[raw] = opaque(salt, mt.group(1), raw)
        return ids[raw]

    def url_sub(mt: re.Match) -> str:
        u = mt.group(0)
        return u if any(h in u for h in PUBLIC_URL_HOSTS) else "[link removed]"

    def scrub(s: str) -> str:
        s = ID_RE.sub(id_sub, s)
        if name_re:
            s = name_re.sub(lambda mt: names[mt.group(1)], s)
        s = MSCI_RE.sub("market data", s)
        for pat, rep in CORTILE_PHRASES:
            s = re.sub(pat, rep, s)
        s = CORTILE_RE.sub("building data", s)
        s = POSTCODE_AREA_RE.sub(lambda mt: f"local {mt.group(1)}", s)
        s = FULL_POSTCODE_RE.sub("[postcode]", s)
        s = URL_RE.sub(url_sub, s)
        return s

    return scrub


def is_msci(d: dict) -> bool:
    if d.get("kind") in ("msci", "market"):
        return True
    for k in ("label", "title"):
        if isinstance(d.get(k), str) and MSCI_RE.search(d[k]):
            return True
    src = d.get("source")
    return isinstance(src, dict) and bool(MSCI_RE.search(json.dumps(src)))


def walk(x, scrub, dropped_ev: set[int], counts: dict):
    """Scrub strings; drop MSCI drivers/events; strip references to dropped evidence."""
    if isinstance(x, str):
        return scrub(x)
    if isinstance(x, list):
        out = []
        for v in x:
            if isinstance(v, dict) and "kind" in v and ("delta" in v or "effect_text" in v) and is_msci(v):
                counts["msci_drivers_or_events"] += 1
                continue
            out.append(walk(v, scrub, dropped_ev, counts))
        return out
    if isinstance(x, dict):
        out = {}
        for k, v in x.items():
            if k == "evidence_ids" and isinstance(v, list):
                kept = [e for e in v if e not in dropped_ev]
                counts["evidence_refs_removed"] += len(v) - len(kept)
                out[k] = kept
            elif k == "dataset" and isinstance(v, str) and v.lower() == "cortile":
                out[k] = "buildings"
            else:
                out[k] = walk(v, scrub, dropped_ev, counts)
        return out
    return x


def leak_check(texts: dict[str, str], names: dict[str, str], ids: dict[str, str]) -> list[str]:
    problems = []
    patterns = [(f"name {o!r}", re.compile(rf"\b{re.escape(o)}\b", re.I)) for o in names if names[o] != o]
    id_set = set(ids)
    patterns += [("MSCI", re.compile(r"msci", re.I)), ("RCA", re.compile(r"\brca\b", re.I)),
                 ("cortile", re.compile(r"cortile", re.I)),
                 ("postcode district", POSTCODE_AREA_RE), ("full postcode", FULL_POSTCODE_RE)]
    for fname, txt in texts.items():
        for label, p in patterns:
            mt = p.search(txt)
            if mt and not (label == "postcode district" and mt.group(0).startswith("local")):
                problems.append(f"{fname}: {label} -> ...{txt[max(0, mt.start() - 40):mt.end() + 40]}...")
        for mt in STRAY_ID_RE.finditer(URL_RE.sub("", txt)):
            problems.append(f"{fname}: unhashed id {mt.group(0)!r}")
            break
        for tok in re.findall(r"\b[a-z]{3,14}[_-][0-9a-z]{3,}\b", txt):
            if tok in id_set:
                problems.append(f"{fname}: original id {tok!r}")
                break
        for u in URL_RE.findall(txt):
            if not any(h in u for h in PUBLIC_URL_HOSTS):
                problems.append(f"{fname}: non-public url {u[:80]}")
                break
    return problems


def main() -> int:
    bundle = {}
    for t in TABLES:
        p = SRC / f"{t}.json"
        if not p.exists():
            print(f"[publish] missing {p}", file=sys.stderr)
            return 1
        bundle[t] = json.loads(p.read_text(encoding="utf8"))

    raw = json.dumps(bundle, ensure_ascii=False)
    m = load_map()
    names = build_names(m, bundle["loans"])
    scrub = make_text_scrubber(names, m["ids"], m["salt"])
    counts = {"msci_evidence_rows": 0, "msci_drivers_or_events": 0, "evidence_refs_removed": 0}

    dropped_ev = {e["id"] for e in bundle["evidence"] if is_msci(e)}
    counts["msci_evidence_rows"] = len(dropped_ev)
    bundle["evidence"] = [e for e in bundle["evidence"] if e["id"] not in dropped_ev]

    for l in bundle["loans"]:
        if l.get("contract_file"):
            l["contract_file"] = Path(l["contract_file"]).name

    before = json.dumps(bundle, ensure_ascii=False)
    out = {t: walk(bundle[t], scrub, dropped_ev, counts) for t in TABLES}
    after = json.dumps(out, ensure_ascii=False)

    texts = {f"{t}.json": json.dumps(out[t], ensure_ascii=False) for t in TABLES}
    problems = leak_check(texts, names, m["ids"])

    MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
    MAP_FILE.write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf8")

    if problems:
        print("[publish] LEAK CHECK FAILED, nothing written:", file=sys.stderr)
        for p in problems[:40]:
            print("  " + p, file=sys.stderr)
        return 2

    DST.mkdir(parents=True, exist_ok=True)
    for t in TABLES:
        (DST / f"{t}.json").write_text(json.dumps(out[t], indent=1, ensure_ascii=False), encoding="utf8")

    renamed = sum(1 for o in names if re.search(rf"\b{re.escape(o)}\b", raw))
    print(f"[publish] run {out['runs'][0]['id'] if out['runs'] else '?'} -> {DST.relative_to(ROOT)}")
    print(f"[publish] removed: {counts['msci_evidence_rows']} MSCI evidence rows, "
          f"{counts['msci_drivers_or_events']} MSCI drivers/forecast events, "
          f"{counts['evidence_refs_removed']} references to them")
    print(f"[publish] pseudonymised: {len(names)} names in map ({renamed} present in this run), "
          f"{len(m['ids'])} source ids hashed")
    print(f"[publish] MSCI/RCA mentions: {len(MSCI_RE.findall(raw))} in source, "
          f"{len(MSCI_RE.findall(before))} left after row removal and scrubbed; "
          f"Cortile mentions scrubbed: {len(CORTILE_RE.findall(before))}")
    print(f"[publish] leak check passed ({len(after):,} chars scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
