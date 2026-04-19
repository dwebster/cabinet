import fs from "fs";
import os from "os";
import path from "path";

/**
 * Cabinet's skill catalog lives at `~/.cabinet/skills/<slug>/`. Each skill is
 * a directory containing a `SKILL.md` (free-form instructions the CLI reads
 * into its context) plus any scripts or reference files the skill needs.
 *
 * Per-run, the daemon symlinks each agent's selected skills into a managed
 * tmpdir and passes that dir to the adapter. Adapters that support a skills
 * contract (Claude's `--add-dir`, Cursor's equivalent, etc.) read the tmpdir
 * out of `adapterConfig.skillsDir` and pass it through; adapters that don't
 * know about skills leave the directory unreferenced and the contents are
 * invisible to the CLI — harmless no-op.
 *
 * Shape of `AdapterSkillSnapshot` (declared in `../types.ts`):
 *   { available: Array<{ slug, name, description?, path }>, selected: string[] }
 */

export interface SkillCatalogEntry {
  slug: string;
  name: string;
  description?: string;
  path: string;
}

function resolveCatalogRoot(): string {
  const home = process.env.HOME || os.homedir() || "/tmp";
  return path.join(home, ".cabinet", "skills");
}

function firstSectionLine(markdown: string): string | null {
  for (const raw of markdown.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      return trimmed.replace(/^#+\s*/, "").trim() || null;
    }
    if (trimmed.startsWith("---")) continue;
    return trimmed.slice(0, 200);
  }
  return null;
}

/**
 * Scan `~/.cabinet/skills/` and return every skill directory as a catalog
 * entry. Each entry's `name` falls back to the slug if no heading is found.
 * Silently returns `[]` when the catalog doesn't exist yet (first-run case).
 */
export function readSkillCatalog(): SkillCatalogEntry[] {
  const root = resolveCatalogRoot();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const catalog: SkillCatalogEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root, entry.name);
    const skillMdPath = path.join(dir, "SKILL.md");
    let name = entry.name;
    let description: string | undefined;
    try {
      const md = fs.readFileSync(skillMdPath, "utf-8");
      const heading = firstSectionLine(md);
      if (heading) name = heading;
      // Very small description guess: first non-heading line in the body.
      const lines = md.split("\n").map((line) => line.trim());
      const descIdx = lines.findIndex(
        (line, i) => i > 0 && line && !line.startsWith("#") && !line.startsWith("---")
      );
      if (descIdx !== -1) description = lines[descIdx].slice(0, 300);
    } catch {
      // No SKILL.md — slug is the name.
    }
    catalog.push({ slug: entry.name, name, description, path: dir });
  }
  catalog.sort((a, b) => a.slug.localeCompare(b.slug));
  return catalog;
}

function safeMkdir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Prepare a managed tmpdir for `sessionId` containing symlinks to each of
 * the agent's selected skill directories. Returns the tmpdir path so the
 * adapter can point the CLI at it (e.g. Claude `--add-dir <dir>`).
 *
 * If the selection is empty or the catalog is empty, returns `null` — the
 * caller should skip wiring `skillsDir` into adapterConfig entirely in that
 * case so the CLI spawn isn't polluted with a no-op flag.
 *
 * Idempotent: calling twice for the same sessionId reuses the same dir
 * but re-materializes the symlinks to reflect the latest selection.
 */
export function syncSkillsToTmpdir(
  sessionId: string,
  desiredSlugs: string[]
): { dir: string; resolved: SkillCatalogEntry[] } | null {
  if (!Array.isArray(desiredSlugs) || desiredSlugs.length === 0) return null;
  const catalog = readSkillCatalog();
  if (catalog.length === 0) return null;

  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const resolved: SkillCatalogEntry[] = [];
  for (const slug of desiredSlugs) {
    const entry = bySlug.get(slug);
    if (entry) resolved.push(entry);
  }
  if (resolved.length === 0) return null;

  const base = path.join(os.tmpdir(), "cabinet-skills");
  safeMkdir(base);
  const dir = path.join(base, sessionId);
  try {
    // Clean any stale contents from a previous turn so selection changes
    // take effect instead of accumulating.
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // fine
  }
  safeMkdir(dir);

  for (const entry of resolved) {
    const linkPath = path.join(dir, entry.slug);
    try {
      fs.symlinkSync(entry.path, linkPath, "dir");
    } catch (err) {
      // Symlink creation can fail on Windows without admin or if the name
      // already exists. Fall back to a shallow copy so the skill is still
      // reachable, even if it won't reflect live edits.
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
        try {
          fs.cpSync(entry.path, linkPath, { recursive: true });
        } catch {
          // Give up on this skill; CLI run continues without it.
        }
      }
    }
  }

  return { dir, resolved };
}

/**
 * Remove the tmpdir produced by `syncSkillsToTmpdir` for `sessionId`.
 * Safe to call on a nonexistent dir. Invoked by the daemon on session exit.
 */
export function cleanupSkillsTmpdir(sessionId: string): void {
  const base = path.join(os.tmpdir(), "cabinet-skills");
  const dir = path.join(base, sessionId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // already gone
  }
}
