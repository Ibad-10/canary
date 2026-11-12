# DATA - every source Canary can use

Inspected 12 Nov 2026 against the real files (PRAGMA table_info, CSV headers, row counts). No keys, passwords or MSCI rows in this file.

Use key: **core** = demo depends on it, **maybe** = use if time, **not needed** = skip.

## Two facts that shape the design

1. **Cortile has no market rent.** `leases` exist only for leasehold (17,994), shared_ownership (3,308) and commercial_lease (309) units - long leases with ground rent, share % and arrears. The 8,701 `rented` units (the BTR income) have **no lease rows**, so no tenancy rent and no tenancy arrears. `arrears_gbp` is therefore leaseholder arrears (service charge / ground rent), a building-cashflow signal, not lost tenancy rent. So: Cortile gives *risk signals* (arrears, cost overspend, compliance, tickets, vacancy); **rent and value come from the listings data** (1,454 "let" listings, 5,797 "sale" listings, 1,795 achieved auction prices). Loan income = units x comparable rent x occupancy.
2. **No real loan book exists.** Loan terms (amount, rate, covenant levels) are the only synthetic layer. Everything a loan points at (buildings, signals, values) is real partner data.

---

## Local files (`data/` is gitignored - never commit)

### 1. Cortile SQLite - `data/cortile/cortile-hackathon.sqlite` (+ `cortile.zip`) - **core**

Licence: attendees only, this event only, don't share links or data.

| Table | Rows | Key columns |
| --- | ---: | --- |
| managers | 48 | id, name, role, region, email |
| developments | 300 | id, name, city, region, postcode_district, latitude, longitude, tenure_model, developer, freeholder, completed_year, manager_id, building_count, unit_count, service_charge_year_end |
| buildings | 1,000 | id, development_id, name, address_line_1, city, postcode, latitude, longitude, built_year, storeys, height_m, is_higher_risk, unit_count, has_lift, has_concierge, heating, construction_type, external_wall_status, epc_band_median |
| units | 31,614 | id, building_id, unit_number, floor, type, bedrooms, floor_area_sqm, tenure, occupancy, service_charge_share_pct |
| leases | 21,611 | id, unit_id, building_id, leaseholder_name, leaseholder_type, owner_occupier, lease_start_date, term_years, ground_rent_gbp_per_year, share_owned_pct, arrears_gbp |
| contractors | 364 | id, name, trade, city, region, rating, median_response_hours, insurance_expires_on, accredited |
| compliance_items | 9,777 | id, building_id, type, label, frequency_months, last_completed_on, next_due_on, status, last_outcome, open_actions, contractor_id |
| service_charge_budgets | 40,104 | id, building_id, financial_year_end, status, category, budget_gbp, actual_gbp |
| tickets | 21,499 | id, building_id, unit_id, category, title, description, urgency, status, channel, reported_at, first_response_at, resolved_at, target_resolution_at, contractor_id, manager_id, cost_gbp, reopened |
| ticket_updates | 82,938 | id, ticket_id, created_at, author_role, author_name, body |

Profile (what is actually in it):

- `developments.tenure_model`: build_to_rent 60 (5,874 units), leasehold 157, mixed_tenure 60, shared_ownership 23. Top cities: London 99, Manchester 33, Birmingham 29, Leeds 22, Bristol 20, Liverpool 19.
- `units.tenure`: leasehold 17,994, rented 8,701, shared_ownership 3,308, social_rent 1,302, commercial_lease 309. `units.occupancy`: occupied 30,022, vacant 1,592.
- `leases.arrears_gbp`: 1,912 leases in arrears, total about GBP 5.29m, max about GBP 9.0k.
- `compliance_items.status`: in_date 7,266, due_soon 728, overdue 1,490, no_record 293. Types: fire_risk_assessment, communal_eicr, fire_alarm_service, emergency_lighting_test, insurance_valuation, legionella_risk_assessment (1,000 each), fire_door_inspection 839, lift_loler_inspection 760, lift_service 760, dry_riser_test 418, safety_case_report 390, lightning_protection_test 218, asbestos_reinspection 213, communal_gas_safety 179. **No EWS1 compliance item** - EWS1 lives on `buildings.external_wall_status`.
- `buildings.external_wall_status`: no_concerns 456, ews1_b1 161, not_applicable 161, remediation_complete 81, remediation_planned 74, remediation_in_progress 67. `is_higher_risk` = 1 on 390 buildings.
- `service_charge_budgets`: 16 categories (insurance, repairs_and_maintenance, fire_safety, building_safety_costs, lift_maintenance, ...). Year ends 2024-03/06/12 to 2026-12; 2026-12-31 is `in_progress`, the rest `final`. 53 building-years are more than 10% over budget.
- `tickets`: reported 2025-01-01 to 2026-11-12 (a real monthly series). Urgency: emergency 3,124, urgent 9,166, routine 9,209. 1,061 reopened. 1,364 not yet closed/resolved.

