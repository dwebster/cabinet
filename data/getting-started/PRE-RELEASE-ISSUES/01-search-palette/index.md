---
title: "Issue #1 — Search Palette"
created: 2026-04-23T00:00:00.000Z
modified: 2026-04-23T00:00:00.000Z
tags:
  - launch
  - search
  - shipped
icon: search
order: 1
---

# Issue #1 — World-class search palette

**Status:** Shipped 2026-04-23 · **UX report refs:** #110, #111, #112, #113, #114, #117, #118, #119, #185

Replaces a broken Cmd+K dialog (hung on common queries, no scopes, no snippet context, no AI fallback) with a fast, grouped, contextual palette modelled on VS Code's global find and Obsidian's quick-switcher.

---

## What shipped

### Daemon-backed live index

- `server/search/` — new module. Builds a `flexsearch` `Document` index over every `*.md` under `/data` on daemon boot; runs entirely in the long-lived `cabinet-daemon` process so there is zero cold-start cost per query.
- **Indexed fields (weighted):** `title` (×100), `headings` (×50), `tags` (×30), `body` (×10), `path` (×5). Title-exact / title-prefix / title-contains get additional per-token boosts. Recently-modified pages get a small recency bump.
- **Incremental re-index** — `chokidar` watches the whole `/data` tree, debounced 150 ms. Adds, changes, and unlinks patch a single document in the index; no full rebuilds.
- **Agents & tasks** — separate lightweight in-memory caches (`loadAgentDocs`, `loadTaskDocs`) driven by `persona.md` files under `.agents/*/` and task JSON under `.tasks/*.json`. 3–5 s TTL keeps them fresh without hammering disk.
- **Event bus** — on every (re)index the daemon broadcasts `search:indexed` on the existing WebSocket bus so future surfaces (e.g. the sidebar) can react live.

### Next.js proxy — no more spinner of death

- `src/app/api/search/route.ts` forwards `GET /api/search?q=&scope=&limit=` to the daemon with the bearer token.
- 5 s per-query timeout.
- When the daemon is unreachable, the route returns **structured 503** with a `hint` field (`"Search is unavailable. Start the daemon: npm run dev:daemon"`) — the palette renders an actionable error state, not an infinite spinner. Directly addresses UX audit **#110**.

### 2-pane command palette

`src/components/search/search-palette.tsx` (single file; subcomponents `Row`, `Group`, `ResultList`, `DetailPane`, `PageDetail`, `AgentDetail`, `TaskDetail`).

- **Dialog**: Base-UI Dialog at `min(920px, viewport−2rem)` × `min(600px, viewport−6rem)`, centered at 15% from top.
- **Scope tabs**: `All · Pages · Agents · Tasks`, each showing live result counts.
- **Left pane (340 px)** — grouped results by kind:
  - Pages: icon · title · path · match-count chip.
  - Agents: avatar · display name · role + department.
  - Tasks: icon · title · agent + status + trigger.
- **Right pane** — detail for the selected hit:
  - **Pages**: breadcrumb (parent path) · title · full path · tag chips. Ordered list of matches, each with line number (`L12`), column, and an `<mark>`-highlighted snippet excerpt. Click a snippet to promote it; Tab cycles matches.
  - **Agents / Tasks**: metadata header + highlighted context line + "Open …" action.
- **Empty state** (query blank): recent queries + recently-opened pages, both persisted under `cabinet:search:*` in `localStorage`.
- **Zero-results state**: one-click **Ask the cabinet** button that calls the existing headless-agent endpoint and streams the answer into the right pane. Addresses UX audit **#114**.
- **Footer**: `↑↓ navigate · ↵ open · Tab next match · Esc close`, plus a persistent `⌘K anywhere` hint.
- **Service-down state**: red inline card with the daemon hint when `/api/search` returns 503.

### Global hotkey contract

`src/hooks/use-global-hotkeys.ts` is now the single document-level `keydown` listener for the whole app.

