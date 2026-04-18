# Provider CLI Runtime

Date: 2026-04-17

Consolidated reference for Cabinet's multi-CLI provider system. Describes the adapter runtime, the eight built-in providers, shared utilities, plugin loader, session codec, and the in-UI verification surface. For the chronological migration history see `AI_PROVIDER_RUNTIME_PROGRESS.md`.

## 1. Goal

Cabinet executes agent work through interchangeable CLI providers. Each provider is a local binary the user installs and authenticates once. Cabinet spawns it headless, streams structured output into the transcript, persists session handles, and classifies failures in the UI.

Previous state: Claude + Codex + Gemini hard-wired, each one owning its own `<provider>-local.ts` + `<provider>-stream.ts` with heavy duplication.

Current state: eight built-in providers + a plugin loader for third-party adapters, a shared adapter interface, and a reusable runtime picker that is driven entirely off provider metadata.

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

All adapters reuse the same building blocks (currently co-located in `src/lib/agents/adapters/`, to be moved into `_shared/` in the Round B refactor):

- **Stream-JSON consumer** — line-by-line JSONL accumulator with typed event callbacks. Template: `claude-stream.ts` accumulator shape.
- **`runChildProcess`** — spawn wrapper used by every adapter: handles PATH (`ADAPTER_RUNTIME_PATH`), stdin piping, stdout/stderr chunking, timeouts, clean termination.
- **Stderr noise filters** — per-provider regex lists that drop CLI bootstrap chatter (e.g. OpenCode `sqlite-migration:*`, Gemini YOLO notices) so only real errors reach the user.
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

The Settings page replaced three hand-rolled blocks (provider buttons + model grid + effort grid) with a single `<RuntimeMatrixPicker includeUnavailable />` + `<RuntimeSelectionBanner />`.

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
    cursor-local.ts
    opencode-local.ts
    pi-local.ts
    grok-local.ts
    copilot-local.ts
src/app/
  api/agents/providers/route.ts             // GET list + PUT settings
  api/agents/providers/status/route.ts      // GET { available, authenticated } cache (30s)
  api/agents/providers/[id]/verify/route.ts // POST verify + classify
  api/agents/headless/route.ts              // POST one-shot prompt (used by /providers-demo)
  providers-demo/page.tsx                   // troubleshooting harness
src/components/
  composer/task-runtime-picker.tsx          // RuntimeMatrixPicker + Banner
  settings/settings-page.tsx                // uses RuntimeMatrixPicker includeUnavailable + Troubleshoot link
  onboarding/onboarding-wizard.tsx          // 4-col grid + per-provider verify + setup steps
  onboarding/home-blueprint-background.tsx  // animated floorplan on Welcome home
  agents/provider-glyph.tsx                 // asset-driven glyph
public/providers/{claude,codex,gemini,cursor,opencode,pi,grok,copilot}.svg
server/cabinet-daemon.ts                    // awaits plugin loader at boot
```

## 11. Deferred (Round B)

- Move each adapter into its own `adapters/<name>/{index,execute,parse,test,skills}.ts` directory per paperclip's shape (current flat layout works, the refactor is bookkeeping).
- Daemon wiring of session-codec persistence keyed by agent/conversation id + automatic `clearSession` retry on stale ids.
- Daemon wiring of skills injection — resolve skill set → symlink into tmpdir → pass to adapter via `--add-dir` or adapter-specific env.
- Dynamic model listing: `opencode models` / `pi --list-models` cached 60 s.
- Per-provider directory extraction of `_shared/{stream-json,cli-args,stderr-filter,session-codec,skills-injection,health-check}.ts`.

## 12. Operational Notes

- When adding a new provider: (1) drop metadata in `providers/<id>.ts`, (2) add an adapter in `adapters/<type>-local.ts`, (3) register both, (4) drop an SVG in `public/providers/`, (5) ensure the final install step is a `Verify setup` command that exits 0 on success. UI surfaces (composer picker, Settings, onboarding, glyph) pick the provider up automatically.
- Unready providers stay visible in Settings (`includeUnavailable`) but are hidden in the composer picker by default. Users can always see what's available vs. installable from Settings.
- Verify failures surface the failing step title + hint inline — users know whether to install, authenticate, pay, or wait out a quota without reading raw stderr.
