---
title: Pre-Release Issues
created: 2026-04-23T00:00:00.000Z
modified: 2026-04-23T00:00:00.000Z
tags:
  - launch
  - tracking
icon: list-checks
order: 1
---

# Pre-Release Issues — launch punch list

Execution tracker for the findings in [Cabinet Pre-Release UX Audit](../CABINET-PRE-RELEASE-REPORT/index.md) (225 findings, 2026-04-22). This page is the single source of truth for what ships before the public release. Each row corresponds to one or more numbered findings in the audit. Issues are worked **top-down** — #1 is the first to ship.

## Status legend

- **Open** — not started
- **In design** — a plan exists, implementation not begun
- **In progress** — code being written
- **In review** — awaiting verification
- **Done** — verified in a live run

---

## P0 blockers (do-not-ship)

| # | Issue | Sev | Status | UX report refs |
|---|-------|-----|--------|----------------|
| 1 | [**World-class search palette (Cmd+K)**](./01-search-palette/index.md) — daemon live index, 2-pane grouped results, unified Pages/Agents/Tasks scope, `/` when idle, AI fallback on zero results | P0 | **Done** (2026-04-23) | #110, #111, #112, #113, #114, #117, #118, #119, #185 |
| 2 | Tasks board shows `0 tasks` across every view and filter despite live tasks | P0 | Open | #51, #52 |
| 3 | Hash routes `/#/tasks`, `/#/agents`, `/#/jobs` don't render their views | P0 | Open | #11, #12 |
| 4 | `cabinet.last-route` hijacks first paint on a fresh tab | P0 | Open | #7 |
| 5 | Greeting shows literal `Good afternoon, there.` with unfilled placeholder | P0 | Open | #3, #38 |
| 6 | Template carousel duplicates every card in the a11y tree | P0 | Open | #40 |
| 7 | Task detail stuck on `Loading… · connecting` forever, no timeout | P0 | Open | #59 |
| 8 | Agent "Recent work" shows prompt fragments as file names | P0 | Open | #73 |
| 9 | Status bar acts as a marketing bar (Chat / Contribute / 1,659 stars) | P0 | Open | #156 |
| 10 | Mobile is not designed — no hamburger, clipped composer, overlapping chrome | P0 | Open | #164 |
| 11 | Editor toolbar icon buttons missing `aria-label` (confirmed empty on first 4) | P0 | Open | #89, #174 |
| 12 | Greeting wrapped in `role="alert" aria-live="assertive"` shouts to screen readers | P0 | Open | #173 |
| 13 | 22 Google Font families requested on first paint for theme preview | P0 | Open | #187 |
| 14 | Duplicate API calls on first paint (providers ×3, overview ×5, health ×3, …) | P0 | Open | #188 |
| 15 | Next.js DevTools button visible in production UI | P0 | Open | #219 |
| 16 | No top-nav IA — only the mixed sidebar leads to agents/tasks/jobs/settings | P0 | Open | #11 |
| 17 | Sidebar flattens 70+ CVs and songs to the root of DATA — looks like demo noise | P0 | Open | #22 |
| 18 | Replace all `alert()` / `window.confirm()` with toasts + typed-confirm dialogs | P0 | Open | #207, #208 |
| 19 | `<div onClick>` without keyboard handler in mission-control and elsewhere | P0 | Open | #175 |

---

## How this page is maintained

- Each row's **Status** is updated in-place as work progresses.
- When an issue is started, create a child page under this directory (e.g. `PRE-RELEASE-ISSUES/01-search-palette/index.md`) with the detailed plan, decisions, and verification notes. Link it from the row.
- When an issue ships, the row remains in the table with status **Done** until the release candidate is cut — then the table is archived to `PRE-RELEASE-ISSUES/SHIPPED.md`.
- P1 and below are tracked in the original audit; only P0s are surfaced here until the blockers are clear.

---

## Issue #1 — world-class search palette (shipped 2026-04-23)

**Detail page:** [01-search-palette](./01-search-palette/index.md) — what shipped, verification, and 12 future enhancements.

**Plan:** full design at `~/.claude/plans/ethereal-drifting-pike.md`.

**Summary of the architecture:**

1. **Daemon-backed live index.** `server/search/` boots a `flexsearch` document index from `/data/**/*.md` on daemon startup (<500 ms on ~400 pages), watches with `chokidar`, and serves ranked results via `GET /daemon/search?q=&scope=&limit=`. Incremental updates broadcast on the existing WebSocket event bus as `search:indexed`.
2. **Next.js proxy.** `src/app/api/search/route.ts` proxies to the daemon. When the daemon is down, it returns a structured 503 with a helpful hint so the UI can say "Search is unavailable" instead of spinning forever.
3. **2-pane palette.** `src/components/search/search-palette.tsx` opens as a 900×560 Dialog with:
   - Left pane (320 px): scope tabs (All / Pages / Agents / Tasks), input with `×` clear + `esc` chip, grouped result rows with match counts.
   - Right pane: breadcrumb + title + all snippets for the selected page, `<mark>`-highlighted, each with a line number and "Open at match" button.
   - Empty state: recent queries + recently-opened pages.
   - Zero-results state: one-click "Ask the cabinet" using the existing `/api/agents/headless` endpoint.
4. **Global hotkey hook.** `src/hooks/use-global-hotkeys.ts` owns all app-wide shortcuts. `Cmd+K` opens the palette from anywhere. `/` opens it when focus is idle (not in an input, contenteditable, ProseMirror, or xterm). Tiptap link rebinds from `Cmd+K` to `Cmd+E` so the palette wins inside the editor.

**Non-goals for v1:** semantic vector search, task-transcript search, mobile-first layout.