| Shortcut | Action | Scope |
|---|---|---|
| `⌘K` / `Ctrl+K` | Open palette | Anywhere, including inside the Tiptap editor |
| `/` | Open palette | When focus is idle (NOT inside `input`, `textarea`, `[contenteditable]`, `.ProseMirror`, `.xterm`, or `[data-hotkey-opaque]`) |
| `⌘S` | Save current page | Anywhere |
| `⌘\`` | Toggle terminal | Anywhere |
| `⌘⇧A` | Toggle AI panel | Anywhere |
| `⌘M` | Toggle Agents view | Anywhere |
| `⌘⇧.` | Toggle hidden files | Anywhere |
| `⌘E` | Insert link (inside editor) | Tiptap editor — rebound from `⌘K` so the palette owns `⌘K` uncontested |

The previous `KeyboardShortcuts` component and the inline `Cmd+K` handler inside the old SearchDialog are gone. One listener, one owner, one contract.

### Deleted

- `src/components/search/search-dialog.tsx`
- `src/components/shortcuts/keyboard-shortcuts.tsx`

### New files

```
server/search/
  types.ts
  index-builder.ts
  search-service.ts
  watcher.ts
  index-agents-tasks.ts
src/
  components/search/search-palette.tsx
  stores/search-store.ts
  hooks/use-global-hotkeys.ts
  lib/markdown/to-plaintext.ts
data/getting-started/PRE-RELEASE-ISSUES/
  index.md
  01-search-palette/index.md   ← you are here
```

---

## Verification

Confirmed live against the running daemon on 2026-04-23:

1. `GET /daemon/search?q=dumbledore&scope=all&limit=5` → 1 page hit in **1 ms**, `indexReady=true`.
2. `GET /daemon/search?q=cabinet` → 5 pages ranked correctly (title match first, then heading, then body) + 1 agent match, **1 ms**.
3. `GET /daemon/search?q=ceo&scope=agents` → 1 agent (ceo) with role + department metadata.
4. Created a fresh `data/getting-started/_search-watcher-test.md` containing `zzunicorntest` → palette returned the hit within ~1 s.
5. Deleted the same file → palette returned zero hits immediately after debounce.
6. `GET /api/search?q=dumbledore` through the Next.js proxy → identical payload, hitting the daemon on localhost:4100.
7. `tsc --noEmit` — clean.
8. `eslint` on every touched file — zero findings (pre-existing baseline has 198 findings across unrelated files; none of mine).

Daemon startup log on boot now includes:

```
  Search endpoint: GET http://localhost:4100/search
  Search index: 48 pages in 312 ms
```

---

## Future enhancements

Ordered roughly by impact, not timeline. Open as follow-up issues in the tracker when picked up.

### 1 · Semantic (vector) search as a second tier

Text search is great for "I remember the word." It falls over on "I remember the idea." Next tier:

- Embed every page (title + first 1 500 chars of body) with a local model (e.g. `nomic-embed-text-v1.5` via `@xenova/transformers`) or a provider-backed endpoint at index time.
- Persist vectors to `data/.cabinet-state/search-vectors.json` (or SQLite for scale).
- On query, **text search first** (fast, precise). If the user explicitly picks an `Ask semantically` chip, or text returns <3 hits, run the vector similarity pass as a second row group labelled "Related ideas."
- Cheap win: reuse the existing `headless agent` endpoint for a "rewrite my query for semantic search" step when ambiguity is high.

### 2 · "Open at match" that actually scrolls the editor

Today the palette opens the page; it does not scroll to the matching line. Tiptap doesn't expose a line → DOM-offset map for free, but `to-plaintext.ts` already emits a `lineMap`. The follow-up:

- Extend `editor-store.loadPage` with `{ path, highlightRange?: { line, length, column } }`.
- On mount, walk the rendered ProseMirror document once, find the text node that contains `context` near `line`, scroll it into view, flash a transient highlight for 1.2 s.
- Nice-to-have: a floating "3/5" chip in the editor gutter while palette-selected matches are active, with `F3` / `Shift+F3` to navigate between them.

### 3 · Search inside code blocks, frontmatter, and office docs

The current plaintext stripper drops code-fence markers but keeps code. That's correct for `.md`. Still missing:

