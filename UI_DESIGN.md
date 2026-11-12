# UI DESIGN - Canary

## Feel
A calm, expensive credit-risk terminal: think Linear + Bloomberg + Stripe dashboard. Dark by default, dense but breathable. Judges should "get it" in 3 seconds: green portfolio, one loan turning red, click -> proof.

## Inspiration (look at these)
- Linear (calm dark UI, keyboard feel): https://linear.app
- Vercel dashboard (clean cards, mono numbers): https://vercel.com/dashboard
- Stripe Radar (risk scores with reasons): https://stripe.com/radar
- Mercury (finance UI polish): https://mercury.com
- Palantir Foundry / Gotham (graph + evidence panels): https://www.palantir.com/platforms/foundry/
- Obsidian graph view (glowing knowledge graph): https://obsidian.md
- Moody's CRE (closest competitor, show you are friendlier): https://www.moodys.com/web/en/us/capabilities/commercial-real-estate.html
- Component kits: shadcn/ui https://ui.shadcn.com  | Tremor charts https://tremor.so  | Magic UI https://magicui.design  | Aceternity https://ui.aceternity.com  | Lucide icons https://lucide.dev

## Design tokens
- Background #0A0B0D, panels #111317, borders #1F232A, text #E6E8EB, muted #8A919C
- Canary yellow accent #FFD60A (logo, primary button, focus)
- Status: healthy #22C55E, watch #F59E0B, breach #EF4444 (with soft glow), info #3B82F6
- Font: Inter for UI, JetBrains Mono / Geist Mono for every number (tabular)
- Radius 12px, 1px borders, no heavy shadows; subtle glow only on red nodes

## Screens (in priority order)
1. Watchlist (home): top strip of 4 KPIs (loans monitored, on watch, forecast breaches, est. exposure GBP). Table: loan, asset type chip (Residential/BTR/Student/Office), LTV now -> forecast, ICR, occupancy, months to breach, status pill, sparkline. Sort by "months to breach".
2. Loan detail: left = covenant gauges (LTV/ICR/occupancy vs limit, with estimated range band). Centre = knowledge graph: Loan -> Building(s) -> Signals (arrears, overdue FRA/EWS1, emergency tickets, service-charge overspend, news) -> Covenant. Breach path glows red, the rest dims. Right = Evidence panel: every number with a source chip (Cortile row id, MSCI comp, Parallel news URL, contract page). Clicking a chip opens the source.
3. Memo: AI-drafted watchlist memo, each sentence footnoted to sources. Buttons: Approve / Edit / Reject (human sign-off). Edits saved to cognee as "analyst correction".
4. Step log / timeline: data pulled -> forecast -> memo drafted -> chase drafted -> approved, with owner, time, duration (cycle time).
5. Accuracy panel: planted breaches caught / missed / false alarms, as a simple confusion grid.
Extras: stress slider (rates +1-3%, values -5-20%) re-colouring the graph live; time-machine scrubber replaying the last 12 months.

## Micro-details that win demos
- Animate a loan flipping amber -> red when the slider moves.
- Hover any number = tooltip "from Cortile bld_0042 compliance, 12 Nov 2026".
- Empty states and loading skeletons, never spinners on a blank screen.
- Command bar (Cmd+K): "show loans with overdue EWS1".
- Label synthetic data clearly with a small "Synthetic" badge, and MSCI-derived values "MSCI RCA, not stored".
