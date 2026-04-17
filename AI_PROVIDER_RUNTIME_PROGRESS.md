# AI Provider Runtime Progress

Date: 2026-04-17 (updated — replaces the deleted `AI-claude-editor.md`)

This file records the provider-runtime and live-session migration work completed so far. The goal of this track is to move Cabinet away from hard-coded Claude Code / Codex terminal launching, support multiple providers through a consistent adapter layer, and keep the old CLI path available as an optional experimental fallback.

## 1. Goal

The migration is moving Cabinet toward a Paperclip-style model where:

- provider execution is abstracted behind adapter definitions
- multiple runtimes can coexist under the same conversation/job/persona model
- structured adapters can run detached sessions without relying on prompt injection through a web terminal
- legacy CLI launching remains available as a fallback, but no longer defines the main architecture

## 2. What Has Been Implemented

### 2.1 Adapter Foundation

- Added a shared adapter system under `src/lib/agents/adapters/`.
- Introduced adapter metadata such as:
  - `adapterType`
  - `adapterConfig`
  - execution engine identity
  - provider mapping
- Threaded adapter metadata through:
  - personas
  - jobs
  - conversations
  - daemon sessions

Key commits:

- `7cd6c31` - `feat: scaffold adapter foundation for agent runtime migration`
- `3e30f5a` - `feat: thread adapter metadata through daemon sessions`

### 2.2 Structured Provider Adapters

- Added structured Claude local execution:
  - `src/lib/agents/adapters/claude-local.ts`
  - `src/lib/agents/adapters/claude-stream.ts`
- Added structured Codex local execution:
  - `src/lib/agents/adapters/codex-local.ts`
  - `src/lib/agents/adapters/codex-stream.ts`
- Added structured Gemini local execution:
  - `src/lib/agents/adapters/gemini-local.ts`
  - `src/lib/agents/adapters/gemini-stream.ts`
- These adapters parse streamed JSON output into Cabinet-friendly transcript text and usage/session metadata instead of depending on raw PTY replay.
- Added focused adapter tests for structured provider runtimes, including Gemini stream-json parsing.

Key commits:

- `5aa39a5` - `feat: run claude conversations through structured adapter sessions`
- `0a9e52c` - `feat: run codex conversations through structured adapter sessions`

Additional progress on this branch:

- Registered `gemini-cli` in the provider registry.
- Added `gemini_local` as the default structured adapter for Gemini runs.
- Verified the Gemini adapter against real CLI `stream-json` output so Cabinet can translate assistant messages, tool-use events, and final usage data into native transcript updates.

### 2.3 Daemon Runtime Generalization

- Generalized the daemon so it can manage both:
  - legacy PTY sessions
  - structured adapter-backed sessions
- Structured sessions now stream output into the same conversation store used by the rest of the product.
- Conversation transcript persistence remains the canonical source for live and completed output.

Primary file:

- `server/cabinet-daemon.ts`

### 2.4 Provider and Adapter Selection in Product UI

- Exposed provider adapter metadata through the providers API.
- Added runtime-selection helpers so UI can resolve:
  - provider defaults
  - available adapters per provider
  - explicit adapter override vs inherited default
- Exposed adapter/runtime selection in:
  - agent settings
  - custom agent creation
  - job editor flows
  - mission control agent dialogs

Key commits:

- `5428af5` - `feat: expose adapter selection in agent settings`
- `1e0f1a3` - `feat: expose adapter selection in mission control dialogs`

### 2.5 Legacy Execution Preserved as Optional / Experimental

- Legacy CLI paths are still available for backwards compatibility.
- The intended direction is:
  - structured adapters become the default path
  - legacy CLI execution remains an escape hatch
  - legacy should be treated as optional / experimental, not as the core runtime model
- `WebTerminal` is also being preserved intentionally as a product capability for interactive sessions and future terminal-native features such as Cabinet-managed tmux-like workflows.
- The migration is away from **terminal-first task execution**, not away from the terminal itself.

Current default direction:

- Claude provider defaults to `claude_local`
- Codex provider defaults to `codex_local`
- Gemini provider defaults to `gemini_local`
- legacy provider execution remains available through legacy adapter entries
- Gemini currently ships only as a structured adapter; there is no legacy PTY Gemini path

### 2.6 Native Cabinet Live Session UI

