# Provider CLI Runtime

Date: 2026-04-18

Consolidated reference for Cabinet's multi-CLI provider system. Describes the adapter runtime, the eight built-in providers, shared utilities, plugin loader, session codec, in-UI verification, runtime picker, migration history, and outstanding work.

## 1. Goal

Cabinet executes agent work through interchangeable CLI providers. Each provider is a local binary the user installs and authenticates once. Cabinet spawns it headless, streams structured output into the transcript, persists session handles, and classifies failures in the UI.

Previous state: Claude + Codex hard-wired into a terminal-first execution model with heavy per-provider duplication.

Current state: eight built-in providers + a plugin loader for third-party adapters, a shared adapter interface, a reusable runtime picker driven entirely off provider metadata, and a standalone troubleshooting page that exercises every provider server API.

## 2. Built-in Providers

| Provider | Adapter type | Auth | Session resume | Effort levels | Billing |
|----------|--------------|------|----------------|---------------|---------|
| Claude Code (`claude-code`) | `claude_local` | Anthropic login / API key | ✅ (`--resume`) | none | subscription / api |
| Codex CLI (`codex-cli`) | `codex_local` | OpenAI login / API key | ✅ | low / medium / high | subscription / api |
| Gemini CLI (`gemini-cli`) | `gemini_local` | Google login / API key | ✅ | none | subscription / api |
| Cursor CLI (`cursor-cli`) | `cursor_local` | Cursor login | ✅ | none | subscription |
| OpenCode (`opencode`) | `opencode_local` | per-provider keys | ✅ | `minimal … max` via `--variant` | api (multi-provider) |
| Pi (`pi-cli`) | `pi_local` | per-provider keys | ✅ (file-based) | `off … xhigh` thinking levels | api |
| Grok CLI (`grok-cli`) | `grok_local` | xAI API key | ❌ | none | api |
| Copilot CLI (`copilot-cli`) | `copilot_local` | GitHub login | ❌ | none | subscription |

Provider metadata lives under `src/lib/agents/providers/<id>.ts` and is registered in `src/lib/agents/provider-registry.ts`. Every provider carries an `installSteps` array — the final step is always `Verify setup — Confirm headless mode works`, which the in-UI verifier runs.

## 3. Adapter Interface

`src/lib/agents/adapters/types.ts` defines `AgentExecutionAdapter`:

```ts
interface AgentExecutionAdapter {
  type: string;                 // e.g. "claude_local"
  name: string;
  providerId: string;
  executionEngine: "structured_cli" | "pty" | ...;
  supportsSessionResume: boolean;
  experimental?: boolean;

  execute(ctx: AdapterExecuteContext): Promise<AdapterExecuteResult>;
  testEnvironment?(): Promise<AdapterEnvironmentReport>;

  // Optional paperclip-style extensions
  sessionCodec?: AdapterSessionCodec;
  listModels?(): Promise<AgentAdapterModel[]>;
  listSkills?(ctx: { cwd?: string }): Promise<AdapterSkillSnapshot>;
  syncSkills?(ctx: { cwd?: string }, desired: string[]): Promise<AdapterSkillSnapshot>;
}

interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown>): Record<string, unknown> | null;
  getDisplayId?(params: Record<string, unknown>): string | null;
}
```

## 4. Shared Utilities

All adapters reuse the same building blocks (currently co-located in `src/lib/agents/adapters/`, to be extracted into `_shared/`):

- **Stream-JSON consumer** — line-by-line JSONL accumulator with typed event callbacks. Template: `claude-stream.ts` accumulator shape.
- **`runChildProcess`** — spawn wrapper used by every adapter: handles PATH (`ADAPTER_RUNTIME_PATH`), stdin piping, stdout/stderr chunking, timeouts, clean termination.
- **Stderr noise filters** — per-provider regex lists that drop CLI bootstrap chatter (OpenCode `sqlite-migration:*`, Gemini YOLO notices) so only real errors reach the user.
- **Session-codec pattern** — `{ sessionId, cwd }` shape (Cursor/Claude/Codex) or file-backed snapshot (Pi). On unknown-session error the runner retries with `clearSession: true`.
- **CLI arg builders** — effort → flag mappings (`--variant`, `--thinking`, `--reasoning-effort`) kept beside each adapter; all return arrays so call sites compose cleanly.

