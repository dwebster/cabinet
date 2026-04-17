# Progress

[2026-04-17] Task runner wiring: new `src/lib/agents/task-runner.ts` (with sibling `task-heuristics.ts`, both with tests) is now invoked in the background after `createTask` and `appendTurn` so the adapter starts running without blocking the API response. Skippable via `skipAgentRun: true` in the request body. Claude local adapter gained session-resume support — when `ctx.sessionId` is present it appends `--resume <id>` instead of `--no-session-persistence`. Default task `runtime.contextWindow` now falls back to 200k.

[2026-04-17] Image Creator agent heartbeat: built a pre-script visual mockup of Slide 2 (labeled chat inventory) for the "Group Chat Shame Spiral" carousel brief, answering the Script Writer's open research question (inventory reads at 4 rows, not 5). Added visual-direction doc, linked it from the brief, and registered the carousel as "Mockup (pre-script)" in the carousels index.

[2026-04-17] Sidebar list-item hover background tuned: dropped to `hover:bg-foreground/[0.03]` — visible enough to register as a hover state but quiet enough not to compete with the colored agent chips and the selected-row treatment. Replaces the original near-invisible `hover:bg-accent/50`.

[2026-04-17] AGENTS / TASKS / DATA section headers in the sidebar now reveal a `+` button on hover (200 ms reveal delay, instant fade-out via `group-hover:delay-200` on opacity transition). Each routes to its section first, then dispatches an event to open the right dialog: `cabinet:open-add-agent` (existing), new `cabinet:open-create-task` (added listener in `tasks-board`), and `setKbSubPageOpen` for DATA. Tasks header restructured into a `group` row to host the action.

[2026-04-17] Stripped the heartbeat label and hover tooltip from sidebar agent rows. Each row is now just `[colored chip] Name • status-dot` — quieter, matches the user's preference for a leaner sidebar. Removed the now-unused `HeartPulse`, `cronToShortLabel`, and `Tooltip*` imports from `tree-view.tsx`.

[2026-04-17] Sidebar polish: bumped AGENTS section bottom-padding (`pb-px` → `pb-1.5`) so the first agent row gets a touch of breathing room, and shrank the sidebar scrollbar to 6px wide with a 2px right inset (scoped via Tailwind arbitrary selectors so other ScrollAreas in the app are untouched).

[2026-04-17] Sidebar agent rows now wear their schedule color: each agent's icon sits in a 20×20 rounded chip tinted with `getAgentColor(slug)` — same palette the schedule-list/calendar uses, so the sidebar visually matches the heartbeat timeline. Replaced the `0j · 0t` clutter with a single `HeartPulse` + heartbeat label; detailed counts moved to the row tooltip. Also dropped non-section sidebar item text from 13px → 12px and softened the color to `text-foreground/75` (hover restores full contrast) so AGENTS / TASKS / DATA labels read as the dominant landmarks.

[2026-04-17] Cabinet-mode agent rows collapsed to single line: icon + name + inline meta (`0j · 0t · 9am`) + status dot, ditching the two-line layout that doubled row height. Tightened the `pb-px` gap under section headers so the first child sits closer to its label. Long meta strings truncate gracefully and live in a `title` tooltip.

[2026-04-17] Sidebar tree hierarchy refined: dropped child indent from `pad(2)` (40px) to `pad(1)` (24px) so each level steps in by a single 16px tab instead of two; bumped section-header type from 10px → 11px and tightened tracking; unified icon sizes (sections + items now both 14px), removed leftover chevron spacers under section headers, and tightened row vertical padding to `py-1`. Children no longer dwarf their parents and the AGENTS / DATA hierarchies read as proper outline levels.

[2026-04-17] `RuntimeMatrixPicker` now sorts the tab strip so ready providers appear first and unready (Not ready) ones are pushed to the right. Stable order preserved within each group. Applies to both the task composer dropdown and the Settings default-runtime matrix so users see their installed + authenticated options up front instead of scrolling past grayed-out tabs.

[2026-04-17] Day view of the jobs & heartbeats calendar now always renders events as pills (no dot collapse) and expands vertically to fit them. Buckets are walked in time order; if a tall pill stack would overlap the next slot, the next bucket is shifted down and the column grows to match. Hour labels stay at their natural positions — pills carry their exact timestamps so the drift is acceptable. Week view keeps the dot-collapse behavior because side-by-side columns can't grow.

[2026-04-17] Jobs & heartbeats calendar: crowded 15-min slots (week) and crowded days (month) now collapse into a row of small agent-colored circles instead of silently truncating beyond a hard cap. Each circle has a hover tooltip showing agent · label · time · past/upcoming state. Sparse slots keep the pill look unchanged. Also split pill/dot click routing: past events load the matching conversation (`GET /api/agents/conversations?agent=…&trigger=job|heartbeat` → closest `startedAt` to event.time, jobs also filtered by `jobId`) and open `TaskDetailPanel` via `setTaskPanelConversation`; future events keep opening the existing edit dialog.

[2026-04-17] `RuntimeMatrixPicker` now disables provider tabs whose CLI isn't ready (not installed, not authenticated, or disabled in Settings). Disabled tabs render grayscale + 50% opacity, carry a "Not ready" chip next to the name, and expose a hover tooltip explaining which step blocks them (e.g. "Cursor CLI — Not installed on this machine. Follow the install guide below."). `base-ui` TabsTrigger's `disabled` prop prevents click + keyboard activation. If the currently stored selection points at an unready provider, the picker auto-focuses the first ready tab instead. Works in both surfaces: task composer (where only ready providers were already shown) and Settings default-runtime matrix (where all enabled providers are shown so users can see what's available but can only click ones that'll actually run).

[2026-04-17] Extracted `RuntimeSelectionBanner` (the colored "Selected Model" header from the task composer dropdown) out of `TaskRuntimePicker` into its own exported component. Now used in two places: (a) the composer dropdown, where it renders with an `App default / Select app default` reset button injected as the trailing slot; (b) Settings → Providers, where it sits above the matrix picker labeled "Default Model" and picks up the same effort-toned background color as the composer. No duplicated banner markup.

[2026-04-17] Settings → Providers now reuses the task composer's runtime picker UI for default provider/model/effort selection. Extracted the inline tabs + matrix body out of `TaskRuntimePicker` into a new exported `RuntimeMatrixPicker` component (same file, so supporting helpers `ProviderRuntimeMatrix` / `SelectionRadio` / `getEffortTone` stay co-located). `TaskRuntimePicker` now just wraps `RuntimeMatrixPicker` inside its dropdown — no duplicated Tabs/TabsTrigger/ProviderGlyph markup, no duplicated active-tab state. Settings replaces the three hand-rolled blocks (provider buttons + model grid + effort grid) with a single `<RuntimeMatrixPicker includeUnavailable />` that saves to `/api/agents/providers` on every selection. `includeUnavailable` filters on `enabled` only (rather than `available && authenticated`) so users can set a default for a provider they're about to install.

[2026-04-17] Added in-UI provider verification. New endpoint `POST /api/agents/providers/[id]/verify` spawns the provider's "Verify setup" command (with `ADAPTER_RUNTIME_PATH` so PATH matches real task runs), captures stdout/stderr/exitCode, and classifies the result as one of `pass | not_installed | auth_required | payment_required | quota_exceeded | other_error` via keyword heuristics ("command not found", "quota exceeded", "payment required", "not authenticated"/"401", etc). The Settings → Providers guide and the Onboarding wizard both got a "Run verify" button per provider that shows a colored status chip, highlights which step failed (step marker turns red with "!"), and exposes raw stdout/stderr on demand. Verified classification against Claude (pass), Codex (pass), Gemini (pass), OpenCode (pass), Cursor / Pi / Grok / Copilot (`not_installed` with hint "The CLI binary isn't on your PATH yet. Rerun the Install step").

