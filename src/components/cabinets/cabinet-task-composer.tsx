"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { createConversation } from "@/lib/agents/conversation-client";
import { flattenTree } from "@/lib/tree-utils";
import { useTreeStore } from "@/stores/tree-store";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { getGreeting } from "./cabinet-utils";

export function CabinetTaskComposer({
  cabinetPath,
  agents,
  displayName,
  cabinetName,
  cabinetDescription,
  requestedAgent,
  focusRequest,
  onNavigate,
}: {
  cabinetPath: string;
  agents: CabinetAgentSummary[];
  displayName: string;
  cabinetName?: string;
  cabinetDescription?: string;
  requestedAgent?: CabinetAgentSummary | null;
  focusRequest?: number;
  onNavigate: (agentSlug: string, agentCabinetPath: string, conversationId: string) => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState<CabinetAgentSummary | null>(null);
  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const treeNodes = useTreeStore((state) => state.nodes);
  const pages = useMemo(() => flattenTree(treeNodes), [treeNodes]);

  useEffect(() => {
    if (agents.length === 0 || selectedAgent) return;
    const firstAgent =
      agents.find((agent) => agent.cabinetDepth === 0 && agent.active) ||
      agents.find((agent) => agent.active) ||
      agents[0];
    setSelectedAgent(firstAgent);
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (!requestedAgent) return;
    setSelectedAgent(requestedAgent);
  }, [requestedAgent]);

  const greeting = getGreeting();
  const activeAgents = agents.filter((agent) => agent.active);
  const assignableAgents = activeAgents.length > 0 ? activeAgents : agents;

  const mentionItems = useMemo<MentionableItem[]>(
    () => [
      ...assignableAgents.map((agent) => ({
        type: "agent" as const,
        id: agent.scopedId,
        label: agent.name,
        sublabel: agent.inherited ? `${agent.role} · ${agent.cabinetName}` : agent.role,
        icon: agent.emoji,
      })),
      ...pages.map((page) => ({
        type: "page" as const,
        id: page.path,
        label: page.title,
        sublabel: page.path,
      })),
    ],
    [assignableAgents, pages]
  );

  const composer = useComposer({
    items: mentionItems,
    disabled: !selectedAgent,
    getMentionInsertBehavior: (item) => {
      if (item.type !== "agent") return;
      const nextAgent =
        assignableAgents.find((agent) => agent.scopedId === item.id) || null;
      if (nextAgent) {
        setSelectedAgent(nextAgent);
      }
      return {
        replaceText: "",
        trackMention: false,
      };
    },
    onSubmit: async ({ message, mentionedPaths }) => {
      if (!selectedAgent) return;
      const agentCabinetPath = selectedAgent.cabinetPath || cabinetPath;
      const data = await createConversation({
        agentSlug: selectedAgent.slug,
        userMessage: message,
        mentionedPaths,
        cabinetPath: agentCabinetPath,
        ...taskRuntime,
      });
      onNavigate(selectedAgent.slug, agentCabinetPath, data.conversation.id);
    },
  });

  useEffect(() => {
    if (!focusRequest) return;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      composer.textareaRef.current?.focus();
    }, 120);
  }, [composer.textareaRef, focusRequest]);

  const placeholder = selectedAgent
    ? `What should ${selectedAgent.name} work on?`
    : "Choose an agent and describe the next task.";

  const selectedAgentMeta = selectedAgent
    ? selectedAgent.inherited
      ? `${selectedAgent.role} · ${selectedAgent.cabinetName}`
      : selectedAgent.role
    : null;

  return (
    <div ref={rootRef} className="space-y-5">
      <div className="space-y-2">
        {cabinetName ? (
          <>
            <h1 className="font-body-serif text-[2.2rem] leading-none tracking-tight text-foreground">
              {cabinetName}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {cabinetDescription || `${greeting}, ${displayName}. What are we working on today?`}
            </p>
          </>
        ) : (
          <h1 className="font-body-serif text-[1.45rem] leading-tight tracking-tight text-foreground sm:text-[1.85rem]">
            {greeting}, {displayName}. What are we working on today?
          </h1>
        )}
      </div>

      <ComposerInput
        composer={composer}
        placeholder={placeholder}
        submitLabel="Start"
        items={mentionItems}
        minHeight="72px"
        maxHeight="220px"
        className="w-full"
        actionsStart={
          <TaskRuntimePicker
            value={taskRuntime}
            onChange={setTaskRuntime}
          />
        }
        footer={
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-1">
            <div className="flex min-w-[220px] flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                Assigned agent
              </span>
              <Select
                items={assignableAgents.map((agent) => ({
                  label: agent.name,
                  value: agent.scopedId,
                }))}
                value={selectedAgent?.scopedId || null}
                onValueChange={(value) => {
                  const nextAgent =
                    assignableAgents.find((agent) => agent.scopedId === value) || null;
                  setSelectedAgent(nextAgent);
                }}
                disabled={assignableAgents.length === 0}
              >
                <SelectTrigger className="min-w-[220px] rounded-full bg-background px-3">
                  <SelectValue placeholder="No visible agents" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {assignableAgents.map((agent) => (
                      <SelectItem key={agent.scopedId} value={agent.scopedId}>
                        <span className="text-sm leading-none">{agent.emoji || "🤖"}</span>
                        <span className="truncate">
                          {agent.name}
                          {agent.inherited ? ` · ${agent.cabinetName}` : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {selectedAgentMeta ? (
              <p className="max-w-sm text-[11px] leading-5 text-muted-foreground">
                {selectedAgentMeta}
              </p>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
