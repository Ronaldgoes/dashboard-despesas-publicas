---
title: 'Reformulate commitment-note card view'
type: 'feature'
created: '2026-08-11'
status: 'in-progress'
baseline_commit: '162f7dd'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The current card page is based on a 12-column aggregated workbook, repeats the year and table filters, and hides most fields behind an extra-details action. It does not represent the supplied commitment-note CSV, whose records contain 33 columns and must be browsed as an organized alternative to the spreadsheet.

**Approach:** Reformulate the cards page as a dedicated record browser around the commitment-note fields. Keep a single global agency/year context at the top of the application, group the records by agency, and show all 33 fields in well-labelled visual sections rather than forcing the user to open details or work through a grid of duplicated filters.

## Boundaries & Constraints

**Always:** Preserve existing uncommitted work; organize records by `cdorgao` + `nmorgao`; use the same selected agency and period across every view; render all available source fields as labelled content; retain accessible controls, empty states, sorting, and CSV export. The cards page must not render a second period, agency, or table-filter control.

**Ask First:** Replacing the existing aggregate Excel source with the 695 MB raw CSV in browser, publishing or uploading source data, or changing the dashboard’s metrics beyond what is necessary to make them compatible with the new data.

**Never:** Duplicate the same filter controls in table and cards; hide source fields in a "Detalhar" action; silently discard source columns; overwrite the attached source CSV; introduce a server or external service without approval.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Agency navigation | User selects another agency or changes years | Dashboard, table and cards use the identical context immediately | Preserve a valid selection when available |
| Full record card | Commitment-note record has 33 populated or blank fields | Card groups the record under its agency and presents all 33 labelled fields in visual sections, with blanks shown as “Não informado” | Never omit or conceal a field because it is blank |
| Empty result | Agency/year context has no matches | Current view communicates that no records were found | No broken table, chart, or card layout |

</frozen-after-approval>

## Code Map

- `src/App.jsx` — application state, source normalization, filters, table, dashboard, card rendering, and view navigation.
- `src/App.css` — responsive shared-context toolbar and compact, full-field card layout.
- `public/data/DADOS_ORGAOS_2022_2026.xlsx` — current 12-column aggregate source; retained unless raw-data ingestion is explicitly approved.
- `C:\Users\rgoes\Downloads\base de dados notas de empenho poder executivo 2022 a 2026 (1).csv` — supplied 33-column raw commitment-note reference dataset; read-only input.

## Tasks & Acceptance

**Execution:**
- [ ] `src/App.jsx` — normalize the supplied commitment-note headers alongside the current aggregate headers, derive canonical agency/year/value fields, and retain the ordered raw fields for all record views.
- [ ] `src/App.jsx` — replace per-view table/card filters with one shared contextual filter bar; ensure view navigation keeps agency, period, sorting, and result context intact.
- [ ] `src/App.jsx` — replace the current card grid with an agency-organized record browser. Render all source columns as immediately visible, labelled sections: identification, commitment/contract, creditor, organizational and budget classification, description, and value.
- [ ] `src/App.css` — redesign responsive styling for the dedicated cards page, including concise record headers, readable field sections, long historical descriptions, and a single source-of-truth filter area without disrupting existing dashboard styling.

**Acceptance Criteria:**
- Given an agency and one or more selected years, when the user changes between Dashboard, Tabela, and Visão em cartões, then each view represents the same filtered records without repeated filter widgets.
- Given a normalized commitment-note record, when it is displayed in a card, then every input column is represented by its own human-readable label and value without an additional detail button.
- Given a record with missing values or a long history description, when its card renders, then the layout remains readable and indicates missing data instead of hiding the column.
- Given a card-view result set, when exported, then the exported CSV uses the same shared context and preserves the displayed raw columns.

## Spec Change Log

## Design Notes

- Use a single source-of-truth object for the global context. Per-view rendering must derive from it, rather than owning a parallel set of filter state.
- Preserve source field coverage but organize fields into meaningful visual sections, so the experience is faster to scan than the spreadsheet while still exposing all data.
- The current project is a static Vite application; loading the 695 MB CSV directly in the browser is intentionally excluded until its delivery strategy is approved.

## Verification

**Commands:**
- `npm run lint` — expected: no lint errors.
- `npm run build` — expected: production bundle builds successfully.

**Manual checks:**
- Select an agency and change years, then move among all views and verify the context and record counts agree.
- Inspect a card with long and blank fields at desktop and mobile widths.