- Replaced task live-session rendering that previously depended on `WebTerminal`.
- Added a native Cabinet session renderer that:
  - polls conversation detail from persisted transcript data
  - renders live transcript output using Cabinet-aware formatting
  - automatically switches into structured result view once the run finishes
- Refactored the live/result fetch logic into a shared component:
  - `src/components/agents/conversation-session-view.tsx`

Shared rendering pieces:

- `src/components/agents/conversation-live-view.tsx`
- `src/components/agents/conversation-content-viewer.tsx`
- `src/lib/agents/transcript-parser.ts`

Surfaces now using the native Cabinet live view:

- `src/components/tasks/task-detail-panel.tsx`
- `src/components/jobs/jobs-manager.tsx`
- `src/components/agents/agents-workspace.tsx`

Key commits:

- `85fa8d9` - `feat: replace task live terminal with native view`
- `2357097` - `feat: share native live conversation view`

Additional progress on this branch:

- Task live/detail sidebars now show the active runtime label when available:
  - model
  - provider
  - reasoning effort
- This makes it possible to tell at a glance which model/provider a running task is using without reopening the composer.

### 2.7 Shared Task Composer and Runtime Overrides

- Added per-task runtime overrides to manual conversation creation so task launchers can choose:
  - provider
  - adapter type
  - model
- Added a compact runtime picker with a brain icon trigger and shared provider/model selection UI to the shared task composers.
- Centralized client-side manual conversation creation in:
  - `src/lib/agents/conversation-client.ts`
- Moved the cabinet task entry point onto the shared composer stack so it now reuses:
  - `useComposer`
  - `ComposerInput`
  - `TaskRuntimePicker`
- Preserved cabinet-specific behavior while sharing the implementation:
  - `@agent` switches the assigned cabinet agent
  - `@page` still becomes a tracked page mention
- Normalized task launch behavior across the task board, home screen, agents workspace, AI panel, and status-bar/editor entry points.
- Fixed an inconsistency where task-board "Start now" launches could drop page mentions that were present in the composer.

### 2.8 Runtime Picker UX Consolidation

- Continued unifying composer/runtime selection so the same runtime picker logic is reused across task-launch surfaces wherever possible.
- Replaced the earlier nested provider/model dropdown interaction with a more direct runtime matrix:
  - provider tabs across the top
  - model rows
  - effort columns
  - radio controls only where a model actually supports that effort level
- Added a compact selected-model summary row so the current choice stays visible while keeping the picker smaller and easier to scan.
- Codex models now expose their model-specific reasoning levels in the picker, including the extended `low` / `medium` / `high` / `extra high` options where the model supports them.
- Gemini models are selectable in the same shared picker, but currently expose no effort controls because the provider metadata does not yet define supported reasoning levels.

### 2.9 Cursor, OpenCode, and Pi Providers (Paperclip-style)

- Studied the paperclip project (`/Users/mybiblepath/Development/tmp/paper/paperclip/packages/adapters/{cursor-local,opencode-local,pi-local}`) and adopted the same CLI-spawn + stream-json + session-codec pattern for three additional CLI providers.
- Added three new providers + structured adapters using the existing Cabinet adapter layout (kept consistent with `claude-local.ts` / `codex-local.ts` / `gemini-local.ts`):
  - **Cursor Agent CLI** — `providers/cursor-cli.ts`, `adapters/cursor-local.ts`, `adapters/cursor-stream.ts`. Stream-json parsing, stdin prompt, `--resume <sessionId>` with retry-on-unknown-session, `--workspace`, optional `--mode plan|ask`.
  - **OpenCode** — `providers/opencode.ts`, `adapters/opencode-local.ts`, `adapters/opencode-stream.ts`. `opencode run --format json`, `provider/model` routing, `--variant` reasoning levels (minimal/low/medium/high/xhigh/max), `--session` resume with retry-on-unknown-session, `OPENCODE_DISABLE_PROJECT_CONFIG=true` so runs don't pollute project config.
  - **Pi** — `providers/pi.ts`, `adapters/pi-local.ts`, `adapters/pi-stream.ts`. `pi --mode json -p`, `--provider/--model` split, `--thinking {off|minimal|low|medium|high|xhigh}`, file-based session resume persisted under `~/.cabinet/pi-sessions/<runId>.json`.
- Each new provider declares install steps, a fallback model list, effort levels where applicable, and a health check that surfaces install/auth state to the onboarding wizard.

