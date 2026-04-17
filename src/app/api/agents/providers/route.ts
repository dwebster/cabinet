import { NextResponse } from "next/server";
import {
  agentAdapterRegistry,
  defaultAdapterTypeForProvider,
} from "@/lib/agents/adapters";
import { providerRegistry } from "@/lib/agents/provider-registry";
import {
  getConfiguredDefaultProviderId,
  isProviderEnabled,
  readProviderSettings,
} from "@/lib/agents/provider-settings";
import {
  ProviderSettingsConflictError,
  getProviderUsage,
  updateProviderSettingsWithMigrations,
} from "@/lib/agents/provider-management";

export async function GET() {
  try {
    const providers = providerRegistry.listAll();
    const settings = await readProviderSettings();
    const usage = await getProviderUsage();

    const results = await Promise.all(
      providers.map(async (p) => {
        const status = await p.healthCheck();
        const defaultAdapterType = defaultAdapterTypeForProvider(p.id);
        const adapters = agentAdapterRegistry
          .listAll()
          .filter((adapter) => adapter.providerId === p.id)
          .sort((left, right) => {
            const leftDefault = left.type === defaultAdapterType ? 0 : 1;
            const rightDefault = right.type === defaultAdapterType ? 0 : 1;
            if (leftDefault !== rightDefault) {
              return leftDefault - rightDefault;
            }

            const leftExperimental = left.experimental ? 1 : 0;
            const rightExperimental = right.experimental ? 1 : 0;
            if (leftExperimental !== rightExperimental) {
              return leftExperimental - rightExperimental;
            }

            return left.name.localeCompare(right.name);
          })
          .map((adapter) => ({
            type: adapter.type,
            name: adapter.name,
            description: adapter.description,
            experimental: adapter.experimental,
            executionEngine: adapter.executionEngine,
            supportsDetachedRuns: adapter.supportsDetachedRuns,
            supportsSessionResume: adapter.supportsSessionResume,
          }));

        return {
          id: p.id,
          name: p.name,
          type: p.type,
          icon: p.icon,
          iconAsset: p.iconAsset,
          installMessage: p.installMessage,
          installSteps: p.installSteps,
          models: p.models || [],
          effortLevels: p.effortLevels || [],
          defaultAdapterType,
          adapters,
          enabled: isProviderEnabled(p.id, settings),
          usage: usage[p.id] || {
            agentSlugs: [],
            jobs: [],
            agentCount: 0,
            jobCount: 0,
            totalCount: 0,
          },
          ...status,
        };
      })
    );

    return NextResponse.json({
      providers: results,
      defaultProvider: getConfiguredDefaultProviderId(settings),
      defaultModel: settings.defaultModel || null,
      defaultEffort: settings.defaultEffort || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const result = await updateProviderSettingsWithMigrations({
      defaultProvider:
        typeof body.defaultProvider === "string"
          ? body.defaultProvider
          : providerRegistry.defaultProvider,
      defaultModel:
        typeof body.defaultModel === "string"
          ? body.defaultModel
          : undefined,
      defaultEffort:
        typeof body.defaultEffort === "string"
          ? body.defaultEffort
          : undefined,
      disabledProviderIds: Array.isArray(body.disabledProviderIds)
        ? body.disabledProviderIds.filter((value: unknown): value is string => typeof value === "string")
        : [],
      migrations: Array.isArray(body.migrations)
        ? body.migrations.flatMap((value: unknown) => {
            if (!value || typeof value !== "object") return [];
            const migration = value as Record<string, unknown>;
            if (
              typeof migration.fromProviderId !== "string" ||
              typeof migration.toProviderId !== "string"
            ) {
              return [];
            }
            return [{
              fromProviderId: migration.fromProviderId,
              toProviderId: migration.toProviderId,
            }];
          })
        : [],
    });

    return NextResponse.json({
      ok: true,
      settings: result.settings,
      usage: result.usage,
      migrationsApplied: result.migrationsApplied,
    });
  } catch (error) {
    if (error instanceof ProviderSettingsConflictError) {
      return NextResponse.json({
        error: error.message,
        conflicts: error.conflicts,
      }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
