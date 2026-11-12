# Canary - loan early-warning desk (Grok Bot Real Estate Hackathon, 12 Nov 2026)

## MCP servers (Cursor reads .cursor/mcp.json, Claude Code reads .mcp.json - open THIS folder)
- MSCI-RCA-MCP: https://mcp.msci.com/mcp/v1.0/mcp (OAuth; hackathon login from Discord, never commit it). Only get_rca_* tools + get_pa_help work.
- supabase, parallel-search, parallel-task: OAuth sign-in on first use.
- cognee + V7 Go: used from Python with keys in .env (copy .env.example to .env).

## Rules
- MSCI data: use in-app only, never commit, never publish, delete after judging. Save any MSCI output only in msci_private/ (gitignored).
- Cortile data: attendees only, don't share links. Public or synthetic data only.
- Submit: public GitHub repo + 2-min video at /submit by 23:00. Track 1 (workflows), lending-deal demo.

## Layout
data/ (Dwelly, listings, legal - gitignored)   msci_private/ (gitignored)   engine/ (FastAPI)   web/ (Next.js)

## Test MSCI
Ask: "Using the RCA glossary tool, what is a cap rate?" -> should call get_rca_definitions.
If sign-in logs you in as someone else: open https://accounts.msci.com/v2/logout. Wrong account in Cursor: quit Cursor, delete ~/.mcp-auth, reopen.


See HANDOFF.md for the full plan.

## Model / agent usage rule (from Ibad)
- Use Claude Opus (strongest model) ONLY for important decisions: architecture, data model, covenant/forecast maths, planning, debugging hard failures, final review before submission.
- Delegate easy/routine work to smaller, faster models or subagents: boilerplate, UI components from the mockup, styling, CSS, file moves, seed data formatting, README/copy edits, small fixes, running tests/scripts.
- Pattern: Opus plans and splits the work into small tasks -> subagents/smaller models do them in parallel -> Opus reviews and merges.

- Hardest tasks only (e.g. a forecast-engine bug Opus can't crack, tricky data joins, final pre-submission review): escalate to Claude Fable 5.2.
