import { NextResponse } from "next/server";
import os from "os";
import path from "path";
import { readSkillCatalog } from "@/lib/agents/adapters/_shared/skills-injection";

export async function GET(): Promise<NextResponse> {
  const catalog = readSkillCatalog();
  const root = path.join(process.env.HOME || os.homedir() || "/tmp", ".cabinet", "skills");
  return NextResponse.json({
    root,
    skills: catalog,
    count: catalog.length,
  });
}
