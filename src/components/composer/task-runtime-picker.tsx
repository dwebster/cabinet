"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, BrainCircuit, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDefaultAdapterTypeForProviderInfo } from "@/lib/agents/adapter-options";
import type { ConversationRuntimeOverride } from "@/types/conversations";
import type { ProviderInfo, ProviderModel } from "@/types/agents";

export type TaskRuntimeSelection = ConversationRuntimeOverride;

interface ProvidersResponse {
  providers?: ProviderInfo[];
  defaultProvider?: string | null;
  defaultModel?: string | null;
}

function isProviderReady(provider: ProviderInfo): boolean {
  return (
    (provider.enabled ?? true) &&
    provider.available &&
    (provider.authenticated ?? true)
  );
}

function getSelectableProviders(providers: ProviderInfo[]): ProviderInfo[] {
  const enabled = providers.filter((provider) => provider.enabled ?? true);
  const ready = enabled.filter(isProviderReady);
  if (ready.length > 0) return ready;
  if (enabled.length > 0) return enabled;
  return providers;
}

function resolveSelectedProvider(
  providers: ProviderInfo[],
  providerId?: string,
  fallbackProviderId?: string | null
): ProviderInfo | undefined {
  const selectable = getSelectableProviders(providers);
  return (
    selectable.find((provider) => provider.id === providerId) ||
    selectable.find((provider) => provider.id === fallbackProviderId) ||
    selectable[0] ||
    providers.find((provider) => provider.id === providerId) ||
    providers.find((provider) => provider.id === fallbackProviderId)
  );
}

function resolveSelectedModel(
  provider: ProviderInfo | undefined,
  requestedModel?: string,
  fallbackModel?: string | null
): ProviderModel | undefined {
  const models = provider?.models || [];
  if (models.length === 0) return undefined;

  return (
    models.find((model) => model.id === requestedModel) ||
    models.find((model) => model.id === fallbackModel) ||
    models[0]
  );
}

function normalizeSelection(
  value: TaskRuntimeSelection,
  providers: ProviderInfo[],
  defaultProviderId?: string | null,
  defaultModel?: string | null
): TaskRuntimeSelection {
  const selectedProvider = resolveSelectedProvider(
    providers,
    value.providerId,
    defaultProviderId
  );
  const selectedModel = resolveSelectedModel(
    selectedProvider,
    value.model,
    selectedProvider?.id === defaultProviderId ? defaultModel : undefined
  );

  return {
    providerId: selectedProvider?.id,
    adapterType: getDefaultAdapterTypeForProviderInfo(
      providers,
      selectedProvider?.id,
      defaultProviderId
    ),
    model: selectedModel?.id,
  };
}

function sameSelection(
  left: TaskRuntimeSelection,
  right: TaskRuntimeSelection
): boolean {
  return (
    (left.providerId || "") === (right.providerId || "") &&
    (left.adapterType || "") === (right.adapterType || "") &&
    (left.model || "") === (right.model || "")
  );
}

function ProviderGlyph({
  icon,
  className,
}: {
  icon?: string;
  className?: string;
}) {
  if (icon === "sparkles") {
    return <Sparkles className={className} />;
  }
  return <Bot className={className} />;
}