### 2.10 Session Codec Groundwork

- Extended the adapter interface (`src/lib/agents/adapters/types.ts`) with an optional `AdapterSessionCodec` (`deserialize`, `serialize`, `getDisplayId`) and optional `listModels` / `listSkills` / `syncSkills` hooks.
- Each new adapter ships its own session codec today; Claude/Codex/Gemini still set `supportsSessionResume: false` until the daemon-side resume wiring lands.
- Adapter result surface already exposes `sessionParams` and `clearSession` — the structured session path in `server/cabinet-daemon.ts` will be extended in a follow-up round to persist/resume these params per conversation instead of just per-run.

### 2.11 External Adapter Plugin Loader

- New `src/lib/agents/adapters/plugin-loader.ts` mirrors paperclip's plugin-loader pattern at a smaller scope.
- Reads `~/.cabinet/adapter-plugins.json` with the shape `{ "plugins": [{ "package": "@vendor/adapter-x", "enabled": true, "path": "./optional/local/path" }] }`.
- Dynamically `import()`s each entry, pulls `createAgentAdapter()` (or `createServerAdapter()` / `default` / `adapter` exports), and registers the result via `agentAdapterRegistry.registerExternal()`.
- The registry preserves built-in fallbacks — if an external plugin overrides a built-in adapter type and is later disabled, the built-in is restored automatically via `unregisterExternal()`.
- `server/cabinet-daemon.ts` now fires `loadExternalAdapters()` on startup so external adapters are available before the first conversation is accepted.

### 2.12 Provider Branding Refresh

- `AgentProvider` gained an optional `iconAsset` field so providers self-declare their glyph path, and the providers API serializes it alongside `icon`.
- `src/components/agents/provider-glyph.tsx` now accepts an `asset` prop and extends the fallback icon map with `cursor`, `opencode`, and `pi`, all backed by new local SVG assets in `public/providers/`.

### 2.13 Provider Branding and Setup UX

- Added a shared `ProviderGlyph` component so provider identity is rendered consistently across the runtime picker and onboarding.
- Switched provider artwork to local bundled assets instead of remote image URLs:
  - `public/providers/claude.svg`
  - `public/providers/openai.png`
  - `public/providers/gemini.svg`
  - `public/providers/{cursor,opencode,pi}.svg` (new, shipped as monogram placeholders)
- This avoids `next/image` remote-host configuration issues and keeps provider icons available offline.
- Updated onboarding/provider setup to consume provider-defined install steps instead of hard-coded Claude/Codex-only instructions, which makes adding new providers less bespoke.

### 2.14 Settings Provider Guide Generalization (2026-04-17)

- The Settings → Providers surface previously consulted a hardcoded `PROVIDER_SETUP_STEPS` map with entries only for `claude-code` and `codex-cli`. Replaced that with a `buildProviderSetupSteps(provider.installSteps)` helper that prepends the shared "Open a terminal" step and then renders whatever the provider declares.
- Added `iconAsset` to the `ProviderInfo` type so future consumers can pick up the provider-declared glyph directly (the runtime picker still uses the icon-name map for now).
- Result: all six providers (Claude, Codex, Gemini, Cursor, OpenCode, Pi) render their install guide in the Settings page, the onboarding wizard, AND the provider detail flow — all driven by the same source of truth.

### 2.15 Unified Headless Verify Step (2026-04-17)

- Every provider's install guide now ends with a **"Verify setup — Confirm headless mode works"** step that runs a one-shot `Reply with exactly OK` prompt using the exact flags Cabinet's adapter invokes:
  - **Claude Code** — `claude -p 'Reply with exactly OK' --output-format text`
  - **Codex CLI** — `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Reply with exactly OK'`
  - **Gemini CLI** — `gemini -p 'Reply with exactly OK' --output-format json` (existing reference pattern)
  - **Cursor CLI** — `cursor-agent -p 'Reply with exactly OK' --output-format text --yolo`
  - **OpenCode** — `opencode run 'Reply with exactly OK'`
  - **Pi** — `pi --mode json -p 'Reply with exactly OK'`
- The verify command is intentionally identical to the adapter's own invocation so "works in the terminal" implies "will work in Cabinet".

### 2.16 Runtime Picker Layout for Six Providers (2026-04-17)