How Canary uses it: per loan, roll up its buildings into monthly signals -
arrears (to income tests), service-charge overspend (to costs and ICR), overdue / no-record compliance + `external_wall_status` + `is_higher_risk` (to legal/insurance covenant and a value haircut for LTV), emergency and reopened tickets (to repair covenant and costs), vacancy (to occupancy). Every signal cites table + row ids. The ticket and service-charge history also allows a real backtest (forecast from data up to a cut-off date, check against what happened after).

### 2. Cortile live API (attendee-only URL) - **not needed** (fallback only)

Header `x-api-key` (key in `.env`). Spec at `/openapi.json` (Cortile hackathon API 1.0.0). Paging `limit` 1-100, `offset` max 10,000. Same data as the SQLite. GET endpoints under `/v1/`: developments (+ `/{id}/buildings`), buildings (+ `/{id}/units|leases|compliance|service-charges|tickets`), units (+ `/{id}/leases|tickets`), leases, service-charges, compliance, tickets (+ `/{id}/updates`), ticket-updates, contractors (+ `/{id}/tickets|compliance`), managers (+ `/{id}/developments|tickets`). Use the SQLite; the API is only worth showing as "live pull" in the step log.

### 3. Listings and auctions - `data/listings/` - **core** (rent and value)

Licence: public pages crawled 24 Oct 2026, snapshot. Event use; fields regex-extracted, so check before relying.

- `Listings Data/v2/listings.csv` / `.parquet` / `.xlsx` - **7,251 rows** (use this). Columns: listing_id, source, agent_firm, url, title, address, postcode, property_type, sale_or_let, price_gbp, price_basis, price_text, currency, size_sqft, size_unit, yield_pct, tenure, tenancy, status, listed_or_auction_date, agent_contact, brochure_urls, crawled_at, lat, lon, geo_source, match_confidence, hmlr_price_gbp, hmlr_date, hmlr_paon, hmlr_saon, hmlr_street, hmlr_property_type, hmlr_tenure, hmlr_score, enrichment_note.
  - sale 5,797 / let 1,454. price_gbp filled on 6,206; yield_pct on only 246; size_sqft on 3,641.
  - property_type top: house 2,347, flat 822, office 762, industrial 698, land 541, residential 460, retail 360, apartment 196.
  - HM Land Registry Price Paid match: high 1,738, medium 80, low 2,997, none 2,436.
- `Listings Data/v2/auction-results.csv` / `.parquet` / `.xlsx` - **2,175 lots**. Columns: result_id, source, lot_ref, url, address, postcode, auction_date, guide_price_gbp, guide_price_upper_gbp, guide_price_text, achieved_price_gbp, achieved_vs_guide_pct, result_status, lot_type, crawled_at. 1,795 achieved prices; status sold 1,733, withdrawn 207, sold prior 100, sold after 72; lot_type residential 488, commercial 371 (rest blank).
- `Listings Data/v2/brochures.csv` - 185 rows: listing_id, source, kind, file, brochure_url, sha256, bytes, drive_link, drive_path, mime.
- `Listings Data/v2/*-checkpoint-2026-10-24.csv` - earlier partial copies (6,841 listings, 1,958 lots). Not needed.
- `Listings Data/listings.*`, `brochures.csv` (v1) - 1,314 / 55 rows, fewer columns (no geo / HMLR). Not needed.
- `Sale Brochures/acuitus/` - 12 PDFs on disk (other source folders empty locally; rest are on Drive). **maybe** - V7 extraction demo.
- `Planning Drawings & Plans/pugh/` - 3 PDFs. Not needed.
- `Refresh Script/refresh.py` - 298-line polite crawler. Not needed.

How Canary uses it: match comps by postcode district and type to each loan's buildings. Let listings give rent per unit (income); sale + achieved auction prices (and HMLR price paid) give value per unit (LTV). Each value cites listing_id / result_id.

### 4. Dwelly - `data/dwelly/Real Estate Agency Synthetic/` - **maybe**

Licence: partner synthetic data, event use. Ignore the `._*` macOS files.

50 case folders `001`-`050`, each with `index.md` (case details: source role, status, created/updated/completed, property, initial request, overview, outcome) and `history.md` (dated event timeline with channel, from, to, body). 16 real PDF attachments (check-out inspection reports, cleaning quotes/invoices, estimates). Source role: Tenant 40, Agency manager 9, auto 1. Addresses are synthetic (ZZ postcodes), so they do not join to Cortile.

How Canary uses it: optional landlord-ops evidence for the buy-to-let loans (a repair dispute or deposit case as a cited cost / chase example). Not joined to buildings.

### 5. Legal - `data/legal/` - **maybe**