## 5. Plugin Loader

`src/lib/agents/adapters/plugin-loader.ts` loads third-party adapters at daemon boot:

- Config: `~/.cabinet/adapter-plugins.json`
  ```json
  { "plugins": [
    { "package": "@vendor/cabinet-adapter-x", "enabled": true },
    { "package": "./local/dir", "enabled": true, "path": "./local/dir" }
  ]}
  ```
- Dynamic `import()` + extracts `createAgentAdapter()` / `createServerAdapter()` / default / `adapter` export.
- Registers via `agentAdapterRegistry.registerExternal(adapter)`. A fallback map preserves the built-in so `unregisterExternal()` restores it when the plugin is disabled.
- `server/cabinet-daemon.ts` awaits the loader after `listen()` so the first conversation sees every registered adapter.

## 6. In-UI Verification

`src/app/api/agents/providers/[id]/verify/route.ts` exposes `POST /api/agents/providers/:id/verify`:

1. Resolves the provider's last install step with a `command`.
2. Runs it via `/bin/sh -c` with `PATH=ADAPTER_RUNTIME_PATH`, 60 s timeout, 16k char cap on stdout/stderr.
3. Classifies the result via keyword heuristics on combined stdout+stderr+spawn error:
   - `pass` — `exitCode === 0` and no error pattern matched
   - `not_installed` — ENOENT / `command not found` / `no such file`
   - `auth_required` — 401 / `not authenticated` / `missing api key` / `please log in` / `run … login`
   - `payment_required` — `payment required` / `subscription required` / `upgrade plan` / `billing required`
   - `quota_exceeded` — `quota exceeded` / `resource.*exhausted` / `rate-limit` / `too many requests`
   - `other_error` — anything else
4. Returns `{ status, failedStepTitle, command, exitCode, signal, output, stderr, durationMs, hint }`.

Consumed by:

- **Settings → Providers** (`src/components/settings/settings-page.tsx`) — per-provider verify button, status chip, failed-step highlighting, hint line.
- **Onboarding wizard** (`src/components/onboarding/onboarding-wizard.tsx`) — 4-column responsive grid sorted ready → installed-but-not-auth → not-installed, with a single install/verify drawer below the grid (not inline per card). Auto-selects the first ready provider and reuses `RuntimeSelectionBanner` above the model chips.
- **Providers Demo** (`/providers-demo`, see §6.1) — full test harness that hits every provider server API end-to-end.

Both onboarding + settings surfaces drive their install steps off `provider.installSteps` (via `buildProviderSetupSteps`) — no hardcoded per-provider content.