- **Frontmatter values** — the audit shows Google-doc pages, kind selectors, etc. embed searchable state here. Index select frontmatter keys (e.g. `description`, `abstract`, `aliases`) as a separate weighted field.
- **Office docs** — `.docx` / `.pptx` / `.xlsx` are rendered by dynamic viewers but never extracted. A daemon-side worker can shell out to `pandoc` / `docx2txt` to produce searchable plaintext once per file, cached under `data/.cabinet-state/doc-text/<hash>.txt`.
- **PDFs** — `pdf.js` can extract text; run it at index time (not per query), cache the result the same way.

### 4 · Keyboard-navigable right pane

Today `↑↓` navigates the left pane and `Tab` cycles matches within the right pane for pages. A fuller two-pane model:

- First `Tab` → focus the snippet pane; `↑↓` then moves between matches; `Shift+Tab` returns to the left list.
- Roving `tabindex` with `aria-activedescendant` so screen readers read `"Result 3 of 12, page CV Albus Dumbledore, 3 matches"`.
- `Cmd+Enter` on a snippet → open page in a background tab when the tabbed-workspace lands.

### 5 · Filter operators

Already promised in the empty state hint (`Try: #tag, owner:agent, kind:task`):

- `#foo` — restrict to pages tagged `foo` (flexsearch supports `tag` fields natively).
- `kind:task` / `kind:agent` / `kind:page` — shorthand for scope tabs.
- `owner:ceo` — tasks assigned to agent `ceo`.
- `in:career-ops` — path prefix filter.
- `modified:>7d` / `modified:<2h` — recency filter.
- Free-text `-stopword` — exclusion.

Parser lives client-side (splits the query into `{ text, filters }` before calling the API). API already accepts an opaque filter bag.

### 6 · Scrollback search for tasks and terminal sessions

Terminal tasks are first-class per CLAUDE.md #9. Today we don't search their transcripts.

- Index the last `N` bytes of each task's `transcript.txt` lazily — only pages whose task is still referenced from the sidebar or pinned. Evict on archive.
- Show matches under a new "Task output" group with timestamp + agent + status, linking straight to the line in the saved transcript viewer.

### 7 · Recent + pinned pages surface upgrade

- Show last **14** opened pages (not 6) in the empty state, but visually de-emphasize older ones.
- Add a ⭐ to pin a page; pinned pages always appear first and never evict.
- Mirror this surface inside the sidebar as a "Jump to…" section so the palette isn't the only entry point.

### 8 · Palette as a command launcher (not just search)

VS Code's Cmd+Shift+P pattern:

- `>` prefix → commands (`> New page`, `> Toggle dark mode`, `> Restart daemon`).
- `@` prefix → go-to-symbol within the current page (headings).
- `#` prefix → tag browser.
- `:linenumber` suffix on a page hit → jump to line (see #2 above).

All of this slots into the current palette with zero new surfaces. Just a mode switcher on the input.

### 9 · Observability

- Log query latency + hit count per query to `data/.cabinet-state/search-metrics.ndjson` (opt-in; redacted if privacy mode is on).
- A dev-only tab in Settings shows p50 / p95 query time and top-10 zero-result queries, so we know which vocabulary the index is missing.

### 10 · Multi-cabinet scope filter

Cabinet supports linked cabinets. Today search spans everything. Add a scope chooser:

- `Scope: All cabinets ▾` chip next to the search input.
- Default to the current cabinet; `All` opt-in.
- On demand, mount additional cabinets' `/data` roots into the same index with a namespace tag for filtering. No separate process per cabinet.

### 11 · Performance at ~10 000 pages

Not urgent today (the KB is ~500 pages). Headroom items for later:

- Swap the in-memory `Map<id, record>` for a flexsearch `store:true` config so we don't keep two copies of each doc.
- Move the index into a `Worker` thread so indexing can't ever stall the daemon's HTTP loop.
- Memoize the snippet-extraction loop (query + pageId → matches) with a tiny LRU — hot queries pay for snippet scans exactly once.

### 12 · "Why this result?" popover

Tap a result → popover shows which fields matched, which tokens hit, and the computed score. Power users love it and it's two hours of work on top of the current scoring pipeline.

---

## Related

- Tracker: [Pre-Release Issues](../index.md)
- Audit: [Cabinet Pre-Release UX Audit](../../CABINET-PRE-RELEASE-REPORT/index.md) — findings §9 (#110–#119) and §14 (#185)
- Plan: `~/.claude/plans/ethereal-drifting-pike.md` (local)