Downloaded 12 Nov from the Drive folder in LINKS.md. Licence: Model Commercial Lease templates under the MCL Conditions of Use; Land Registry prescribed clauses under OGL v3.0.

- `Hand-labelled lease sample (organisers)/labelled-leases-and-clauses.csv` (28 rows) and `.json` - built by the organisers from the public MCL templates, for extraction evals. Columns: sample_id, level (document / clause), document_title, document_type, property_type, demise, source, source_url, file_name, version, parties, premises, permitted_use, contractual_term, main_rent, rent_review, break_clause, alienation, insurance, lr_prescribed_clauses, executed, licence, labelled_by, labelled_date, notes.
- `Official and public leases/` - downloaded: MCL-Office-01, MCL-Retail-01, MCL-Logistic-01 and MCL-Lease-Clause-05 (service-charge cap) `.docx`. On Drive only (not downloaded): MCL-Office-02, Retail-02/07, Food-Drink-01, AFL-01, Deposit-01, Lease-Clause-01/03/06, Licalter-01, Licassign-01.
- Drive only, **not needed**: `Legal-lease_datasets_p01..p08.zip` (about 214 MB) - CUAD / DocLayNet general contract collections, not UK leases.

How Canary uses it: the 3 commercial loans each get a real MCL lease template as the tenant lease (break clause, rent review, term for projected-ICR and WALT). The labelled CSV is ground truth to score V7 extraction. Clause wording also seeds the synthetic loan-contract PDFs.

### 6. UI mockup - `mockup/index.html` - **core**

v2, light, V7-inspired. This is the design to follow. `index-v1.html` is the old dark version (and UI_DESIGN.md describes v1) - ignore both.

---

## MCP / API sources (keys in `.env`, never echo or commit)

### 7. MSCI RCA MCP - `https://mcp.msci.com/mcp/v1.0/mcp` - **core** (value adjustments for LTV)

OAuth, one shared event login (never share it). Only `get_rca_*` tools and `get_pa_help` work: get_rca_transactions, _investors, _holdings, _loans, _funds, _property_details, _peerfinder, _company_profile, _trendtracker, _definitions. Contents: comparable sales, prices, cap rates, RCA CPPI indices, some loan / lender data (richest for the US).

Rules: use within the project only, no bulk download, no republishing. Raw results only in `msci_private/` (gitignored, currently empty). Show only derived figures, labelled "MSCI RCA". Delete after judging.

How Canary uses it: CPPI trend and cap-rate moves per UK sector to move each loan's value, hence LTV; comps as a cross-check on the listings value.

### 8. Parallel - `parallel-search`, `parallel-task` MCPs + Python SDK (PARALLEL key set) - **core**

Web search and deep research. How Canary uses it: tenant / borrower / operator news per loan. A material hit (insolvency, operator exit, major tenant loss) must change an income or occupancy input in the forecast, and is cited by URL.

### 9. V7 Go API (V7 key set) - **maybe**

Document extraction. Use: pull covenant terms out of our 3 synthetic loan-contract PDFs (fallback: hand-typed terms), possibly the Acuitus brochures.

### 10. xAI Grok API - `XAI_API_KEY` **EMPTY** - **core**

Canary's in-app LLM: watchlist memo, borrower chase / letter draft, news summaries. Drafts only from the forecast JSON, never does the maths. (`LLM_API_KEY` is the cognee key, not Grok.)

### 11. cognee cloud - **maybe** (extra)

Hosted tenant (URL, tenant id, user id, key in `.env` as `COGNEE_*`; `LLM_API_KEY` holds the same cognee key). Headers `X-Api-Key`, `X-Tenant-Id`. Use: memory of analyst corrections, read back on the next run.

### 12. Supabase MCP - **core, but blocked**

Free tier is full (no free project slot). Options: pause/delete an existing project, or fall back to local SQLite (`engine/canary.sqlite`). `SUPABASE_URL` / `SUPABASE_ANON_KEY` are empty.

### 13. Public - **maybe**

- UK HPI (Land Registry house price index), Aug 2026 release - free proxy for residential value trend by region when MSCI is unavailable. Not downloaded yet (link in LINKS.md).
- HM Land Registry Price Paid - already joined into listings v2 (`hmlr_*` columns).
- postcodes.io - already used for listings geo; Cortile buildings already have lat/lon.
- EPC, Companies House, EA flood, London Datastore - not needed for the demo.

---

## `.env` status (names only)

Set: PARALLEL_API_KEY, V7_API_KEY, LLM_API_KEY, CORTILE_API_URL, CORTILE_API_KEY, COGNEE_API_URL, COGNEE_TENANT_ID, COGNEE_USER_ID, COGNEE_API_KEY. Empty: XAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.

Dwelly on Drive is the same `Real Estate Agency Synthetic.tar.gz` (1.6 MB) already unpacked locally - nothing more to fetch.