- The runtime picker dropdown is capped at 32rem; six provider tabs would overflow and get clipped by the parent `overflow-hidden`.
- Added horizontal scroll (`overflow-x-auto scrollbar-none`) on the tab row and relaxed the `TabsList` width constraint (`w-max min-w-full`) so tabs can grow beyond the container and be scrolled into view with a hidden scrollbar.
- Renamed the Cursor provider display from `"Cursor Agent CLI"` → `"Cursor CLI"` to match the `"Codex CLI"` / `"Gemini CLI"` naming pattern and keep tab widths balanced.

### 2.17 Grok CLI and Copilot CLI Providers (2026-04-17)

- **Grok CLI (`grok_local`)** — `providers/grok-cli.ts`, `adapters/grok-local.ts`. One-shot `grok -p "..."` execution, optional `--model` selector (grok-4 / grok-code-fast-1 / grok-3 / grok-3-fast), `XAI_API_KEY` (or `GROK_API_KEY`) auth detection, plain-text stdout passthrough (no stream-json format to parse yet). Install via `@vibe-kit/grok-cli`.
- **Copilot CLI (`copilot_local`)** — `providers/copilot-cli.ts`, `adapters/copilot-local.ts`. One-shot `copilot -p "..." --allow-all-tools` execution, optional `--model` passthrough (Claude Sonnet 4.5 / GPT-5 / GPT-5 Mini / Gemini 2.5 Pro via Copilot's routing), subscription-based billing. Install via `@github/copilot` and auth via `copilot auth login`.
- Both adapters:
  - Set `supportsSessionResume: false` — these CLIs don't expose a stable session-id contract yet.
  - Use plain stdout passthrough instead of a dedicated stream-json parser (forward chunks verbatim to `ctx.onLog("stdout", …)`).
  - Expose `extraArgs` in config for any user-side flag customization.
  - Ship a `"Verify setup"` install step that matches the adapter's exact invocation.
- Updated the provider registry, adapter registry, default-adapter map, `provider-glyph.tsx` icon map (added `grok` + `copilot`), and shipped monogram SVGs in `public/providers/grok.svg` + `public/providers/copilot.svg`.
- Registry test now asserts all **10 adapter types** (2 legacy + 8 structured) and the `grok-cli` / `copilot-cli` default-adapter mappings.

### 2.18 Tests

- Added stream-parsing tests for each new adapter, matching the existing `gemini-local.test.ts` pattern (fake shell script emits stream-json, adapter consumes it, assertions on output/usage/sessionId/sessionParams):
  - `src/lib/agents/adapters/cursor-local.test.ts`
  - `src/lib/agents/adapters/opencode-local.test.ts`
  - `src/lib/agents/adapters/pi-local.test.ts`
- Extended `registry.test.ts` to assert all eight adapter types (2 legacy + 6 structured — Claude, Codex, Gemini, Cursor, OpenCode, Pi) and per-provider default mappings.
- Each new test also exercises the adapter's `sessionCodec` round-trip.

## 3. Current Architecture Direction

Cabinet now has the core pieces needed for multi-provider, multi-runtime execution:

- adapter registry layer with session-codec and skills hooks
- structured provider implementations for **Claude, Codex, Gemini, Cursor, OpenCode, Pi, Grok, and Copilot**
- daemon support for structured detached sessions
- external adapter plugin loader (`~/.cabinet/adapter-plugins.json`)
- UI support for choosing runtimes per provider, model, and reasoning effort
- native transcript-based live rendering for the main conversation/task surfaces
- shared composer/runtime-selection logic instead of per-surface forks

This is the right base for adding more providers beyond Claude Code and Codex without continuing to duplicate provider-specific terminal orchestration logic.

## 4. Important Files Added or Centralized

Runtime and adapter layer:

- `src/lib/agents/adapters/` (types + registry + per-provider adapters + stream parsers)
- `src/lib/agents/adapters/plugin-loader.ts`
- `src/lib/agents/adapters/{cursor-local,opencode-local,pi-local}.ts`
- `src/lib/agents/adapters/{cursor-stream,opencode-stream,pi-stream}.ts`
- `src/lib/agents/provider-runtime.ts`
- `src/lib/agents/providers/{claude-code,codex-cli,gemini-cli,cursor-cli,opencode,pi}.ts`
- `server/cabinet-daemon.ts`

Transcript and conversation rendering:

- `src/lib/agents/transcript-parser.ts`
- `src/components/agents/conversation-content-viewer.tsx`
- `src/components/agents/conversation-live-view.tsx`
- `src/components/agents/conversation-session-view.tsx`

Selection and configuration surfaces:

- `src/components/agents/agents-workspace.tsx`
- `src/components/agents/provider-glyph.tsx`
- `src/components/composer/composer-input.tsx`
- `src/components/composer/task-runtime-picker.tsx`
- `src/components/cabinets/cabinet-task-composer.tsx`
- `src/components/jobs/jobs-manager.tsx`
- `src/components/onboarding/onboarding-wizard.tsx`
- `src/components/tasks/task-detail-panel.tsx`
- `src/components/mission-control/create-agent-dialog.tsx`
- `src/components/mission-control/edit-agent-dialog.tsx`
- `src/lib/agents/conversation-client.ts`

## 5. Remaining Follow-Up Work

The migration is not fully complete yet. Important next steps:

**Round B — adapter architecture finish-line (deferred from this round):**

- Refactor the existing flat `<provider>-local.ts` + `<provider>-stream.ts` pairs into paperclip-style module directories (`adapters/<provider>-local/{index,execute,parse,test,skills}.ts`) with a shared `_shared/` utilities folder (stream-json, cli-args, stderr-filter, session-codec, skills-injection, health-check). The current flat layout is consistent across all six providers and works today, so this is structural cleanup, not a functional gap.
- Wire the `AdapterSessionCodec` hooks through `server/cabinet-daemon.ts` so session params survive across conversations (currently they round-trip only within a single run). Persist `sessionParams` per conversation/agent under `data/` alongside existing conversation metadata.
- Wire `listSkills` / `syncSkills` through the daemon so a curated skill set is symlinked into the per-adapter skills home (`~/.claude/skills`, `~/.cursor/skills`, etc.) before `execute()`. Needs a decision on where Cabinet stores the skill catalog.
- Add an `opencode models` / `pi --list-models` dynamic-discovery `listModels()` with a 60s cache (paperclip pattern) so the runtime picker reflects each user's actual provider catalog.

**Remaining product follow-up:**

- decide surface-by-surface which experiences should be transcript-first and which should remain terminal-first
- extend the native live-session renderer to the remaining `WebTerminal`-based conversation surfaces where interactivity is not actually required, such as:
  - `src/components/agents/agent-detail.tsx`
  - `src/components/agents/agent-live-panel.tsx`
  - any non-interactive portions of `src/components/ai-panel/ai-panel.tsx`
- keep evolving `WebTerminal` as a dedicated interactive subsystem for direct CLI usage, debugging, and future tmux-like Cabinet workflows
- make the legacy runtime clearly labeled as optional / experimental in every relevant UI surface
- add integration coverage around adapter selection and structured session lifecycle (per-adapter stream-json parser tests are a good starting point for each of the three new providers)
- continue reducing any remaining assumptions that a provider must be a PTY-backed CLI
- decide how far reasoning-effort support should go per provider (Cursor currently has none, OpenCode/Pi have per-variant levels) and whether some providers should expose only model choice with no effort controls
- polish placeholder provider glyphs (`public/providers/{cursor,opencode,pi}.svg`) with official artwork where licensing allows

## 6. Commit Trail For This Migration

- `7cd6c31` - `feat: scaffold adapter foundation for agent runtime migration`
- `3e30f5a` - `feat: thread adapter metadata through daemon sessions`
- `5aa39a5` - `feat: run claude conversations through structured adapter sessions`
- `0a9e52c` - `feat: run codex conversations through structured adapter sessions`
- `5428af5` - `feat: expose adapter selection in agent settings`
- `1e0f1a3` - `feat: expose adapter selection in mission control dialogs`
- `85fa8d9` - `feat: replace task live terminal with native view`
- `2357097` - `feat: share native live conversation view`

## 7. Summary

Cabinet is no longer blocked on a terminal-first architecture for agent execution. The adapter layer, structured Claude/Codex/Gemini runtimes, daemon session generalization, shared runtime-selection UI, and native transcript-driven live views together form the first working version of a real multi-provider runtime model.

The old CLI path still exists, but the system direction is now clearly toward structured adapters as the default and legacy terminal execution as the optional fallback. The newest work on this branch pushes that direction further by making runtime choice visible in the task UI, unifying composer behavior, and proving that a third provider can be added without rebuilding the architecture around a bespoke terminal path.