export function TaskRuntimePicker({
  value,
  onChange,
  align = "start",
  className,
}: {
  value: TaskRuntimeSelection;
  onChange: (value: TaskRuntimeSelection) => void;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/agents/providers");
        if (!response.ok) return;
        const data = (await response.json()) as ProvidersResponse;
        if (cancelled) return;
        setProviders((data.providers || []) as ProviderInfo[]);
        setDefaultProviderId(
          typeof data.defaultProvider === "string" ? data.defaultProvider : null
        );
        setDefaultModel(
          typeof data.defaultModel === "string" ? data.defaultModel : null
        );
      } catch {
        if (!cancelled) {
          setProviders([]);
          setDefaultProviderId(null);
          setDefaultModel(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedValue = useMemo(
    () =>
      providers.length > 0
        ? normalizeSelection(value, providers, defaultProviderId, defaultModel)
        : value,
    [defaultModel, defaultProviderId, providers, value]
  );

  useEffect(() => {
    if (providers.length === 0) return;
    if (!sameSelection(value, normalizedValue)) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, onChange, providers.length, value]);

  const selectableProviders = useMemo(
    () => getSelectableProviders(providers),
    [providers]
  );
  const selectedProvider = useMemo(
    () =>
      resolveSelectedProvider(
        providers,
        normalizedValue.providerId,
        defaultProviderId
      ),
    [defaultProviderId, normalizedValue.providerId, providers]
  );
  const selectedModel = useMemo(
    () =>
      resolveSelectedModel(
        selectedProvider,
        normalizedValue.model,
        selectedProvider?.id === defaultProviderId ? defaultModel : undefined
      ),
    [defaultModel, defaultProviderId, normalizedValue.model, selectedProvider]
  );

  function applySelection(providerId: string, modelId?: string) {
    onChange(
      normalizeSelection(
        {
          providerId,
          model: modelId,
        },
        providers,
        defaultProviderId,
        defaultModel
      )
    );
  }

  function resetToDefault() {
    onChange(
      normalizeSelection(
        {
          providerId: defaultProviderId || undefined,
          model: defaultModel || undefined,
        },
        providers,
        defaultProviderId,
        defaultModel
      )
    );
  }

  const triggerTitle = selectedProvider
    ? `Task model: ${selectedProvider.name}${selectedModel ? ` · ${selectedModel.name}` : ""}`
    : "Task model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        aria-label={triggerTitle}
        title={triggerTitle}
        disabled={loading && providers.length === 0}
      >
        <BrainCircuit className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72 min-w-[18rem]">
        <DropdownMenuLabel>Task Model</DropdownMenuLabel>
        <div className="px-1.5 pb-2 text-[11px] text-muted-foreground">
          {selectedProvider
            ? `${selectedProvider.name}${selectedModel ? ` · ${selectedModel.name}` : ""}`
            : loading
              ? "Loading providers..."
              : "No providers available"}
        </div>
        <DropdownMenuItem onClick={resetToDefault} disabled={providers.length === 0}>
          Use app default
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {selectableProviders.length > 0 ? (
          selectableProviders.map((provider) => {
            const providerSelection = normalizeSelection(
              { providerId: provider.id },
              providers,
              defaultProviderId,
              defaultModel
            );
            const providerDefaultModel = resolveSelectedModel(
              provider,
              undefined,
              provider.id === defaultProviderId ? defaultModel : undefined
            );

            return (
              <DropdownMenuSub key={provider.id}>
                <DropdownMenuSubTrigger className="gap-2">
                  <ProviderGlyph
                    icon={provider.icon}
                    className="h-4 w-4 text-muted-foreground"
                  />
                  <span>{provider.name}</span>
                  <DropdownMenuShortcut>
                    {normalizedValue.providerId === provider.id
                      ? selectedModel?.name || "Default"
                      : providerDefaultModel?.name || "Default"}
                  </DropdownMenuShortcut>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72 min-w-[18rem]">
                  <DropdownMenuLabel>{provider.name}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() =>
                      applySelection(provider.id, providerSelection.model)
                    }
                  >
                    <span>Use provider default</span>
                    {normalizedValue.providerId === provider.id &&
                    (normalizedValue.model || "") === (providerSelection.model || "") ? (
                      <Check className="ml-auto h-4 w-4" />
                    ) : null}
                  </DropdownMenuItem>
                  {(provider.models || []).length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      {provider.models?.map((model) => (
                        <DropdownMenuItem
                          key={model.id}
                          onClick={() => applySelection(provider.id, model.id)}
                          className="items-start"
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span>{model.name}</span>
                            {model.description ? (
                              <span className="text-xs text-muted-foreground">
                                {model.description}
                              </span>
                            ) : null}
                          </div>
                          {normalizedValue.providerId === provider.id &&
                          normalizedValue.model === model.id ? (
                            <Check className="ml-2 h-4 w-4 shrink-0" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })
        ) : (
          <DropdownMenuItem disabled>
            No providers available
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