[2026-04-17] Verified headless "Reply with exactly OK" across installed providers. Claude ✅ / Codex ✅ / OpenCode ✅ (after today's stdin fix). Gemini CLI 0.1.9 rejected `--output-format` as an unknown argument, so the guide's verify command was changed to `gemini -p 'Reply with exactly OK' --yolo` and the install step was pinned to `@google/gemini-cli@latest` with a note that Cabinet's Gemini adapter needs 0.14+ for stream-json output. Cursor / Pi / Grok / Copilot are not yet installed on this machine, so their verify steps are pending install.

[2026-04-17] Fixed OpenCode adapter "silent success" bug discovered when running `google/gemini-2.5-pro` without a configured provider API key: (1) prompt is now piped via stdin instead of passed as a trailing CLI arg (matches paperclip's proven invocation and avoids the first-run migration path swallowing the prompt); (2) added a stderr filter that suppresses `Performing one time database migration…` / `sqlite-migration:*` / `Database migration complete.` bootstrap noise; (3) when OpenCode exits 0 with zero assistant messages and no session id, Cabinet now synthesizes a non-zero exit with a pointed error ("…the most common cause is a missing provider API key for the requested model e.g. GOOGLE_GENERATIVE_AI_API_KEY for google/* models…"). Updated the opencode test script to consume stdin.

[2026-04-17] Added Grok CLI (`grok_local`) and GitHub Copilot CLI (`copilot_local`) as two new structured providers. Both use plain-stdout passthrough (no stream-json contract yet), expose model selection + extraArgs config, ship install guides with the headless "Verify setup" step, and auto-register alongside the existing six. Providers API now returns 8 CLI providers / 10 adapters total (including legacy). Corrected the OpenCode install command to `npm i -g opencode-ai` (the published package name) and deleted the superseded `AI-claude-editor.md` plan doc.

[2026-04-17] Added "Verify setup — Confirm headless mode works" install step to every provider (Claude, Codex, Cursor, OpenCode, Pi) matching the Gemini pattern, so users can test each CLI end-to-end with a one-shot `Reply with exactly OK` prompt before trusting it in Cabinet task runs.

[2026-04-16] Runtime picker tab strip now horizontally scrolls (hidden scrollbar) so 6 provider tabs fit in the 32rem dropdown without clipping. Renamed Cursor provider display from "Cursor Agent CLI" → "Cursor CLI" to match the Codex/Gemini pattern and keep tab widths consistent.

[2026-04-16] Settings provider guide now reads `provider.installSteps` from the API instead of a hardcoded PROVIDER_SETUP_STEPS map that only covered claude-code and codex-cli. Cursor, OpenCode, and Pi now show their install guides in Settings → Providers. Added `iconAsset` to `ProviderInfo` type for consumers that want to pick up the provider-declared glyph.

[2026-04-16] Multi-CLI provider integration: added Cursor Agent, OpenCode, and Pi as structured adapters using the paperclip pattern (stream-json parsing + session codec + unknown-session retry). Extended adapter types with `AdapterSessionCodec` / `listSkills` / `syncSkills` hooks and `AgentProvider.iconAsset`. Added an external adapter plugin loader (`~/.cabinet/adapter-plugins.json`) with built-in-fallback preservation, wired into the daemon on startup. Updated provider-glyph + API to surface `iconAsset`, shipped placeholder SVGs for the three new providers, added stream-parsing tests for each new adapter, updated the registry assertion to cover all 8 adapters, and documented the round's work + deferred Round B items in AI_PROVIDER_RUNTIME_PROGRESS.md.

[2026-04-16] Claude Code model labels now include version numbers in the runtime picker ("Claude Opus 4.7", "Claude Sonnet 4.6", "Claude Haiku 4.5"), with Opus listed first.

[2026-04-16] Runtime picker: fixed gap between tabs and model table by wrapping the TabsList in a flex container, eliminating the CSS inline-flex baseline descender space that was adding ~4px below the tab buttons. Inactive tabs now use bg-muted/60 so the active tab stands out clearly.

[2026-04-16] COO heartbeat for Text Your Mom: delivered mid-week operating review (Apr 14 week). Audited Tuesday Proof-of-Life — all three cabinets missed (app-dev, TikTok, Reddit). Identified TikTok image-creator produced two script-ready briefs today (first marketing output ever). Reddit remains dark with zero job runs. Created content-calendar/index.md for TikTok, appended COO review to company/operations, updated COO memory, and sent urgent messages to CEO, Reddit researcher, and DevOps agent.

[2026-04-16] Models picker: renamed "Task Model" → "Selected Model", collapsed model info into a single row (icon + name + Provider · Effort with effort-toned colors), header row transparent (no box), tabs row retains background styling.

[2026-04-16] Models picker: removed bottom margin (mb-1.5) from the selected model banner row.

[2026-04-16] Models picker: provider tab backgrounds set to bg-background (matching the table) using !important overrides to beat line-variant transparent base styles; removed all borders from tabs.

[2026-04-16] Resume Tailor heartbeat for hila-finds-job: audited master resume — found it still contains placeholder content with a critical career target mismatch (summary says EM/Director of Engineering but all 12 pipeline jobs are PM roles). Created detailed tailoring briefs for both "Saved" jobs (Figma Senior PM Collaboration and dbt Labs Senior PM Core) with keyword maps, gap analyses, cover letter angles, and next-step checklists. Flagged the EM→PM narrative gap as a blocker on the master resume. Both briefs ready to generate tailored resumes the moment real experience is entered.

[2026-04-16] Networking Scout heartbeat for hila-finds-job: audited all 13 contacts against pipeline state. Created outreach-drafts-apr-16.md with 7 personalized, ready-to-send messages (Sarah Lin follow-up, Marcus Stripe check-in, David Park first touch, Alex Rivera mock-interview ask, Dana Kim post-Round-2 thank you, Jake Wilson post-screen check-in, Chris Donovan dormant reconnect). Updated networking/index.md with this week's priority table. Flagged contacts not to contact this week to avoid over-messaging active processes.

[2026-04-16] DevOps daily bug triage for Text Your Mom app-development cabinet. Updated bug-triage.csv with fix targets, DevOps risk framing, and CTO-confirmed root cause notes for all 5 bugs. RT-4 (reminder 2h late) flagged as P2 blocker with zero delivery telemetry; PC-3 (paywall dismiss) and OB-5 (nickname) confirmed for this sprint. Updated DevOps agent context memory.

[2026-04-16] Michael Burry heartbeat: upgraded NVDA bear thesis from watching (Apr 14, conviction 3) to active bear signal (conviction 4) — specific catalyst is Blackwell hyperscaler uptake data at Q1 FY2027 earnings ~late May 2026; 57 Buy / 0 Sell consensus, Google TPU v6 / Amazon Trainium 2 / Microsoft Maia already live in production, DCF 25% premium, 37% downside on estimate + multiple compression. Initiated META bear signal (conviction 3) focused on cash flow arithmetic: $115-135B capex committed yields ~negative FCF in Q1 2026; FCF/NI already 0.72x; Reality Labs $24B/year annualized under unchecked dual-class governance. Both signals appended to market-analysis/signals.csv with catalyst and timeframe per Burry methodology.

[2026-04-16] Benjamin Graham heartbeat: conducted NCAV and balance sheet quality screens on AAPL, NVDA, and META. AAPL: negative NCAV (-$138B), P/B 48x — neutral, conviction 2. NVDA: trading at ~36x estimated NCAV, P/E 56x, pure growth speculation — bearish, conviction 4. META: NCAV near zero, P/E 23x, DCF-based cheapness not Graham cheapness — neutral, conviction 2. All three signals appended to market-analysis/signals.csv.

[2026-04-16] Warren Buffett heartbeat: evaluated NVDA through the four filters. CUDA switching-cost moat acknowledged, Jensen Huang rated excellent capital allocator, but 40%+ hyperscaler concentration and 56x P/E with 25% DCF premium leaves no margin of safety — neutral signal, conviction 2. Signal appended to market-analysis/signals.csv.

[2026-04-16] Charlie Munger heartbeat: applied inversion analysis to NVDA and META. NVDA flagged bearish — lollapalooza consensus (57 Buy / 0 Sell), 25% DCF premium, hyperscaler silicon competition risk. META flagged neutral — PEG attractive but dual-class governance and $115-135B capex bet create unacceptable minority shareholder risk. Signals appended to market-analysis/signals.csv.

[2026-04-16] Models picker: replaced generic Lucide icons in ProviderGlyph with brand images — Claude AI symbol SVG for Claude Code (icon="sparkles") and ChatGPT logo PNG for Codex CLI (icon="bot").

[2026-04-16] Peter Lynch heartbeat: wrote three signals to market-analysis/signals.csv using corrected prices from fundamentals analyst (AAPL $260.48, NVDA $188.63, META $629.86). NVDA neutral (PEG 0.77 trailing / 1.6 forward, customer concentration disqualifier, fully discovered by Wall Street). META downgraded from bullish to neutral — corrected price re-rates PEG from 0.96 to 1.17, hold existing position but do not add, stalwart sell trigger at P/E 36x. AAPL downgraded to bearish — corrected price re-rates PEG to 3.8 (stalwart sell rule triggered at P/E 42x vs 16.5x threshold).

[2026-04-14] CLI: `cabinetai run` is now fully all-in-one — no `create` needed first. Extracted scaffold logic into `cabinetai/src/lib/scaffold.ts` and added `resolveOrBootstrapCabinetRoot()` which auto-creates the cabinet structure (`.cabinet`, `.agents/`, `.jobs/`, `.cabinet-state/`) in the current directory if none is found. `ensureApp()` then detects and installs the web app if needed. Updated Quick Start in README and CABINETAI.md to reflect the single-command flow.

[2026-04-14] CLI: all user-facing messages and README docs now show `npx cabinetai run` instead of bare `cabinetai run`. Users install via npx, so the bare command doesn't exist.

[2026-04-14] Fixed task completion detection stuck on "running". Two bugs: (1) after ANSI stripping the `❯` idle prompt merged onto the same line as `⏵⏵ bypass permissions on`, so the exact-match regex `/^[❯>]$/` never matched — loosened to `/^[❯>](?:\s|$)/`; (2) Claude Code's completion timing line uses many verbs beyond "Brewed" (Sautéed, Baked, Churned, Crunched, etc.) — `isClaudeIdleTailNoise` now matches any spinner-prefixed `Verb for [time]` pattern generically instead of hardcoding individual verbs.

[2026-04-14] Unified `cabinetai-plan.md` and `CABINETAI_DEPLOYMENT.md` into single `CABINETAI.md`. Synced all three package versions to 0.3.1 (app, create-cabinet, cabinetai). Published both npm packages with READMEs.

[2026-04-14] CLI: added `cabinetai uninstall` command. Default removes cached app versions from `~/.cabinet/app/`; `--all` removes the entire `~/.cabinet` directory. Cabinet data directories are never touched.

[2026-04-14] Registry API: added `?limit=N` query param (defaults to 10) so the onboarding carousel caps at 10 templates. The full registry browser passes `limit=100` to show all.

[2026-04-14] Fix sidebar labels: cabinet name in header, "Data" for content section. The top header now always prefers the .cabinet manifest name (e.g. "APPLE") over the index.md frontmatter title ("Knowledge Base"). Previously, clicking the cabinet overview caused activeCabinet to resolve to the root tree node whose frontmatter title was "Knowledge Base".

[2026-04-14] Onboarding wizard: removed directory picker from Step 7 (CLI already owns dir selection via CABINET_DATA_DIR), added .cabinet manifest detection at wizard start with a WelcomeBackStep for existing cabinets that pre-fills company name, and added "team of teams" framing subtitle to Step 2's TeamBuildStep title.

[2026-04-14] Added zoom/pan controls to Mermaid viewer: toolbar buttons for zoom in/out/reset with percentage display, Ctrl+scroll wheel zoom, and click-drag panning with grab cursor.

[2026-04-14] Fixed Mermaid viewer error handling: added `suppressErrorRendering` and `mermaid.parse()` pre-validation so syntax errors show a clean inline error message instead of mermaid injecting broken error SVGs into the DOM.

[2026-04-14] After importing a registry cabinet in onboarding Step 2, show a "Your cabinet has been created" success screen with an animated file tree (cabinet name, .agents/, .jobs/, counts) that reveals line-by-line, then a "Continue setup" button to proceed through the remaining onboarding steps instead of skipping them.

[2026-04-14] Onboarding Step 2: removed "Coming soon" blur from the team carousel, connected it to live registry templates from /api/registry, made cards clickable with an inline import dialog (POST /api/registry/import), and added a "Browse all" button that opens the full RegistryBrowser in a dialog.

[2026-04-14] Added ai-hedge-fund cabinet to data/ — a full multi-agent stock analysis system inspired by virattt/ai-hedge-fund. Includes 12 agents (Portfolio Manager, Risk Manager, 6 legendary investor personas: Buffett/Munger/Graham/Lynch/Burry/Wood, and 4 analyst agents: Fundamentals/Valuation/Sentiment/Technicals), 3 scheduled jobs, example signals.csv with live-format data for AAPL/NVDA/META, portfolio tracking, investor philosophy research pages, and risk management parameters.

[2026-04-14] Extracted scaffoldCabinet() to src/lib/storage/cabinet-scaffold.ts — unified duplicated cabinet bootstrap logic (dirs, .cabinet manifest, index.md) previously spread across onboarding/setup and cabinets/create API routes. Both routes now call the shared utility.

[2026-04-14] Fixed onboarding to comply with cabinet protocol: `POST /api/onboarding/setup` now creates the root `.cabinet` YAML manifest (schemaVersion, id, name, kind, version, description, entry), `index.md` entry point, and `.cabinet-state/` runtime directory — all three were previously missing from root cabinet initialization.

[2026-04-13] Fix job cards in ScheduleList not opening when agent lookup fails — removed agentRef guard from click handler, falls back to slug/name/emoji already on the item.

[2026-04-13] Fixed Warp Ventures OS cabinet protocol compliance: added .cabinet identity files (root + 3 child cabinets: deal-flow, portfolio, intelligence), .cabinet-state/.gitkeep in all 4 cabinets, 4 agent personas (.agents/managing-partner, analyst, portfolio-manager, deal-scout), description fields and correct ownerAgent/agentSlug assignments across all 9 job YAMLs, and quoted cron schedule strings.

[2026-04-13] Created "Warp Ventures OS" — a comprehensive VC operating system cabinet under data/vc-os. Includes 47 files across 9 modules: Intelligence Hub (daily X digest, 5 watchlist topics, live intelligence feed webapp), Events Calendar webapp, Deal Flow kanban webapp with 15 deals, Portfolio section with 5 companies each having metrics CSVs and news logs, Portfolio Dashboard webapp with Chart.js charts, Competitors section with Mermaid landscape diagram, Team profiles, LP management with commitments CSV, Finance section with IRR model/cap table/fees CSVs and Q1 report, and Programs (Fellowship + Accelerator) with cohort CSVs. Nine scheduled jobs across root/.jobs, portfolio/.jobs, intelligence/.jobs, and deal-flow/.jobs for daily briefs, portfolio health checks, deal pipeline reviews, board prep, LP updates, competitor intel, and market maps.

[2026-04-13] Moved AI edit pill to the status bar (bottom), centered via absolute positioning; shows for all KB content (MD, CSV, PDF, webapp, dirs) whenever section.type === "page". Header reverted to original simple layout.

[2026-04-13] Fix "Add cabinet data" creating pages at root instead of inside the active cabinet — button now opens the kbSubPage dialog (which uses dataRootPath) instead of the root NewPageDialog.

[2026-04-13] Fix "New Page" failing at root level — added POST handler to /api/pages/route.ts so creating a root page no longer hits a 405.

[2026-04-13] Task board inbox empty state now shows an "Add task" button instead of instructing users to click the header Add button.

[2026-04-13] Sidebar "New Page" and "New Cabinet" buttons now use text-xs, tighter gap/padding, and whitespace-nowrap to keep labels on a single line.

[2026-04-13] Constrain Jobs & heartbeats calendar to 600px height with a scrollbar. MonthView grid is now scrollable within a flex-1 overflow-y-auto wrapper; the section no longer grows to full content height.

[2026-04-13] Paper theme updated to exact warm parchment palette from runcabinet.com: background #FAF6F1, card #FFFFFF, sidebar #F3EDE4, primary/ring #8B5E3C, secondary #F5E6D3, muted #FAF2EA, foreground #3B2F2F, muted-foreground #A89888, border #E8DDD0. All values converted to OKLCh. Accent preview color updated to #8B5E3C.

[2026-04-13] Registry import: fix GitHub 403 rate-limit error on large templates (e.g. career-ops). Replaced recursive per-directory API calls with a single Git Trees API call (GET /git/trees/HEAD?recursive=1), then download files via raw.githubusercontent.com which has no API rate limit. Reduces GitHub API usage from O(directories) to 1 call per import.

[2026-04-13] Fullscreen "New Cabinet" dialog: replaced the two-step small dialog with a single fullscreen overlay (fixed inset-0 z-50, backdrop-blur-md) rendered via createPortal. All fields shown at once — cabinet name input, full agent grid picker, and "or import a pre-made team →" registry link at the bottom. AgentPicker got a layout="grid" prop so department columns wrap instead of horizontal-scroll in the fullscreen context. Fixed agents-not-appearing bug: LIBRARY_DIR in create/route.ts was pointing to the non-existent DATA_DIR/.agents/.library — corrected to PROJECT_ROOT/src/lib/agents/library where templates actually live.

[2026-04-13] Task board header cleanup: moved "Jobs & Heartbeats" schedule button to topmost right corner of the title row (flex justify-between), removed schedule toggle from filter row so it's back to original (agent filter + scope select + Refresh only). Fixed LayoutList not-defined runtime error by adding the import.

[2026-04-13] Registry browser redesign: rewrote registry-browser.tsx to faithfully match the cabinets-website design. Warm parchment palette (#FAF6F1 bg, #8B5E3C accent, #3B2F2F text) scoped to the component. List view has search + domain filter chips + list rows with stats. Detail view has warm header strip with stats, org chart (full port of cabinet-org-chart.tsx — VLine/HBranch connectors, department columns, agent/job nodes, child cabinet nodes, stats footer), agents grid, jobs list, readme prose, import CTA banner. Both scroll properly via overflow-y-auto + min-h-0 (no ScrollArea dependency).

[2026-04-13] Text Your Mom CEO heartbeat: executed marketing activation that was decided but not done earlier. Enabled all 6 marketing jobs across TikTok and Reddit cabinets (4 daily scans + 2 weekly digests). Updated team directory from 8/16 Active to 16/16 Active. Sent activation orders with specific deliverables to both marketing cabinet leads. Answered CFO's open data request on finance page (pricing $4.99/mo, burn ~$12K/mo, organic/paid split 60/40). Updated goals page with execution checkpoints for the week. Sent coordination messages to COO and CFO.

[2026-04-13] Registry browser: full cabinet registry browsing experience as a new "registry" section. Home screen has "Browse all" link next to the carousel heading. The browser has a search bar + filterable list of all 8 registry templates, and clicking one opens a detail view with header, stats, cabinet structure tree, agent cards grid, job list, readme, and two "Import Cabinet" CTAs (top bar + inline banner). Detail data fetched live from GitHub via new GET /api/registry/[slug] endpoint that parses .cabinet manifests, agents, jobs, and child cabinets. Import flow uses the same fullscreen overlay + page reload pattern.

[2026-04-13] Import UX polish: clicking Import now closes the dialog and shows a fullscreen blur overlay with spinner and progress text while downloading. On error, reopens the dialog with the error message. Added "Cabinet names can't be renamed later" warning under the name input.

[2026-04-13] Cabinet creation and registry import: Added "New Cabinet" button to sidebar (multi-step dialog with name input + agent picker), "Create Cabinet Here" right-click option in tree context menu, and replaced the "Coming soon" home screen carousel with clickable registry import cards. Created shared AgentPicker component and useAgentPicker hook extracted from onboarding wizard. New APIs: POST /api/cabinets/create (creates .cabinet + .agents/ + .jobs/ structure with selected agents from library), GET /api/registry (serves bundled manifest of 8 registry templates), POST /api/registry/import (downloads templates from GitHub hilash/cabinets repo). New files: agent-picker.tsx, use-agent-picker.ts, new-cabinet-dialog.tsx, registry-manifest.ts, github-fetch.ts, plus 3 API routes.

[2026-04-13] Pipeline Conductor first heartbeat: stood up 3 missing agent personas (conductor, evaluator, cv-tailor). Assessed pipeline state — Scanner has populated 50 roles across 14 companies (Anthropic, Stripe, Figma, Vercel, Linear, Supabase, Databricks, Airtable, Scale AI, Airbnb, dbt Labs, Brex, Resend, Clerk), all in "Discovered" status with zero evaluations. Identified critical blocker: master CV and proof points are still templates, blocking all Block B evaluations and downstream CV tailoring. Updated career-ops hub with accurate pipeline health metrics and agent roster.

[2026-04-13] Pattern Analyst heartbeat v2: produced end-of-day pattern analysis (pattern-analysis-2026-04-13-v2.md). Key finding: 0/7 recommendations from two prior reports have been executed. Funnel metrics stable (19 entries, 12 beyond Evaluated, scoring system validated). Escalated execution gap to Pipeline Conductor. Critical actions: n8n follow-up (4 days overdue), ElevenLabs apply (by Apr 15), failure/recovery STAR+R story (before Apr 16 panel). Two new discoveries assessed (Linear IC PM #18 — high priority, Cohere #19 — needs location verification).

[2026-04-13] Tasks board: clicking a conversation opens a right-side detail panel at the app-shell level (like the AI panel), not inside the board. Added `taskPanelConversation` to app-store, created `TaskDetailPanel` component rendered in the app shell layout. Running tasks show a live WebTerminal; completed/failed show ConversationResultView. X button closes the panel. The board stays fully visible underneath.

[2026-04-13] Replaced the Jobs & Heartbeats sidebar with a full-width schedule section featuring two views: (1) Calendar view (default) with day/week/month modes — a CSS Grid time grid showing jobs and heartbeats as color-coded pills positioned at their scheduled times, with current-time red line indicator, today highlighting, agent emoji markers, navigation arrows, and "Today" snap button. Month view shows a calendar grid with event badges per day cell. (2) List view — full-width responsive card grid. Both views open the same job/heartbeat edit dialogs on click. Extracted `computeNextCronRun` from persona-manager.ts into shared `cron-compute.ts` with `getScheduleEvents`, `getViewRange`, and `getAgentColor` helpers for client-side cron → event computation.

[2026-04-13] Added job and heartbeat edit dialogs to the cabinet main page SchedulesPanel. Clicking a job opens a dialog with schedule picker, prompt editor, enabled toggle, "Run now" button, and save — matching the agents workspace org chart popups. Clicking a heartbeat opens a similar dialog with schedule picker, active toggle, run, and save. Both dialogs use the same SchedulePicker component and API endpoints as the workspace.

[2026-04-13] Iterated on cabinet main page layout: moved title + description into the header bar (task-board style), put compact stats and scope depth pills in one row below (stats left, scope right), removed the Agent Status Grid section (org chart already covers agents), removed "Back to Cabinet" button. Updated cabinet task composer @ mentions to show both agents AND pages (was agents-only), with page chips and mentionedPaths sent to the API.

[2026-04-13] Redesigned the cabinet main page (CabinetView) as a mission control dashboard. Extracted 5 sub-components from the monolithic 1470-line file into separate modules (cabinet-utils.ts, cabinet-task-composer.tsx, cabinet-scheduler-controls.tsx, schedules-panel.tsx). Built 4 new components: InteractiveStatStrip (clickable metric cards with popover breakdowns), AgentStatusCard (live status cards with running/idle/paused indicators and glow animation), AgentStatusGrid (agent cards grid with integrated depth filter), and ActivityFeed (redesigned conversation list with pinned running items and emoji avatars). New layout order: stats strip, org chart (moved up as hero), composer, agent status cards, activity feed, schedules. Added cabinet-card-glow CSS animation for running agents.

[2026-04-13] Created `cabinetai` CLI package — a new npm package that serves as the primary runtime CLI for Cabinet. Architecture: app installs to `~/.cabinet/app/v{version}/` (auto-downloaded on first use), cabinets are lightweight data directories anywhere on disk. Commands: `create` (scaffold .cabinet + .agents/ + .jobs/ + index.md), `run` (ensure app installed, start Next.js + daemon pointing at cabinet dir), `doctor` (health checks), `update` (download newer app version), `import` (fetch templates from hilash/cabinets registry), `list` (discover cabinets in directory tree). Built with TypeScript + esbuild + Commander.js. Refactored `create-cabinet` to thin wrapper. Updated release pipeline (release.sh, release.yml, manifest generator, .gitignore).

[2026-04-13] Added depth dropdown to the sidebar header next to the "CABINET" label and to the agents workspace org chart navbar. Both compact Select dropdowns show Own/+1/+2/All options controlling which agents from child cabinets are visible. Reuses existing visibility infrastructure from app-store, works at both root and sub-cabinet levels, and syncs with the cabinet page depth pills.

[2026-04-13] Added right-click context menu to the Cabinet header in the sidebar. Shows: Rename (disabled with "coming soon" tooltip), Copy Relative Path (nested cabinets only), Copy Full Path, Open in Finder, and Delete (nested cabinets only, with confirmation). Root cabinet hides Rename-breaking and destructive options.

[2026-04-13] Pattern Analyst heartbeat: updated career-ops pattern analysis with recommendation adoption tracker (0/7 actioned — critical gap), pipeline update (17→19 entries, +2 discoveries, +1 location-failed), revised scorecard, and escalation tasks for Interview Strategist (failure/recovery story before Apr 16 panel) and CV Tailor (ElevenLabs application before Apr 15).

[2026-04-13] Composer hint bar: moved quick action chips below the composer on the home screen. Added grey hints below all composer cards — "use @ to mention" on the left and "Shift + Enter new line" on the right (responsive, hidden on small screens). Send button stays inside the card. Also added hints to cabinet-specific page composer (cabinet-view.tsx) and standardized its keyboard to Shift+Enter for newline.

[2026-04-13] Unified composer component: Created shared `useComposer` hook and `ComposerInput` component that replaces 4 duplicate input implementations (home screen, agent workspace panel + quick-send popup, AI panel editor chat, task board). All surfaces now support `@` mentions for both pages and agents in a single unified dropdown with grouped sections. The "Add Inbox Task" dialog was redesigned from a rigid form (title/description/priority fields) into a conversational composer. Extracted shared `flattenTree` and `makePageContextLabel` into `src/lib/tree-utils.ts`. Submit behavior is Enter to send, Shift+Enter for newline across all surfaces.

[2026-04-13] CEO operating review: surveyed all cabinets, confirmed Option A (activate marketing this week), answered CFO data questions (pricing $4.99/mo, burn ~$12K/mo, 60/40 organic/paid split), set April 26 check-in criteria, flagged COO/DevOps overlap and CEO brief/review overlap, introduced decision-deadline process fix for blockers. Updated company/operations and company/goals.

[2026-04-13] CEO weekly operating review (scheduled job): Full cross-cabinet review covering root + app-development + marketing/tiktok + marketing/reddit. Wins: DevOps sprint plan, CTO RT-4 ownership, CFO unit economics, COO financial risk tracking. Made Option A decision official for marketing activation with specific deadlines. Introduced Tuesday proof-of-life process fix. Saved to company/operations/index.md.

[2026-04-13] DevOps agent: created weekly sprint plan for week of April 14 at backlog/sprint-2026-04-14. Priorities: ship 4 small stories (OB-2, OB-5, OB-6, PC-3), start OB-1 and OB-3, run first release as a dry run of the pipeline. Updated release checklist with actionable items and staged rollout plan for the first release.

[2026-04-13] Removed legacy run-agent.sh script and its references from Electron packaging configs. The in-app agent system has superseded this manual bash loop approach.

[2026-04-13] Upgraded "What needs to get done?" create-task dialog: title is now larger (text-xl), random placeholder sentences rotate each open, DialogDescription removed, CEO agent pre-selected as default mention chip (persistent — typing doesn't clear it), "Start now" button added alongside "Add to inbox" (bypasses inbox, directly starts a conversation with the resolved agent), Cmd+Enter keyboard shortcut triggers Start now, keyboard hint bar shown beneath buttons. Extended ComposerInput with secondaryAction and onKeyDown interceptor props; extended useComposer with initialMentionedAgents that are pinned against auto-removal.

[2026-04-12] Cabinet view: moved visibility depth selector from a separate column to a subtle inline pill bar beneath stats (more grounded). Added Start All / Stop All / Restart All controls to the cabinet header bar, scoped to own-cabinet agents only (no sub-cabinets). Scheduler API now accepts optional cabinetPath to scope start-all/stop-all operations.

[2026-04-12] Task board header: moved selectors and refresh button to same row as filter chips (chips left, selectors right). Active chip color now matches its type (sky for Manual, emerald for Jobs, pink for Heartbeat) instead of generic primary.

[2026-04-12] Made BACK button icon smaller (2.5) and nudged it up to align with the center of the letter height.

[2026-04-12] Removed scope/visibility label text next to AGENTS in sidebar (e.g. "Cabinet · Include two cabinet levels") and added more spacing between CABINET header and AGENTS sub-item.

[2026-04-12] Sidebar cleanup: removed chevron from main cabinet header (always expanded, no collapse needed), made cabinet icon amber/yellow to match child cabinet icons, and toned down the BACK button (smaller text, lighter color, smaller icon).

[2026-04-12] Removed inline Job editor panel from the agent settings jobs view. The jobs list now fills the full width. Clicking a job opens the styled New Job popup (now context-aware: "Edit Job" title, Run + Delete in footer, "Save job" button when editing an existing job).

[2026-04-12] Redesigned "New Job" popup to match the "Edit Agent" dialog style exactly: two-column layout with the prompt textarea on the left (60vh tall, bg-muted/60 borderless), fields grid on the right (uppercase tracking labels, muted-fill inputs), and a proper footer with Starter Library ghost button on the left and Cancel + Create on the right.

[2026-04-12] Fixed search API recursing into embedded app/website directories. `collectPages` in `src/app/api/search/route.ts` now skips directories that have `index.html` but no `index.md`, preventing internal files like `about.md` inside a pipeline app from appearing in Cmd+K search results.

[2026-04-12] Created data/getting-started/ KB section with three pages: index (full file-type matrix + sidebar icon reference + keyboard shortcuts + features overview), apps-and-repos (embedded apps, full-screen .app mode, .repo.yaml spec), and symlinks-and-load-knowledge (Load Knowledge flow, .cabinet-meta, .repo.yaml, CABINET_DATA_DIR). Updated data/CLAUDE.md with a supported file types table covering all 13 types the tree-builder recognises. Updated data/index.md with a link to the new guide.

[2026-04-12] Cabinet page agents section: replaced individual bordered cards with a compact divider-based list. Agents are grouped by department (executive first, general last) with a muted section label row. Each row shows emoji, name, role, heartbeat pill, and active dot. The lead/CEO agent gets a small amber Crown icon inline with their name instead of a separate card.

[2026-04-12] GitHub stars counter animation in status bar: on first load, the star count animates from 0 to the real fetched value over 2 seconds using an ease-out cubic curve (requestAnimationFrame). When the counter reaches the final number, 8 gold ✦ particles burst outward in all 45° directions using CSS custom properties and a @keyframes animation. The explosion auto-hides after 900ms. Falls back to the static star count until real data arrives.

[2026-04-12] Added CabinetTaskComposer to cabinet homepage: a "What are we working on?" prompt box below the header with agent pills for all visible agents. Own-cabinet agents appear as a pill row; child-cabinet agents are grouped under their cabinet name as a labeled row below. Selecting a pill sets the target agent; Enter submits and navigates to the new conversation. Also updated buildManualConversationPrompt and the conversations POST route to accept cabinetPath so child-cabinet agent tasks run in the right cwd and store conversations in the correct cabinet.

[2026-04-12] Added RecentConversations panel to cabinet homepage: full-width card below the header showing the 20 most recent conversations across visible cabinets. Each row shows status icon (spinning/check/x), agent emoji, title, summary snippet, trigger pill (Manual/Job/Heartbeat), and relative timestamp. Running conversations show a pulsing indicator in the header. Clicking any row navigates directly to that conversation in the agent workspace. Auto-refreshes every 6 seconds.

[2026-04-12] Redesigned cabinet homepage to match the app design system: clean header with large title, description, stat pills (rounded-full bg-muted/primary tokens), and a segmented visibility scope control. Org chart uses proper rounded-xl border bg-card containers with CEO featured in a slightly elevated card, department labels as uppercase mono caps, and agent rows with emoji + role + heartbeat badge. Schedules panel follows the same card pattern with Clock/HeartPulse icon headers and rows with status badges. Removed gradient banner, icon box, kind tag, and parent name from back button.

[2026-04-12] Multi-cabinet conversation aggregation: when viewing a cabinet with "Include children" or "Include all descendants" visibility mode, the Agents Workspace now aggregates conversations from all visible cabinet directories. The conversations API accepts a `visibilityMode` query param and uses `readCabinetOverview` to discover descendant cabinet paths, then merges and sorts conversations from all of them. AgentsWorkspace passes the current visibility mode and re-fetches when it changes.

[2026-04-12] CEO agent first heartbeat for Text Your Mom example cabinet: created company/updates page with weekly priorities, added reality check to goals (50K MAU target requires marketing activation this week), added action-by-metric table to KPIs page, and linked updates section from root index. Three priorities set: ship P1 onboarding stories, activate paused marketing cabinets, and start investigating the critical reminder timing bug.

[2026-04-12] Cabinet UI interaction layer: clicking agents in the sidebar now opens AgentsWorkspace scoped to the cabinet (passes cabinetPath through section state → app-shell → AgentsWorkspace). Agent cards in the cabinet dashboard org chart are clickable. All agent API calls (persona GET, run, toggle, jobs) pass cabinetPath for cabinet-scoped resolution. JobsManager accepts cabinetPath prop.

[2026-04-11] Daemon recursive cabinet scheduling: the daemon now discovers all `.cabinet` files recursively under DATA_DIR and schedules heartbeats and jobs for every cabinet's agents. Schedule keys are cabinet-qualified (e.g., `example-text-your-mom/marketing/tiktok::heartbeat::trend-scout`) to prevent slug collisions across cabinets. Cabinet-level `.jobs/*.yaml` with `ownerAgent` are picked up alongside legacy agent-scoped jobs. The file watcher now monitors `**/.agents/*/persona.md`, `**/.jobs/*.yaml`, and `**/.cabinet` across all depths. API endpoints accept `cabinetPath` in request body so heartbeats and jobs execute in the correct cabinet scope with the right cwd.

[2026-04-11] Cleaned data directory: moved all old content (agents, jobs, missions, playbooks, chat, and content dirs) to `old-data/` at project root. Created root `.cabinet` manifest and `index.md` for the root cabinet. Renamed `data/.cabinet/` (runtime config dir) to `data/.cabinet-state/` to avoid conflict with `.cabinet` manifest file.

[2026-04-11] Onboarding provider step: redesigned to show only working providers as selectable radio cards with model selector. Users choose their default provider (Claude Code or Codex CLI) and pick a model (sonnet/opus/haiku or o3/o4-mini/gpt-4.1). Selection is saved to provider settings on launch. Non-working providers show setup guides in an expandable section.

[2026-04-11] Onboarding launch step: replaced right-side activity feed with animated agent chat preview. Agents now appear to talk to each other in a #general channel — CEO greets the team, delegates tasks to selected agents by name, and agents reply and coordinate. Messages appear one-by-one with typing indicators. Panel height reduced.

[2026-04-11] Onboarding wizard: added final "Start your Cabinet" step with summary card (company, agents, provider status) and data directory choice — "Start fresh here" uses the current dir, "Open existing cabinet" lets users pick a folder via native OS dialog. If a custom dir is chosen, it's saved via the data-dir API before launching.

[2026-04-11] Onboarding intro page: added staggered entrance animations. Elements fade in and slide up sequentially — card border appears first, then "cabinet" title, pronunciation/noun, each dictionary definition one by one, tagline lines, and finally the "Get started" button. Total sequence ~4.2s.

[2026-04-11] Onboarding wizard: limited agent selection to max 5 with CEO and Editor as mandatory (can't uncheck, show "Required" label). Unchecked agents dim and become unclickable at limit. Added counter display. Changed "How big is your team?" to a blurred "Pre-made multi-human multi-agent teams" section with "Coming soon" overlay.

[2026-04-11] Added show/hide hidden files setting in Appearance tab with checkbox and keyboard shortcut display (⌘⇧. / Ctrl+Shift+.). The toggle is persisted to localStorage and reloads the sidebar tree. Also registered the global keyboard shortcut matching macOS Finder behavior.

[2026-04-11] Added fallback viewer for unsupported file types. Files like .docx, .zip, .psd, .fig, .dmg etc. now appear in the sidebar (grayed out) and show a centered "Open in Finder" + "Download" view. Uses a whitelist approach — only common document, archive, and design file extensions are shown; everything else is silently skipped. Added `/api/system/reveal` endpoint for macOS Finder integration.

[2026-04-11] Added Storage tab to Settings with data directory picker. Users can view the current data dir path, browse for a new one, or type a path manually. The setting is persisted to `.cabinet-install.json` and read by `getManagedDataDir()` at startup (env var still takes priority). A restart banner shows when the path changes. Also updated the About tab to show the actual data dir path.

[2026-04-11] Added Mermaid diagram viewer for .mermaid and .mmd files. Renders diagrams with the mermaid library, supports source toggle, copy source, and SVG export. Follows the current Cabinet theme (dark/light). Shows error state with fallback to source view if rendering fails.

[2026-04-11] Updated documentation for direct symlinks: shortened Load Knowledge section in getting-started, updated apps-and-repos page, added new "Symlinks and Load Knowledge" guide page under getting-started, updated data/CLAUDE.md linked repos section, and added Link2 + new file type icons to the sidebar icons table.

[2026-04-11] Added source/code viewer, image viewer, and video/audio player as first-class file viewers. Code files (.js, .ts, .py, .json, .yaml, .sh, .sql, +25 more extensions) open in a dark-themed source viewer with line numbers, copy, download, wrap toggle, and raw view. Images (.png, .jpg, .gif, .webp, .svg) render centered on a dark background with download/open-in-tab. Video/audio (.mp4, .webm, .mp3, .wav) use native HTML5 players. Tree builder now classifies files by extension and shows type-specific sidebar icons. Added node_modules and other build dirs to the hidden entries filter.

[2026-04-11] Load Knowledge now creates direct symlinks (`data/my-project -> /external/path`) instead of wrapper directories with a `source` symlink inside. Metadata is stored as dotfiles (`.cabinet-meta`, `.repo.yaml`) in the target directory, while legacy `.cabinet.yaml` is still read for compatibility. Added `isLinked` flag to TreeNode for UI differentiation — linked dirs show a Link2 icon and "Unlink" instead of "Delete" in context menus. Updated linked-folder page fallback and symlink cleanup to support the new metadata file plus the legacy filename during transition.

[2026-04-11] Added "Copy Relative Path" and "Copy Full Path" options to sidebar context menus. TreeNode menu gets both options; Knowledge Base root menu gets "Copy Full Path". Full path is resolved via `/api/health` with a client-side cache.

[2026-04-11] Added expandable setup guides to the Settings > Providers tab. Each CLI provider now has a "Guide" button that reveals step-by-step installation instructions with numbered steps, terminal commands (with copy buttons), "Open terminal" button, and external links (e.g. Claude billing). Also added a "Re-check providers" button. Matches the onboarding wizard's setup guide UX.

[2026-04-11] Added agent provider health status to the status bar. The health indicator now shows amber "Degraded" when no agent providers are available. Clicking the status dot opens a popup showing App Server, Daemon, and Agent Providers sections with per-provider status (Ready / Not logged in / Not installed). Provider status is fetched once on mount and refreshed each time the popup opens, with 30s server-side caching to avoid excessive CLI spawning.

[2026-04-11] Added Codex CLI login verification to onboarding agent provider step. Health check now runs `codex login status` to detect authentication (e.g. "Logged in using ChatGPT") instead of assuming authenticated when the binary exists. Updated the Codex setup guide to use `npm i -g @openai/codex` and simplified steps to: install, login, verify.

[2026-04-11] Updated Discord invite link to new permanent invite (discord.gg/hJa5TRTbTH) across README, onboarding wizard, status bar, settings page, and agent job configs.

[2026-04-10] Redesigned onboarding step 1 from "Tell me about your project" to "Welcome to your Cabinet". Added name and role fields (role uses predefined pill buttons: CEO, Marketer, Engineer, Designer, Product, Other). Moved goals question to step 2. Step 1 now requires both name and company name to proceed.

[2026-04-10] Fixed duplicate-key crash when a standalone .md file and a same-named directory coexist (e.g. `harry-potter.md` + `harry-potter/`). Tree builder now skips the standalone file when a directory exists. Link-repo API now auto-promotes standalone .md pages to directories with index.md when loading knowledge into them. Added warning banner to Load Knowledge dialog when the target page already has sub-pages.

[2026-04-10] Removed the first-launch data directory dialog from Electron. Cabinet now silently seeds default content (getting-started, example-cabinet-carousel-factory, agent library) into the managed data dir on every launch. Also fixed the build script referencing a wrong directory name (`cabinet-example` → `example-cabinet-carousel-factory`) and added `index.md` to the seed content. Created a new "Setup and Deployment" guide page covering data directory locations, custom `CABINET_DATA_DIR`, and upgrade instructions. Rewrote all getting-started pages to remove Harry Potter references and use the Carousel Factory example instead.

[2026-04-10] Renamed "Add Symlink" to "Load Knowledge" across the UI. Redesigned the dialog: top section has folder picker and name (for everyone), collapsible "For Developers" section exposes remote URL and description fields with explanation about symlinks and .repo.yaml. API now auto-detects git repos — only creates .repo.yaml for actual repos, plain directories just get the symlink. Updated getting-started docs.

[2026-04-10] Updated server health indicator to track both servers independently — App Server (Next.js) and Daemon (agents, jobs, terminal). Shows green "Online" when both are up, amber "Degraded" when only the daemon is down, and red "Offline" when the app server is down. Popup shows per-server status with colored dots and explains which features are affected. Added `/api/health/daemon` proxy route and updated middleware to allow all health endpoints.

[2026-04-10] Made "Add Symlink" available at every level of the sidebar tree, not just the root Knowledge Base label. Added the option to tree-node.tsx context menu, added parentPath prop to LinkRepoDialog, and updated the link-repo API to support creating symlinked repos inside subdirectories.

[2026-04-10] Restored "Add Symlink" option to the Knowledge Base context menu. It was lost when the sidebar was restructured to nest KB under Cabinet (commit e011d02). Moved LinkRepoDialog and its state from sidebar.tsx into tree-view.tsx where the context menu lives.

[2026-04-10] Added all 7 sidebar icon types to the example workspace: Posts Editor (full-screen .app with carousel slide previews, placeholder images, prompts, and platform/status filters), Brand Kit (embedded website without .app — Globe icon), media-kit.pdf (PDF — FileType icon). Updated .gitignore to track the renamed example directory and agent library templates.

[2026-04-10] Replaced Harry Potter example workspace with "Cabinet Carousel Factory" — a TikTok/Instagram/LinkedIn carousel content factory for marketing Cabinet itself. Includes: index.md (HQ page with brand guide, pipeline, hook formulas, posting schedule), competitors.csv (15 KB competitors updated daily by cron), content-ideas.csv (carousel backlog), content-calendar full-screen HTML app (.app) with Cabinet website design language (warm parchment, serif display, terminal chrome), .repo.yaml linking to Cabinet repo. Created 4 new agent personas (Trend Scout, Script Writer, Image Creator, Post Optimizer) and 3 scheduled jobs (morning briefing, daily competitor scan, weekly digest). Deleted old HP-themed content and jobs.

[2026-04-10] Fixed onboarding wizard to show all 20 agent library templates during fresh start, grouped by department (Leadership, Marketing, Engineering, etc.). Previously only 2-4 agents were shown via hardcoded suggestions. Now fetches templates from /api/agents/library and uses keyword matching against company description to smart pre-check relevant agents.

[2026-04-10] Pinned domain tag and agent count to the bottom of each carousel card using flex-col with mt-auto, and set a fixed card height so the footer row aligns consistently across all cards.

[2026-04-10] Made the "cabinet" logo in the sidebar header clickable — clicking it now navigates to the home screen, matching the behavior of clicking the Cabinet section label.

[2026-04-10] Added infinite carousel of "Cabinets" at the bottom of the home screen — 50 pre-made zero-human team templates with name, description, agent count, and color-coded domain badges. Carousel auto-scrolls and pauses on hover.

[2026-04-10] Changed home screen prompt input from single-line input to textarea. Enter submits the conversation, Ctrl/Cmd+Enter inserts a new line. Added a keyboard hint (⌘ + ↵ new line) next to the send button.

[2026-04-10] Added home screen that appears when clicking "Cabinet" in the sidebar. Shows a time-based greeting with the company name, a text input for creating tasks, and quick action buttons. Submitting a prompt starts a conversation with the General agent via /api/agents/conversations and navigates directly to the conversation view. Added conversationId to SelectedSection so the agents workspace auto-selects and opens the new conversation. Default app route changed from agents to home.

[2026-04-10] Made Knowledge Base sidebar item editable. Added data/index.md as the root KB page, a root /api/pages route for parameterless access, and split the KB sidebar button so the chevron toggles expand/collapse while clicking the label opens the page in the editor.

[2026-04-10] Unified sidebar: Agents and Knowledge Base nested under collapsible "Cabinet" parent. All items now use identical TreeNode styles (13px text, gap-1.5, h-4 w-4 icons, depth-based paddingLeft indentation, same hover/active classes). KB tree nodes render at depth 2 so they align with agent child items.

[2026-04-10] Fix false "Update 0.2.6 available" shown when already on 0.2.6. Root cause: stale cabinet-release.json (0.2.4) was used as current version instead of package.json. Updated the manifest and made readBundledReleaseManifest always use package.json version as source of truth.

[2026-04-10] Added Connect section to the About settings tab with Discord link (recommended) and email (hi@runcabinet.com).

[2026-04-10] Added default White and Black themes (neutral, no accent color) to the appearance tab. Reduced blur on coming-soon overlays from 3px to 2px with higher opacity.

[2026-04-10] Notifications settings tab now shows a blurred preview with "Coming Soon" overlay, matching the integrations tab treatment.

[2026-04-10] Integrations settings tab now shows a blurred preview of the MCP servers and scheduling UI with a centered "Coming Soon" overlay card on top.

[2026-04-10] Moved About section from Providers tab into its own About tab in settings with correct version (0.2.6) and product info.

[2026-04-10] Settings page tabs now sync with the URL hash (e.g. #/settings/updates, #/settings/appearance). Browser back/forward navigates between tabs. Added min-h-0 + overflow-hidden to the ScrollArea so tab content is properly scrollable.

[2026-04-09] Fix pty.node macOS Gatekeeper warning: added xattr quarantine flag removal before ad-hoc codesigning of extracted native binaries in Electron main process.

[2026-04-09] Added `export const dynamic = "force-dynamic"` to all `/api/system/*` route handlers. Without this, Next.js could cache these routes during production builds, potentially serving stale update check results and triggering a false "update available" popup on fresh installs.

[2026-04-09] Added Apple Developer certificate import step to release workflow for proper codesigning and notarization in CI. Deduplicated getNvmNodeBin() in cabinet-daemon.ts to use the shared nvm-path.ts utility.

[2026-04-09] Cap prompt containers to max-h with vertical-only scrolling. Added "Open Transcript" button to the prompt section in conversation-result-view (matching the existing one in Artifacts). Also added anchor link on the full transcript page.

[2026-04-09] Apply markdown rendering to Prompt section on transcript page via ContentViewer. Extracted parsing logic into shared transcript-parser.ts so server components can pre-render text blocks as HTML (client hydration doesn't work on this standalone page). Both prompt and transcript text blocks now render with full prose markdown styling.

[2026-04-09] Improved transcript viewer: pre-processes embedded diff headers glued to text, detects cabinet metadata blocks (SUMMARY/CONTEXT/ARTIFACT inside fenced blocks), renders orphaned diff lines with proper green/red coloring, renders markdown links and inline code in text blocks, styles token count as a badge footer. Also added +N/-N addition/removal counts in diff file headers.

[2026-04-09] Rich transcript viewer: diff blocks show green/red for additions/removals with file headers, fenced code blocks get language labels, structured metadata lines (SUMMARY, CONTEXT, ARTIFACT, DECISION, LEARNING, GOAL_UPDATE, MESSAGE_TO) render as colored badges. Copy button added to transcript section.

[2026-04-09] Render prompt as markdown on the transcript page too, with a copy button. Server-side markdown rendering via markdownToHtml, matching the prose styling used elsewhere.

[2026-04-09] Render conversation prompt as markdown in the ConversationResultView panel instead of plain text. Uses the existing render-md API endpoint with prose styling, falling back to plain text while loading.

[2026-04-09] Unified toolbar controls across all file types. Extracted Search, Terminal, AI Panel, and Theme Picker into a shared `HeaderActions` component. CSV, PDF, and Website/App viewers now include these global controls in their toolbars, matching the markdown editor experience.

[2026-04-09] Added "Open in Finder" option to each sidebar tree item's right-click context menu. Reveals the item in Finder (macOS) or Explorer (Windows) instead of only supporting the top-level knowledge base directory.

[2026-04-09] Fixed Claude CLI not being found in Electron DMG builds. The packaged app inherits macOS GUI PATH which lacks NVM paths. Added NVM bin detection (scans ~/.nvm/versions/node/) to RUNTIME_PATH in provider-cli.ts, enrichedPath in cabinet-daemon.ts, and commandCandidates in claude-code provider.


[2026-04-10] Added send icon to each agent card in the Team Org Chart. Clicking it opens the agent's workspace with the composer focused, letting users quickly send a task to any agent directly from the org chart. Also added to the CEO card.

[2026-04-10] Replaced send-icon navigation with a quick-send popup dialog on the Org Chart. Clicking the send icon on any agent card opens a blurred-backdrop modal with the full chat composer (textarea, @mentions, keyboard shortcuts). Submitting navigates to the conversation view.

[2026-04-10] Added in-app toast notifications for agent task completion/failure. When a conversation finishes, a slide-in toast appears in the bottom-right with agent emoji, status, and title. Clicking navigates to the conversation. Uses an in-memory notification queue drained by SSE. Documented in notifications.md.

[2026-04-10] Added notification sounds for task completion/failure toasts. Uses Web Audio API to synthesize tones — ascending chime for success, descending tone for failure. No audio files needed.

[2026-04-13] COO heartbeat: posted Week of April 13 operating review at example-text-your-mom/company/operations. Added "Marketing Activated?" and "Financial Risk" columns per CFO request. Sent messages to CFO (confirming column addition), CEO (overdue items + activation checklist), and Product Manager (OB-3 resizing + OB-6 schema priority). Created concrete 5-step activation checklist for paused marketing cabinets.

[2026-04-13] Separated chevron toggle from page navigation in sidebar tree nodes — clicking the chevron now only expands/collapses, clicking the label navigates.

[2026-04-13] Agents page: moved conversations panel to the right side; added heartbeat schedule and job pills to each agent card in the org chart.

[2026-04-13] Registry detail About section now renders markdown via dangerouslySetInnerHTML using server-side unified/remark HTML conversion. Added .registry-prose CSS class with parchment-palette styles (headings, lists, code blocks, blockquotes) to globals.css.

[2026-04-13] Registry About section: strip [[wiki links]] before rendering, fix list bullets (list-style-type: disc), increase vertical spacing for readability.

[2026-04-13] Replace native window.confirm() delete prompts in sidebar with styled Dialog — triangle-alert icon in destructive/10 background, context-aware title/description for cabinet vs page vs linked dir. Updated both tree-node and tree-view cabinet delete dialogs.

[2026-04-13] White and Black themes now explicitly set font to var(--font-sans) so they use Inter rather than the browser default when data-custom-theme is active. Also optimized registry template download to use a single recursive git tree API call instead of recursive per-directory listing.

[2026-04-13] Cabinet scheduler controls: replace alarming red/green split-button with neutral muted styling; add pulsing green "Live" indicator when agents are active; unify button sizing (same height, icon size, padding).

[2026-04-13] Fix split button separation: wrap main+chevron in a shared flex container so they render as one joined control.

[2026-04-13] New Cabinet dialog: replace tiny "import a pre-made team →" text link with a full-width card button featuring icon, title, description, and arrow — separated from the create form by an "or" divider.

[2026-04-13] New Cabinet dialog: move "Import from Registry" to header top-right as a compact button next to close; remove bottom card + or-divider that made dialog too tall.

[2026-04-13] Registry browser header: add "cabinets.sh" and "Star us" (→ github.com/hilash/cabinets) link buttons in top-right. Also committed calendar overflow fix from cabinet-view/schedule-calendar.

[2026-04-13] Registry header buttons: cabinets.sh uses accentBg/accent colors; Star us uses filled accent (#8B5E3C) with white text as primary CTA.

[2026-04-13] Registry header title changed from "Cabinet Registry" to "Cabinets | AI teams, off the shelf" with the tagline in muted weight.

[2026-04-13] Editor conversations now resolve their owning cabinet by walking up the directory tree to find the nearest .cabinet manifest. Added findOwningCabinetPathForPage utility. Conversations list shows "edited: {path}" for editor agent entries.

[2026-04-13] AI Editor panel now shows optimistic "starting" sessions immediately after submit and promotes one selected live session to a visible stream area, even when work is running on another page. Added page/agent context chips, "Open Page" jump action, and background-mounted hidden terminals for non-selected sessions so streaming stays alive while the UI feels responsive.

[2026-04-13] Moved editor file-type and Cabinet-structure knowledge out of `data/getting-started` and into the canonical editor library template at `src/lib/agents/library/editor/persona.md`. New cabinet creation and onboarding now resolve agent templates from the seeded library or source fallback, enforce mandatory `ceo` + `editor`, and create full agent scaffolds including `workspace/`.

[2026-04-13] AI editor runs now use the owning cabinet's `editor` persona when editing a page inside a cabinet, fall back to the shared editor template when needed, and default their working directory to the owning cabinet instead of the global data root. Electron packaging now seeds `.agents/.library` from `src/lib/agents/library` so fresh managed data directories can install agents correctly.

[2026-04-15] Updated stale runtime docs across `README.md`, `AI-claude-editor.md`, `CLAUDE.md`, `AI_PROVIDER_RUNTIME_PROGRESS.md`, and `data/getting-started/index.md` to reflect the current adapter-based execution model. Documented that tasks/jobs/heartbeats now default to structured transcript-driven runs, listed the remaining migration work, and clarified that `WebTerminal` is being kept intentionally for interactive and future tmux-like Cabinet features.

[2026-04-16] Cathie Wood heartbeat: applied disruptive innovation lens to AAPL and META. AAPL rated bullish conviction 3 — Apple Intelligence + health platform convergence is compelling but AAPL is a platform defender, not early-stage disruptor; 5-year bull case $350. META rated bullish conviction 5 — sits at exact AI × spatial computing × social convergence ARK targets; $115-135B capex is Wright's Law in action; 5-year bull case $1,400. Both signals appended to market-analysis/signals.csv.

[2026-04-16] Image Creator heartbeat: designed 2 TikTok carousels from Script Writer briefs. Carousel 01 ("Text your mom before she sends ?", 5 slides) uses lock-screen mockup + iMessage chat bubble + giant red "?" aesthetic. Carousel 02 ("The fake mental math of reply guilt", 6 slides) uses iOS Screen Time stats card + progress bar + timer CTA aesthetic. Both saved to data/example-text-your-mom/marketing/tiktok/carousels/ and content-ideas.csv updated to "Designed" status.

[2026-04-16] Built UI prototype for new task conversation experience at /tasks/[id] (full-page route). Multi-turn chat layout with inline per-turn artifacts (file edits, commands, tool calls, KB pages), Chat/Artifacts/Diff/Logs tabs, status badge state machine (idle/running/awaiting-input/done/failed/archived), token usage bar with 80%/95% thresholds, editable rolling summary, and composer with awaiting-input visual state. Self-contained with mocked data — no backend changes yet. Components in src/components/tasks/conversation/.
[2026-04-17] Data Analyst agent: initialized empty workspace readme as first-heartbeat baseline.
[2026-04-17] Operations Manager (real-estate) first heartbeat: created transaction-pipeline/index.md with stage gates, per-deal compliance checklists, deadline tracking, and bottleneck log.
[2026-04-17] Broker (real-estate) first heartbeat: created broker-playbook.md with pricing doctrine, weekly checks, and open questions; added listings/inventory-template.md for weekly listing-agent reporting.
[2026-04-17] Image Creator heartbeat: added 5 fresh TikTok content angles to marketing/tiktok/content-ideas.csv covering missed reply guilt, mom texting patterns (novel-length texts, typing-indicator anxiety), group chat avoidance, and wholesome streak accountability. Each idea includes hook, format, and suggested post date (Apr 21–30).

[2026-04-17] Polished task conversation prototype typography and artifact styling. Conversation body now uses serif (Tailwind font-serif) at 15.5px / 1.7 line-height for a friendlier reading feel. Artifact rows: file paths split into muted directory + bold filename (no full mono path), each row is a card with bg + ring, subtle hover, slightly larger icons. Same treatment applied to the Artifacts tab list.
[2026-04-17] Fundamentals Analyst heartbeat: wrote earnings-preview rows for META (Q1 ~Apr 30), AAPL (Q2 FY26 ~May 1), NVDA (Q1 FY27 ~late May) in ai-hedge-fund/market-analysis/signals.csv. Each row lists the specific line items investor agents should watch. Scorecards unchanged from Apr 14 cycle.
[2026-04-17] Reddit Researcher job: added analytics/signals-2026-04-17.md with five emotional/behavioral patterns (reply avoidance, mom-guilt, routine decay, pre-send anxiety, fake tripwire); updated subreddits.csv notes and added r/momforme, r/internetparents to Watch; linked digest from analytics index.
[2026-04-17] Career Strategist daily scan: added 4 new EM candidates (Metabase, Mattermost, Samsara, BambooHR) to hila-finds-job/job-board/saved-jobs.csv and wrote digest-2026-04-17.md flagging EM-vs-PM positioning mismatch across target-roles, saved jobs, and contacts.
[2026-04-17] Portfolio Manager scan: appended April 17 intelligence entries to news.md for NeuralFlow, MintLayer, GreenPulse, DevForge (new file), DataStream (new file). Flagged GitHub Actions pricing hike as top signal in vc-os/index.md Intelligence Feed — directly relevant to DevForge Series A runway path.
[2026-04-17] Valuation Analyst heartbeat: wrote corrected DCF/multiples signals to ai-hedge-fund/market-analysis/signals.csv for AAPL (expensive/4, $260 vs base DCF $195 = 33% premium, PEG 3.8), NVDA (expensive/4, $850 vs base $680 = 25% premium, PEG fwd 1.6), META (fair/3, $630 vs base $565 = 12% premium, PEG 1.17). Incorporated Lynch price corrections, raised Reality Labs NPV drag to -$60/share per Munger/Burry governance argument.

[2026-04-17] Task conversation prototype: added context-aware "wrap-up" card after the latest agent turn. Appears only when status is `idle` and last turn is a settled agent reply (not pending, not awaiting-input). Offers "Mark done" + "Not yet" inline so the user doesn't have to reach back to the header. Header button now also wires to mark-done and disables once done. Send flow simulates a 1.8s settle so the wrap-up surfaces naturally after a reply.

[2026-04-17] Wrote Task Conversations PRD at data/TASK_CONVERSATIONS_PRD.md. Documents goals, status state machine, on-disk data model (tasks-as-directories with per-turn files), UI surfaces (quick-peek panel + full /tasks/[id] page), behavior specs (continuity, awaiting-input, auto-summary, token budgeting, wrap-up affordance), API surface, adapter changes for Claude Code/Codex/Gemini, phasing, success metrics, and open questions.

[2026-04-17] Phase 1 of Task Conversations: built new task-store with on-disk schema (data/{cabinet?}/.agents/.tasks/{id}/{task.md, turns/NNN-{user|agent}.md, session.json, artifacts.json, events.log}). New types in src/types/tasks.ts. Auto-status transitions: agent reply with awaitingInput → "awaiting-input"; non-zero exitCode → "failed"; clean reply → "idle"; user reply → "running". Token aggregation across turns, denormalized artifacts index rebuilt on each turn. 11 unit tests in task-store.test.ts cover create/append/update/list/delete/round-trip — all passing.

[2026-04-17] Phase 2 of Task Conversations: API endpoints under /api/tasks. GET (list, filter by status/trigger/agent/cabinet), POST (create with first user turn), GET /[id], PATCH /[id] (title/summary/status with completedAt handling), DELETE /[id], POST /[id]/turns (append user or agent turn), GET /[id]/events (SSE with 15s heartbeat). Added in-memory event bus (task-events.ts) wired into store writes for live updates. Smoke-tested end-to-end on :5354 — disk format matches PRD spec.

[2026-04-17] COO heartbeat in garden: normalized tag `poetry` → `poem` on hagrid/index.md for consistency with other garden poems.
[2026-04-17] Legal: drafted Privacy Policy at data/legal/privacy-policy/index.md covering self-hosted model, third-party AI provider data flows (Anthropic, OpenAI), GDPR/CCPA posture, and security responsibilities. Updated legal index with policy link and backlog (NDA, license, DPA, cookies).
[2026-04-17] Listing Agent heartbeat: created active-inventory.md as the live counterpart to inventory-template.md, with review queue and price-adjustment log scaffolds.
[2026-04-17] Marketing Specialist heartbeat: scaffolded marketing infrastructure — campaigns/, social-calendar/, and leads/ pages under real-estate/marketing/ with active campaign tracker, weekly posting template, and lead intake log + qualification checklist.

[2026-04-17] Interview Coach heartbeat (hila-finds-job): refocused star-stories.md from EM to Senior PM framing (role mismatch — all live applications are PM roles), and appended a Patterns from Recent Feedback section synthesizing 5 logged interviews (recurring weaknesses: long-winded answers, tech arch hesitation, rattled by surprise exercises) with a pre-answer list for seen curveball questions.

[2026-04-17] Career Strategist heartbeat: flagged critical positioning conflict in hila-finds-job (resume targets EM roles, entire 12-app pipeline is PM roles). Wrote strategy-brief-2026-04-17.md with three decision paths, pipeline conversion analysis (referrals 80% positive vs cold 0%), and blocking next action. Added warning banner to target-roles.md.

[2026-04-17] App Development PM heartbeat: ratified OB-7 A/B approach (device-ID bucketing, server-side persistence), resized OB-3 from M to L and deferred it, scoped Apr 21 sprint with named ownership gates, and wrote pm-updates/index.md. Updated backlog to reflect decisions.
[2026-04-17] Ops Manager daily lead follow-up run: created `real-estate/client-relations/leads.md` (funnel source of truth) and `real-estate/client-relations/daily-status/2026-04-17/index.md` (daily status note). Updated Client Relations index with sub-page map. Pipeline is empty — today's priority is seeding intake, not chasing follow-ups.

[2026-04-17] Phase 3 of Task Conversations: wired the /tasks/[id] page to real data. Page now takes taskId param, fetches /api/tasks/[id] on mount, subscribes to /api/tasks/[id]/events SSE, refreshes state on every event. Composer POSTs real turns; Mark done + summary edit PATCH the API. Demo route (/tasks/demo) keeps the in-memory mock + simulated agent reply for visual reference. Mock-data refactored to produce the real Task shape so artifact + turn components share types from src/types/tasks.ts. Added /tasks/new page with title + first-message form that creates a real task and redirects.

[2026-04-17] Cathie Wood heartbeat: filed CORRECTION signals for AAPL (downgraded bullish/3 → neutral/2 — price corrected from $175 to $260.48 breaks 5-year CAGR hurdle) and META (bullish/5 → bullish/4 — price corrected from $510 to $630 reduces entry asymmetry) and reaffirmed NVDA bullish/5 at ~$850. Updated signals.csv with three rows.
[2026-04-17] Warren Buffett agent issued corrections to AAPL (bullish/5 → neutral/3) and META (bullish/4 → neutral/3) signals after stale-price corrections reset valuations to .48 and .86 respectively. No margin of safety at current prices; governance concerns on META dual-class structure sharpened by Munger/Burry analyses.
[2026-04-17] Michael Burry heartbeat — appended three signals to ai-hedge-fund/market-analysis/signals.csv. Upgraded META bear conviction 3→4 into 13-day earnings catalyst (FCF <$5B = thesis confirmation). Refreshed NVDA bear at conviction 4 with new Microsoft Maia GA + Blackwell pricing pushback data. Passed on AAPL (expensive, but strong fundamentals — not a Burry setup).

[2026-04-17] Editor heartbeat: added new Luna Lovegood page to garden/ poetry collection (three poem sections: Luna herself, The Thestrals, After the War). Updated garden index to list Luna. Added cross-link from Neville to Luna.

[2026-04-17] Cathie Wood heartbeat: refined NVDA signal from bullish-5 to bullish-4 (convergence thesis intact but Wright's Law cuts both ways as Maia/TPU/Trainium scale); refreshed META bullish-5 at $630 — 5yr bull $1,400 still delivers 17.3% CAGR hurdle. Reaffirmed: drawdowns in intact-thesis platforms are buys, not sells.
[2026-04-17] DevOps reviewed bug-triage.csv: added Priority Rank, Trust Vector, and Monitoring Required columns; tightened DevOps Risk guidance with explicit ship recommendations. Created triage-decisions.md with severity rubric, ranked fix order, mermaid risk map, and open questions for CTO/PM.

[2026-04-17] Networking Scout heartbeat (hila-finds-job): Apr 17 cadence audit appended to follow-up-log — flagged contacts.csv unchanged since Apr 16 drafts, meaning nothing shipped. Narrowed to a 4-message hard-stop list (Sam/Dana/Sarah/Marcus) with closing-window rationale. Added 7-day auto-surface cadence rule and reordered networking/index priority table.

[2026-04-17] Editor heartbeat (hilas-cabinet): nudged two small PM-centric phrasings toward role-neutral / EM-inclusive language in networking/outreach-templates.md and guides/resume-optimization.md, pending resolution of the active EM-vs-PM positioning conflict flagged by the career-strategist.

[2026-04-17] Editor heartbeat (garden): added new Dobby poem page (four-stanza arc from pillowcase servitude to Shell Cottage grave), updated garden/index.md to list Luna + Dobby, and cross-linked Luna → Dobby. Garden now has 6 poem pages.

[2026-04-17] Image Creator heartbeat (example-text-your-mom): no carousel-format scripts in Script Ready queue. Updated carousels/index.md pattern library from 5 bullet-list entries to 8-pattern reference table (added Labeled Inventory, Decision Tree, Timeline) so future briefs can reference patterns by name. Flagged mockup findings from group-chat-shame/slide-2 for Script Writer to unblock research validation.

[2026-04-17] Resume Tailor heartbeat (hila-finds-job): confirmed 4 EM roles now in the job board (Metabase 9, Mattermost 8, Samsara 7, BambooHR 7) with EM-track tailoring briefs already in place for the top two. Updated master-resume.md blocker note to reflect that the EM-side tailoring is now unblocked on positioning and waiting only on previous-role and metrics fill-in; PM briefs (Figma, dbt Labs) remain parked on the positioning decision.

[2026-04-17] Copywriter heartbeat (example-text-your-mom): promoted the "reply guilt math" carousel from Designed to In Production by adding it to week-of-april-14 shooting brief as Script 3. Refined the hook from "You are not busy. You are emotionally buffering." to the caption-native "Not busy. Buffering." (original long form preserved as the Slide 3 payoff). Updated content-ideas.csv and linked the standalone brief to the shooting brief so activation week now has three pieces, not two.

[2026-04-17] Image Creator heartbeat (example-text-your-mom/marketing/tiktok): drafted the horror-movie-group-chat brief (5-slide carousel, escalating notification badge as the monster) and promoted Day 4 guilt + typing-dots briefs from Research to Script Ready after reconciling duplicate drafts from a parallel agent. Bumped typing-dots priority from Medium to High (most visually native concept in backlog), updated briefs/index.md with a Script Ready table of five carousels and a scheduled-post column, and flipped the three CSV rows in content-ideas.csv accordingly.

[2026-04-17] Copywriter heartbeat (example-text-your-mom): wrote nudge-copy-pool.md inside the smarter-reminder-timing PRD directory — 88 push-notification copy variants (22 each for parent/friend/sibling/partner) unblocking US-3 Contextual Nudge Copy. Every variant follows the banned-words list (no task/schedule/productivity/alert) and threads the "reply before the guilt spiral" engine. Added rotation rules for engineering, including the day-based suppression of {week_phrase} tokens and late-night tone preferences. Detected a parallel Day 4 carousel brief from another agent and removed my duplicate 4-slide version rather than fork the spec.

[2026-04-17] Phase 4 of Task Conversations: adapter session continuity. Patched claude-local adapter to honor ctx.sessionId — passes `--resume <id>` instead of `--no-session-persistence` when resuming. Flipped supportsSessionResume to true. Built task-runner.ts: loads task, picks adapter by providerId/adapterType, appends pending agent turn, runs adapter with resume session id (if alive) or replay prompt, updates turn with final content + tokens + exit state, persists new session handle. Wired POST /api/tasks + POST /api/tasks/[id]/turns to kick off runTaskTurn in the background after a user turn. Added 4 unit tests covering fresh run, live-session resume (only sends latest user message), replay-only adapter (full history concat), and failure handling. All 16 tests pass.

[2026-04-17] Phase 5 of Task Conversations: awaiting-input heuristic + auto-summary + token-window defaults. New task-heuristics.ts: looksLikeAwaitingInput() flags an agent reply as a clarifying question when the last non-fenced line ends with "?" and the content isn't mostly code; deriveSummary() builds a rolling 1-sentence summary from the latest settled agent turn (or first user turn as fallback), truncating to 180 chars. Wired into task-runner: after each agent turn settles we mark awaitingInput on the turn and flip task status; we also regenerate the summary unless the user edited it in the last 5 minutes. createTask now defaults runtime.contextWindow to 200k so the token bar always renders with real thresholds. 9 new heuristic tests + 3 new runner integration tests (awaiting-input detection, auto-summary, user-edit skips auto-summary). 28 tests total, all green.
