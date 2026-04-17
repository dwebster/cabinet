import type { AgentProvider, ProviderRegistry } from "./provider-interface";
import { claudeCodeProvider } from "./providers/claude-code";
import { codexCliProvider } from "./providers/codex-cli";
import { copilotCliProvider } from "./providers/copilot-cli";
import { cursorCliProvider } from "./providers/cursor-cli";
import { geminiCliProvider } from "./providers/gemini-cli";
import { grokCliProvider } from "./providers/grok-cli";
import { openCodeProvider } from "./providers/opencode";
import { piProvider } from "./providers/pi";

class ProviderRegistryImpl implements ProviderRegistry {
  providers = new Map<string, AgentProvider>();
  defaultProvider = "claude-code";

  register(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AgentProvider | undefined {
    return this.providers.get(id);
  }

  getDefault(): AgentProvider | undefined {
    return this.providers.get(this.defaultProvider);
  }

  listAll(): AgentProvider[] {
    return Array.from(this.providers.values());
  }

  async listAvailable(): Promise<AgentProvider[]> {
    const results: AgentProvider[] = [];
    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) {
        results.push(provider);
      }
    }
    return results;
  }
}

// Singleton registry
export const providerRegistry = new ProviderRegistryImpl();

// Register built-in providers
providerRegistry.register(claudeCodeProvider);
providerRegistry.register(codexCliProvider);
providerRegistry.register(geminiCliProvider);
providerRegistry.register(cursorCliProvider);
providerRegistry.register(openCodeProvider);
providerRegistry.register(piProvider);
providerRegistry.register(grokCliProvider);
providerRegistry.register(copilotCliProvider);

// Future providers will be registered here:
// providerRegistry.register(anthropicApiProvider);
