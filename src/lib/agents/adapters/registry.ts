import { providerRegistry } from "../provider-registry";
import { claudeCodeProvider } from "../providers/claude-code";
import { codexCliProvider } from "../providers/codex-cli";
import type {
  AdapterEnvironmentTestContext,
  AgentExecutionAdapter,
} from "./types";
import { claudeLocalAdapter } from "./claude-local";
import { codexLocalAdapter } from "./codex-local";
import { copilotLocalAdapter } from "./copilot-local";
import { cursorLocalAdapter } from "./cursor-local";
import { providerStatusToEnvironmentTest } from "./environment";
import { geminiLocalAdapter } from "./gemini-local";
import { grokLocalAdapter } from "./grok-local";
import { openCodeLocalAdapter } from "./opencode-local";
import { piLocalAdapter } from "./pi-local";

export const LEGACY_ADAPTER_BY_PROVIDER_ID: Record<string, string> = {
  "claude-code": "claude_code_legacy",
  "codex-cli": "codex_cli_legacy",
};

export const DEFAULT_ADAPTER_BY_PROVIDER_ID: Record<string, string> = {
  "claude-code": claudeLocalAdapter.type,
  "codex-cli": codexLocalAdapter.type,
  "gemini-cli": geminiLocalAdapter.type,
  "cursor-cli": cursorLocalAdapter.type,
  "opencode": openCodeLocalAdapter.type,
  "pi": piLocalAdapter.type,
  "grok-cli": grokLocalAdapter.type,
  "copilot-cli": copilotLocalAdapter.type,
};

export const LEGACY_PROVIDER_ID_BY_ADAPTER: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_ADAPTER_BY_PROVIDER_ID).map(([providerId, adapterType]) => [
    adapterType,
    providerId,
  ])
);

function buildLegacyCliAdapter(input: {
  type: string;
  name: string;
  description: string;
  providerId: string;
}): AgentExecutionAdapter {
  const provider = providerRegistry.get(input.providerId);
  if (!provider) {
    throw new Error(`Cannot build legacy adapter for missing provider: ${input.providerId}`);
  }

  return {
    type: input.type,
    name: input.name,
    description: input.description,
    providerId: input.providerId,
    executionEngine: "legacy_pty_cli",
    experimental: true,
    supportsSessionResume: provider.detachedPromptLaunchMode === "session",
    supportsDetachedRuns: true,
    models: provider.models,
    effortLevels: provider.effortLevels,
    async testEnvironment(_ctx?: AdapterEnvironmentTestContext) {
      return providerStatusToEnvironmentTest(
        input.type,
        await provider.healthCheck(),
        provider.installMessage
      );
    },
  };
}

export const legacyClaudeCodeAdapter = buildLegacyCliAdapter({
  type: "claude_code_legacy",
  name: "Claude Code (Legacy PTY)",
  description:
    "Current Cabinet daemon path using prompt injection and PTY session management. Keep as an escape hatch while the structured adapter runtime lands.",
  providerId: claudeCodeProvider.id,
});

export const legacyCodexCliAdapter = buildLegacyCliAdapter({
  type: "codex_cli_legacy",
  name: "Codex CLI (Legacy PTY)",
  description:
    "Current Cabinet detached launch path for Codex. Marked experimental while the new adapter runtime is introduced.",
  providerId: codexCliProvider.id,
});

class AgentAdapterRegistry {
  adapters = new Map<string, AgentExecutionAdapter>();
  private builtinFallbacks = new Map<string, AgentExecutionAdapter>();
  defaultAdapterType = claudeLocalAdapter.type;

  register(adapter: AgentExecutionAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  registerExternal(adapter: AgentExecutionAdapter): void {
    const existing = this.adapters.get(adapter.type);
    if (existing && !this.builtinFallbacks.has(adapter.type)) {
      this.builtinFallbacks.set(adapter.type, existing);
    }
    this.adapters.set(adapter.type, adapter);
  }

  unregisterExternal(type: string): void {
    const fallback = this.builtinFallbacks.get(type);
    this.builtinFallbacks.delete(type);
    if (fallback) {
      this.adapters.set(type, fallback);
    } else {
      this.adapters.delete(type);
    }
  }

  get(type: string): AgentExecutionAdapter | undefined {
    return this.adapters.get(type);
  }

  listAll(): AgentExecutionAdapter[] {
    return Array.from(this.adapters.values());
  }

  findByProviderId(providerId: string): AgentExecutionAdapter | undefined {
    return this.listAll().find((adapter) => adapter.providerId === providerId);
  }
}

export const agentAdapterRegistry = new AgentAdapterRegistry();

agentAdapterRegistry.register(claudeLocalAdapter);
agentAdapterRegistry.register(codexLocalAdapter);
agentAdapterRegistry.register(geminiLocalAdapter);
agentAdapterRegistry.register(cursorLocalAdapter);
agentAdapterRegistry.register(openCodeLocalAdapter);
agentAdapterRegistry.register(piLocalAdapter);
agentAdapterRegistry.register(grokLocalAdapter);
agentAdapterRegistry.register(copilotLocalAdapter);
agentAdapterRegistry.register(legacyClaudeCodeAdapter);
agentAdapterRegistry.register(legacyCodexCliAdapter);

export function defaultAdapterTypeForProvider(
  providerId?: string | null
): string {
  if (providerId && DEFAULT_ADAPTER_BY_PROVIDER_ID[providerId]) {
    return DEFAULT_ADAPTER_BY_PROVIDER_ID[providerId];
  }

  const defaultProviderId = providerRegistry.defaultProvider;
  return (
    DEFAULT_ADAPTER_BY_PROVIDER_ID[defaultProviderId] ||
    agentAdapterRegistry.defaultAdapterType
  );
}

export function resolveLegacyProviderIdForAdapterType(
  adapterType?: string | null
): string | undefined {
  if (!adapterType) return undefined;
  return LEGACY_PROVIDER_ID_BY_ADAPTER[adapterType];
}

export function isLegacyAdapterType(adapterType?: string | null): boolean {
  return Boolean(adapterType && adapterType in LEGACY_PROVIDER_ID_BY_ADAPTER);
}

export function resolveLegacyExecutionProviderId(input: {
  adapterType?: string | null;
  providerId?: string | null;
  defaultProviderId?: string;
}): string {
  const mappedProviderId = resolveLegacyProviderIdForAdapterType(input.adapterType);
  if (mappedProviderId) {
    return mappedProviderId;
  }

  if (input.adapterType) {
    throw new Error(
      `Adapter ${input.adapterType} is not supported by the legacy PTY runtime.`
    );
  }

  return (
    input.providerId ||
    input.defaultProviderId ||
    providerRegistry.defaultProvider
  );
}

export function resolveExecutionProviderId(input: {
  adapterType?: string | null;
  providerId?: string | null;
  defaultProviderId?: string;
}): string {
  return (
    resolveLegacyProviderIdForAdapterType(input.adapterType) ||
    input.providerId ||
    input.defaultProviderId ||
    providerRegistry.defaultProvider
  );
}