Unified verify command per provider (matches the adapter's exact invocation so "works in terminal" implies "works in Cabinet"):

- **Claude Code** — `claude -p 'Reply with exactly OK' --output-format text`
- **Codex CLI** — `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Reply with exactly OK'`
- **Gemini CLI** — `gemini -p 'Reply with exactly OK' --yolo`
- **Cursor CLI** — `cursor-agent -p 'Reply with exactly OK' --output-format text --yolo`
- **OpenCode** — `opencode run 'Reply with exactly OK'`
- **Pi** — `pi --mode json -p 'Reply with exactly OK'`
- **Grok CLI** — `grok -p 'Reply with exactly OK'`
- **Copilot CLI** — `copilot -p 'Reply with exactly OK' --allow-all-tools`

### 6.1 Providers Demo page

`/providers-demo` (`src/app/providers-demo/page.tsx`) is a standalone troubleshooting harness. Linked from Settings → Providers via a **Troubleshoot AI providers** button (Stethoscope icon) that opens it in a new tab. Inherits the app's theme tokens so it renders in whichever theme the user picked.

What it exercises in one view:

- `GET /api/agents/providers` — populates the provider cards + summary bar (provider count, ready count, default provider/model/effort).
- `GET /api/agents/providers/status` — separate button; renders the cached `{ available, authenticated }` mini-grid.
- `POST /api/agents/providers/:id/verify` — per-card Verify button with inline result (status pill, exit code, duration, failed-step label, hint, collapsible command + stdout + stderr).
- `POST /api/agents/headless` — per-card Send prompt button; shared prompt textarea with `{{provider}}` templating replaced against the provider's display name. Disabled when the provider isn't ready.

UX details:

- Scrolling **API call log** at the bottom records every fetch (method, URL, status, duration, timestamp) with expandable request/response JSON.
- Model + effort selectors are rendered for reference; `/api/agents/headless` currently uses each provider's default model, noted inline.
- Log cap: 100 entries (FIFO). Clear button resets.

## 7. Runtime Picker (shared component)

`src/components/composer/task-runtime-picker.tsx` exports two reusable pieces:

```tsx
export function RuntimeSelectionBanner({
  providers, value, label, trailing, className,
});

export function RuntimeMatrixPicker({
  providers,
  value: { providerId, model, effort },
  onChange,
  includeUnavailable = false,      // true for Settings, false for composer
});
```

Behavior:

- **Ready-first ordering** — `ready.push(p); unready.push(p); return [...ready, ...unready]`. `isProviderReady = enabled && available && authenticated`.
- **Unready tabs** — rendered with `opacity-50 grayscale`, `disabled` prop, a "Not ready" chip, and a hint (`describeProviderUnreadyReason`) pulled from whichever of `enabled` / `available` / `authenticated` is failing.
- **Horizontal scroll** — `overflow-x-auto scrollbar-none` + `w-max min-w-full` so 8+ tabs don't clip in a narrow column.
- **Banner** — colored `Default Model: (icon)(provider)(model)` strip tied to the provider's own `iconAsset` + theme accent; shared between composer and Settings.

Settings replaced three hand-rolled blocks (provider buttons + model grid + effort grid) with a single `<RuntimeMatrixPicker includeUnavailable />` + `<RuntimeSelectionBanner />`.

## 8. Glyphs & Icons

- Every provider declares `iconAsset: "/providers/<slug>.svg"` on its metadata.
- `src/components/agents/provider-glyph.tsx` takes an `asset` prop and falls back to a lookup map for compatibility; the hardcoded icon map was removed in favor of provider-driven lookup.
- Placeholder SVG monograms shipped for cursor / opencode / pi / grok / copilot under `public/providers/`.

## 9. Tests

- `src/lib/agents/adapters/registry.test.ts` — asserts all 10 adapter types register and the 8 provider→adapter defaults map correctly.
- `src/lib/agents/adapters/{cursor-local,opencode-local,pi-local}.test.ts` — exercise stream-parsing, effort flag mapping, stderr noise filtering, and session-codec round-trip against fake shell scripts that emit real stream-json.
- Existing Claude / Codex / Gemini adapter tests untouched (behavior-neutral refactor for them).

## 10. Files Map

```
src/lib/agents/
  provider-interface.ts                     // AgentProvider + iconAsset field
  provider-registry.ts                      // registers all 8 providers
  providers/
    claude-code.ts  codex-cli.ts  gemini-cli.ts
    cursor-cli.ts   opencode.ts   pi.ts    grok-cli.ts   copilot-cli.ts
  adapters/
    types.ts                                // adapter interface + session codec
    registry.ts                             // built-in + registerExternal fallback
    plugin-loader.ts                        // ~/.cabinet/adapter-plugins.json
    claude-local.ts + claude-stream.ts
    codex-local.ts  + codex-stream.ts
    gemini-local.ts + gemini-stream.ts
    cursor-local.ts + cursor-stream.ts
    opencode-local.ts + opencode-stream.ts
    pi-local.ts + pi-stream.ts
    grok-local.ts
    copilot-local.ts
src/app/
  api/agents/providers/route.ts             // GET list + PUT settings
  api/agents/providers/status/route.ts      // GET { available, authenticated } cache (30s)
  api/agents/providers/[id]/verify/route.ts // POST verify + classify
  api/agents/headless/route.ts              // POST one-shot prompt
  providers-demo/page.tsx                   // troubleshooting harness
src/components/
  composer/task-runtime-picker.tsx          // RuntimeMatrixPicker + Banner
  settings/settings-page.tsx                // runtime picker + Troubleshoot link
  onboarding/onboarding-wizard.tsx          // 4-col grid + verify drawer
  onboarding/home-blueprint-background.tsx  // animated floorplan on Welcome home
  agents/provider-glyph.tsx                 // asset-driven glyph
  agents/conversation-{content-viewer,live-view,session-view}.tsx
public/providers/{claude,codex,gemini,cursor,opencode,pi,grok,copilot}.svg
server/cabinet-daemon.ts                    // awaits plugin loader at boot
```

## 11. Migration History

Phased work that landed on this branch (see commit trail below):

1. **Adapter foundation** — shared adapter system under `src/lib/agents/adapters/`, threading `adapterType` / `adapterConfig` / execution engine through personas, jobs, conversations, and daemon sessions.
2. **Structured adapters for Claude / Codex / Gemini** — stream-json parsing instead of raw PTY replay; structured usage + session metadata flow into transcripts natively.
3. **Daemon runtime generalization** — `server/cabinet-daemon.ts` manages both legacy PTY and structured adapter-backed sessions, writing into the same conversation store.
4. **Provider + adapter selection UI** — providers API exposes adapter metadata; runtime-selection helpers surface defaults, available adapters, and override semantics across agent settings / creation / job editors / mission control.
5. **Legacy preservation** — legacy CLI paths kept as experimental escape hatches. `WebTerminal` retained as a product capability for interactive use.
6. **Native live-session UI** — replaced task live-rendering that previously depended on `WebTerminal`. Shared renderer across `task-detail-panel`, `jobs-manager`, `agents-workspace`.
7. **Shared task composer** — per-task runtime overrides + compact runtime picker (brain-icon trigger) unified across task board, home screen, agents workspace, AI panel, and status-bar entry points.
8. **Runtime picker consolidation** — provider tabs / model rows / effort columns matrix with a selected-model summary row.
9. **Paperclip-style adapter shape** — three new providers (Cursor / OpenCode / Pi) added using CLI-spawn + stream-json + session-codec pattern, consistent with Claude / Codex / Gemini.
10. **Session codec groundwork** — optional `AdapterSessionCodec` on the adapter interface; each new adapter ships its own codec. Per-conversation persistence is the Round B item.
11. **External adapter plugin loader** — `~/.cabinet/adapter-plugins.json`, dynamic `import()`, `registerExternal` + fallback preservation.
12. **Provider branding** — `iconAsset` field + local SVG assets for all providers; `ProviderGlyph` shared component.
13. **Settings guide generalization** — hardcoded per-provider setup map replaced with `buildProviderSetupSteps(provider.installSteps)`.
14. **Unified headless verify step** — every provider's install guide ends with the same "Reply with exactly OK" one-shot that matches the adapter's exact invocation.
15. **Runtime picker layout for 6+ providers** — horizontal scroll on tab row + relaxed width constraint; Cursor renamed to "Cursor CLI" for tab balance.
16. **Grok CLI + Copilot CLI providers** — plain-stdout passthrough (no stream-json), subscription/api billing, ship monogram SVGs + registry entries.
17. **Adapter tests** — stream-parsing + session-codec round-trip tests for Cursor / OpenCode / Pi; registry test asserts all 10 adapter types + 8 provider defaults.
18. **Onboarding redesign (2026-04-18)** — 4-col responsive card grid sorted ready-first, single install/verify drawer below the grid, `RuntimeSelectionBanner` above model chips. Fixed refetch-on-select bug (`checkProvider` deps). Welcome home step gained `HomeBlueprintBackground` — animated SVG floor plan with 8 rooms + wandering agent dots, respects `prefers-reduced-motion`.
19. **Providers Demo page (2026-04-18)** — `/providers-demo` exercises every provider server API; API call log with expandable bodies; "Troubleshoot AI providers" button added to Settings → Providers.

### Commit trail (selected)

- `7cd6c31` scaffold adapter foundation
- `3e30f5a` thread adapter metadata through daemon sessions
- `5aa39a5` run claude through structured adapter sessions
- `0a9e52c` run codex through structured adapter sessions
- `5428af5` expose adapter selection in agent settings
- `1e0f1a3` expose adapter selection in mission control dialogs
- `85fa8d9` replace task live terminal with native view
- `2357097` share native live conversation view
- `88de2b1` 5 CLI providers + in-UI verification + shared runtime picker
- `89a3cc4` animated home blueprint + redesigned provider step + study default
- `19980e0` /providers-demo page + Troubleshoot button in Settings

## 12. Next Steps

Remaining work on the multi-provider track, in priority order:

1. **Persist session codec per conversation** — wire `AdapterSessionCodec.serialize/deserialize` through `server/cabinet-daemon.ts` so resume params survive across conversations (today they round-trip only within a single run). Store `sessionParams` per conversation/agent under `data/` alongside existing metadata. Retry with `clearSession: true` on stale ids.
2. **Skills injection through the daemon** — wire `listSkills` / `syncSkills` so a curated skill set is symlinked into the per-adapter skills home (`~/.claude/skills`, `~/.cursor/skills`, etc.) before `execute()`. Requires a decision on where Cabinet stores the skill catalog.
3. **Dynamic model discovery** — implement `listModels()` for OpenCode (`opencode models`) and Pi (`pi --list-models`) with a 60 s cache so the runtime picker reflects each user's actual provider catalog.
4. **Per-provider directory refactor** — split each flat `<provider>-local.ts` + `<provider>-stream.ts` pair into `adapters/<provider>-local/{index,execute,parse,test,skills}.ts` and extract the shared helpers into `_shared/{stream-json,cli-args,stderr-filter,session-codec,skills-injection,health-check}.ts`. Structural cleanup, not a functional gap.
5. **Port remaining live surfaces to native view** — extend the transcript-based renderer to `src/components/agents/agent-detail.tsx`, `src/components/agents/agent-live-panel.tsx`, and non-interactive portions of `src/components/ai-panel/ai-panel.tsx`.
6. **Label legacy PTY adapters as experimental** — explicitly mark the legacy runtime as optional/experimental in every UI surface where it's selectable. Keep `WebTerminal` as the interactive/debug subsystem for direct CLI usage and future tmux-like workflows.
7. **Integration coverage for adapter lifecycle** — tests around adapter selection, session resume path (including stale-session retry), and the structured-session persistence wiring from step 1.
8. **Reduce "provider = PTY CLI" assumptions** — continue auditing code paths that assume a terminal-backed CLI; ensure API-only providers can slot in cleanly once we add them.
9. **Reasoning-effort policy per provider** — decide how far to push effort controls. Cursor has none, OpenCode/Pi have per-variant levels, Codex has low/medium/high, Claude/Gemini/Grok/Copilot have none. Some providers should expose model choice with no effort at all.
10. **Model-override param on `/api/agents/headless`** — currently the headless endpoint only accepts `{ providerId, prompt }`. Extend to accept optional `model` + `effort` so `/providers-demo` can test non-default models without spinning up a full conversation. Unlocks per-provider model testing in the demo.
11. **Polish placeholder glyphs** — replace the monogram SVGs for `cursor`, `opencode`, `pi`, `grok`, `copilot` with official artwork where licensing allows.

## 13. Operational Notes

- **Adding a new provider**: (1) drop metadata in `providers/<id>.ts`, (2) add an adapter in `adapters/<type>-local.ts`, (3) register both, (4) drop an SVG in `public/providers/`, (5) ensure the final install step is a `Verify setup` command that exits 0 on success. UI surfaces (composer picker, Settings, onboarding, glyph, demo) pick the provider up automatically.
- **Unready providers** stay visible in Settings (`includeUnavailable`) but are hidden in the composer picker by default. Users can always see what's available vs. installable from Settings.
- **Verify failures** surface the failing step title + hint inline — users know whether to install, authenticate, pay, or wait out a quota without reading raw stderr.
- **Debugging a provider**: open `/providers-demo` from Settings → Providers → **Troubleshoot AI providers**. Runs every provider API end-to-end with live logs.
