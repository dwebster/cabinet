export interface ProviderStatus {
  available: boolean;
  authenticated: boolean;
  version?: string;
  error?: string;
}

export interface CliProviderInvocation {
  command: string;
  args: string[];
  initialPrompt?: string;
  readyStrategy?: "claude";
}

export interface OneShotInvocationOptions {
  model?: string;
  effort?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  effortLevels?: ProviderEffortLevel[];
}

export interface ProviderEffortLevel {
  id: string;
  name: string;
  description?: string;
}

export interface AgentProvider {
  id: string;
  name: string;
  type: "cli" | "api";
  icon: string;
  iconAsset?: string;
  installMessage?: string;
  installSteps?: Array<{
    title: string;
    detail: string;
    command?: string;
    link?: { label: string; url: string };
  }>;
  models?: ProviderModel[];
  effortLevels?: ProviderEffortLevel[];
  detachedPromptLaunchMode?: "session" | "one-shot";

  // CLI providers
  command?: string;
  commandCandidates?: string[];
  buildArgs?(prompt: string, workdir: string): string[];
  buildOneShotInvocation?(
    prompt: string,
    workdir: string,
    opts?: OneShotInvocationOptions
  ): CliProviderInvocation;
  buildSessionInvocation?(prompt: string | undefined, workdir: string): CliProviderInvocation;

  // API providers
  apiKeyEnvVar?: string;
  runPrompt?(prompt: string, context: string): Promise<string>;

  /**
   * Optional dynamic model discovery. Providers that can list their available
   * models via a CLI command (e.g. `opencode models`) implement this hook.
   * Results are cached for 60s server-side by the models API route.
   */
  listModels?(): Promise<ProviderModel[]>;

  // Common
  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<ProviderStatus>;
}

export interface ProviderRegistry {
  providers: Map<string, AgentProvider>;
  defaultProvider: string;

  register(provider: AgentProvider): void;
  get(id: string): AgentProvider | undefined;
  getDefault(): AgentProvider | undefined;
  listAll(): AgentProvider[];
  listAvailable(): Promise<AgentProvider[]>;
}
