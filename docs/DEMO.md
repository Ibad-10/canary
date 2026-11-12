# Canary - 2-minute demo script

Target: 2:00 total. Speak slowly; every line below is short on purpose. Pre-load `/desk` signed in, engine running on port 8000 (stress slider needs it), and open the red loan tab in advance. Record at 1080p, browser zoom 100%.

## Beats

| Time | Screen and click | Say |
| --- | --- | --- |
| 0:00-0:15 | Landing page `/` | "Lenders find out a property loan is in trouble from the quarterly report. By then it is months late. Canary is a smoke alarm for property loans." |
| 0:15-0:25 | Click Sign in, land on `/desk` | "I'm a credit analyst. This is my desk: 12 loans on real buildings." |
| 0:25-0:40 | `/desk` summary: point at 4 red, 2 amber, 6 green | "Four loans are forecast to break their rules in the next six months. Two are close to a cash trap. Six are fine." |
| 0:40-1:05 | `/desk/dashboard`: drag stress slider to +100bp and -10% values | "What if rates rise one point and values fall ten percent? The engine re-runs the forecast live: nine red, three amber, no green." Reset slider. |
| 1:05-1:25 | Click a red loan, `/desk/loan/[id]`. Show chart, then graph tab ("How we got here"), then evidence table, contract terms, news | "Interest cover is forecast to fall below the loan's limit. Here is why: arrears, service-charge overspend and an overdue fire check in these real buildings. Every number links to its source. V7 Go read the covenant terms from the facility PDF. Parallel found news that moved the forecast. The model does no maths; plain Python does." |
| 1:25-1:45 | `/desk/memo`: scroll memo and a chase letter, click Approve | "Grok drafts the memo and a chase letter per red loan, only from our numbers. Nothing is sent. I approve it: that is the human sign-off." |
| 1:45-1:55 | `/desk/log`: step list, then backtest accuracy | "Every step has an owner and a time. We tested it by forecasting from May and checking November: four caught, one missed, no false alarms." |
| 1:55-2:00 | Back on `/desk` or logo | "Canary: the loan's warning, with proof, before the quarterly report." |

Timing tips: the loan deep dive is the longest beat; if over time, cut the contract-terms mention to one phrase. Do not read numbers off the screen twice.

## Judge Q&A cheat sheet (30 seconds)

- **Why are loan terms synthetic?** No real loan book is public. Everything a loan points at is real: buildings, signals, comps, news. Terms are set from published market levels and labelled synthetic.
- **What is live vs cached?** Live in the demo: stress slider (FastAPI re-runs the forecast), Supabase reads, sign-off writes. Cached from the latest run: news results, MSCI derived factors, V7 extraction, Grok drafts.
- **Data quality?** Every number carries its source. An analyst can flag a number as wrong; the correction is stored in cognee and applied on the next run. Missing data falls back (UK HPI, hand-typed terms) and the step log shows "fallback".
- **What does V7 Go do?** Reads covenant levels (ICR, LTV, occupancy, cash trap) from the facility agreement PDFs, so terms are not typed by hand.
- **What does Grok do?** Writes the watchlist memo and chase letters, and classifies news into a fixed label set. It never produces the numbers.
- **How was accuracy measured?** Forecast with data cut at 2026-05-31, compare with the actual state at 2026-11-12: 4 caught, 1 missed, 0 false alarms. Caveat: Cortile has no occupancy or arrears history, so those come from the snapshot. 12 loans is a small sample.
- **Why landlord loans, not mortgages?** A homeowner's mortgage depends on their pay packet; a landlord's loan depends on the building, and we watch the building.
- **Is MSCI data in the repo?** No. Only derived, labelled figures are shown; raw data stays local and is deleted after judging.
