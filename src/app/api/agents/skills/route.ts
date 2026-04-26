import { spawn } from "child_process";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { readSkillCatalog } from "@/lib/agents/adapters/_shared/skills-injection";

function resolveSkillsRoot(): string {
  return path.join(process.env.HOME || os.homedir() || "/tmp", ".cabinet", "skills");
}

export async function GET(): Promise<NextResponse> {
  const catalog = readSkillCatalog();
  return NextResponse.json({
    root: resolveSkillsRoot(),
    skills: catalog,
    count: catalog.length,
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function revealCommand(targetPath: string): { command: string; args: string[] } {
  switch (process.platform) {
    case "darwin":
      return { command: "open", args: [targetPath] };
    case "win32":
      return { command: "explorer.exe", args: [targetPath] };
    default:
      return { command: "xdg-open", args: [targetPath] };
  }
}

async function reveal(targetPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const { command, args } = revealCommand(targetPath);
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

const SKILL_TEMPLATE = (name: string, slug: string) => `---
name: ${name}
slug: ${slug}
description: Short one-line description of what this skill does.
---

# ${name}

Tell the agent what this skill is for and when to use it. Keep it short
and actionable.

## When to use

- Trigger 1
- Trigger 2

## How

Step-by-step instructions, examples, or references the agent should
follow. Drop any helper scripts or reference files alongside this
\`SKILL.md\` and the agent will be able to read them.
`;

/**
 * POST /api/agents/skills
 *
 * Body shapes:
 *   - { open: true }          → ensure the skills root exists, reveal in Finder
 *   - { name: "Some Name" }   → scaffold ~/.cabinet/skills/<slug>/SKILL.md, reveal
 *
 * Audit #052: until the marketplace lands, this is the in-app guidance for
 * the otherwise shell-only skills workflow.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { open?: boolean; name?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* tolerate empty body — treat as `{ open: true }` */
  }

  const root = resolveSkillsRoot();
  await fs.mkdir(root, { recursive: true });

  if (body.name && body.name.trim()) {
    const name = body.name.trim();
    const slug = slugify(name);
    if (!slug) {
      return NextResponse.json({ error: "Name must contain at least one alphanumeric character." }, { status: 400 });
    }
    const skillDir = path.join(root, slug);
    if (existsSync(skillDir)) {
      return NextResponse.json({ error: `A skill named "${slug}" already exists.` }, { status: 409 });
    }
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), SKILL_TEMPLATE(name, slug));
    try {
      await reveal(skillDir);
    } catch {
      /* reveal is best-effort — the file is on disk regardless */
    }
    return NextResponse.json({ ok: true, slug, path: skillDir });
  }

  // Default: open the root in Finder
  try {
    await reveal(root);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to open skills folder" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, root });
}
