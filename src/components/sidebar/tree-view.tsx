"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TreeNode } from "./tree-node";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkRepoDialog } from "./link-repo-dialog";
import { MoveToDialog } from "./move-to-dialog";
import { RecentTasks } from "./recent-tasks";
import type { TreeNode as TreeNodeType } from "@/types";
import {
  CornerLeftUp,
  Plus,
  BookOpen,
  Users,
  SquareKanban,
  Pencil,
  FilePlus,
  FolderOpen,
  GitBranch,
  ClipboardCopy,
  Copy,
  Trash2,
  Archive,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar, getAgentDisplayName } from "@/components/agents/agent-avatar";
import { EditAgentIdentityDialog } from "@/components/agents/edit-agent-identity-dialog";
import {
  findNodeByPath,
  findParentCabinetNode,
  findRootCabinetNode,
} from "@/lib/cabinets/tree";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import {
  cabinetVisibilityModeLabel,
  CABINET_VISIBILITY_OPTIONS,
} from "@/lib/cabinets/visibility";
import { getDataDir } from "@/lib/data-dir-cache";
import type { CabinetOverview, CabinetVisibilityMode } from "@/types/cabinets";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentSummary {
  scopedId?: string;
  name: string;
  slug: string;
  emoji: string;
  active: boolean;
  runningCount?: number;
  jobCount?: number;
  taskCount?: number;
  heartbeat?: string;
  cabinetPath?: string;
  cabinetName?: string;
  inherited?: boolean;
  displayName?: string;
  iconKey?: string;
  color?: string;
  avatar?: string;
  avatarExt?: string;
  role?: string;
}

/* ── item style matching TreeNode exactly ──────────────────── */

const itemClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 w-full text-left py-1 px-2 text-[12px] text-foreground/75 rounded-md transition-colors cursor-pointer",
    "hover:bg-foreground/[0.03] hover:text-foreground",
    active && "bg-accent text-accent-foreground font-medium"
  );

export function TreeView() {
  const { nodes, loading } = useTreeStore();
  const selectPage = useTreeStore((s) => s.selectPage);
  const createPage = useTreeStore((s) => s.createPage);
  const deletePage = useTreeStore((s) => s.deletePage);
  const loadPage = useEditorStore((s) => s.loadPage);
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const cabinetVisibilityModes = useAppStore((s) => s.cabinetVisibilityModes);
  const setCabinetVisibilityMode = useAppStore((s) => s.setCabinetVisibilityMode);

  const [cabinetExpanded, setCabinetExpanded] = useState(true);

  // Cabinet-drawer UI: the sidebar exposes three "drawers" — Agents, Tasks, and
  // Data — as a horizontal tab row. Only one is open at a time. The previous
  // vertical-accordion `agentsExpanded` / `tasksExpanded` / `kbExpanded` flags
  // are now derived from `activeDrawer` for minimal downstream churn.
  const DRAWER_LS_KEY = "cabinet.sidebar.drawer";
  type DrawerId = "agents" | "tasks" | "data";
  const [activeDrawer, setActiveDrawer] = useState<DrawerId>(() => {
    if (typeof window === "undefined") return "data";
    const stored = window.localStorage.getItem(DRAWER_LS_KEY);
    return stored === "agents" || stored === "tasks" || stored === "data"
      ? stored
      : "data";
  });

  // When the route changes under us (hash nav, shortcut, etc.), auto-open the
  // matching drawer so the sidebar and main are always in sync.
  useEffect(() => {
    if (section.type === "agent" || section.type === "agents") {
      setActiveDrawer("agents");
    } else if (section.type === "task" || section.type === "tasks") {
      setActiveDrawer("tasks");
    }
    // Other section types keep the user's last manual choice.
  }, [section.type]);

  // Persist the user's manual drawer choice so returning to the app restores it.
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAWER_LS_KEY, activeDrawer);
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, [activeDrawer]);

  const agentsExpanded = activeDrawer === "agents";
  const tasksExpanded = activeDrawer === "tasks";
  const kbExpanded = activeDrawer === "data";
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [cabinetAgentScopeName, setCabinetAgentScopeName] = useState<string | null>(null);
  const [kbSubPageOpen, setKbSubPageOpen] = useState(false);
  const [kbSubPageTitle, setKbSubPageTitle] = useState("");
  const [cabinetDeleteOpen, setCabinetDeleteOpen] = useState(false);
  const [kbCreating, setKbCreating] = useState(false);
  const [linkRepoOpen, setLinkRepoOpen] = useState(false);
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [moveToSource, setMoveToSource] = useState<TreeNodeType | null>(null);
  const [editingAgent, setEditingAgent] = useState<{ slug: string; cabinetPath?: string } | null>(null);

  const requestMoveTo = useCallback((node: TreeNodeType) => {
    setMoveToSource(node);
    setMoveToOpen(true);
  }, []);

  const rootCabinet = useMemo(() => findRootCabinetNode(nodes), [nodes]);
  const routeCabinetPath = section.cabinetPath;
  const activeCabinet = useMemo(() => {
    if (!routeCabinetPath) return null;
    return findNodeByPath(nodes, routeCabinetPath);
  }, [nodes, routeCabinetPath]);
  const parentCabinet = useMemo(() => {
    if (!activeCabinet) return null;
    return findParentCabinetNode(nodes, activeCabinet.path);
  }, [activeCabinet, nodes]);
  const effectiveCabinetPath = activeCabinet?.path || ROOT_CABINET_PATH;
  const cabinetVisibilityMode =
    cabinetVisibilityModes[effectiveCabinetPath] || "own";
  const visibleTreeNodes = activeCabinet?.children || rootCabinet?.children || nodes;
  const kbSectionLabel = "Data";

  /* ── agent polling ─────────────────────────────────────────── */

  const loadAgents = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        path: activeCabinet?.path || ROOT_CABINET_PATH,
        visibility: cabinetVisibilityMode,
      });
      const res = await fetch(`/api/cabinets/overview?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as CabinetOverview;
        setCabinetAgentScopeName(data.cabinet.name || "Cabinet");
        setAgents(
          (data.agents || []).map((agent) => ({
            scopedId: agent.scopedId,
            name: agent.name,
            slug: agent.slug,
            emoji: agent.emoji,
            active: agent.active,
            runningCount: 0,
            jobCount: agent.jobCount || 0,
            taskCount: agent.taskCount || 0,
            heartbeat: agent.heartbeat || "",
            cabinetPath: agent.cabinetPath,
            cabinetName: agent.cabinetName,
            inherited: agent.inherited,
            displayName: agent.displayName,
            iconKey: agent.iconKey,
            color: agent.color,
            avatar: agent.avatar,
            avatarExt: agent.avatarExt,
            role: agent.role,
          }))
        );
        return;
      }
    } catch {
      if (activeCabinet) {
        setCabinetAgentScopeName(
          activeCabinet.frontmatter?.title || activeCabinet.name
        );
        setAgents([]);
        return;
      }

      setCabinetAgentScopeName(null);
    }
  }, [activeCabinet, cabinetVisibilityMode]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadAgents();
    }, 0);
    const interval = window.setInterval(() => {
      void loadAgents();
    }, 5000);
    window.addEventListener("focus", loadAgents);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.removeEventListener("focus", loadAgents);
    };
  }, [loadAgents]);

  // Cmd+Shift+M to open Move To… for the currently selected node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        const { selectedPath, nodes } = useTreeStore.getState();
        if (!selectedPath) return;
        const node = findNodeByPath(nodes, selectedPath);
        if (!node) return;
        e.preventDefault();
        requestMoveTo(node);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestMoveTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  // depth-based padding matching TreeNode: depth * 16 + 8
  const pad = (depth: number) => ({ paddingLeft: `${depth * 16 + 8}px` });
  const cabinetPath = activeCabinet?.path || rootCabinet?.path || ROOT_CABINET_PATH;
  const dataRootPath = activeCabinet
    ? activeCabinet.path === ROOT_CABINET_PATH
      ? ""
      : activeCabinet.path
    : "";
  const selectedAgentScopedId =
    section.agentScopedId ||
    (section.type === "agent" && section.cabinetPath && section.slug
      ? `${section.cabinetPath}::agent::${section.slug}`
      : null);

  const openCabinetOverview = (targetCabinetPath = cabinetPath) => {
    selectPage(targetCabinetPath);
    void loadPage(targetCabinetPath);
    setSection({
      type: "cabinet",
      cabinetPath: targetCabinetPath,
    });
  };

  const openCabinetDataPage = (targetCabinetPath = cabinetPath) => {
    selectPage(targetCabinetPath);
    void loadPage(targetCabinetPath);
    setSection({
      type: "page",
      cabinetPath: targetCabinetPath,
    });
  };

  const renderAgentRow = (
    key: string,
    agent: {
      slug: string;
      cabinetPath?: string;
      displayName?: string;
      name?: string;
      iconKey?: string;
      color?: string;
      avatar?: string;
      avatarExt?: string;
    },
    opts: {
      selected: boolean;
      onClick: () => void;
      activeDot?: boolean;
      editable?: { slug: string; cabinetPath?: string };
    }
  ) => {
    const row = (
      <button
        onClick={opts.onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-foreground/[0.03]",
          opts.selected && "bg-accent text-accent-foreground"
        )}
        style={pad(1)}
      >
        <AgentAvatar
          agent={{
            slug: agent.slug,
            cabinetPath: agent.cabinetPath,
            displayName: agent.displayName,
            iconKey: agent.iconKey,
            color: agent.color,
            avatar: agent.avatar,
            avatarExt: agent.avatarExt,
          }}
          size="sm"
          shape="square"
        />
        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/75">
          {getAgentDisplayName(agent)}
        </span>
        {typeof opts.activeDot === "boolean" && (
          <span
            className={cn(
              "ml-auto h-1.5 w-1.5 shrink-0 rounded-full",
              opts.activeDot ? "bg-green-500" : "bg-muted-foreground/30"
            )}
          />
        )}
      </button>
    );

    if (!opts.editable) return <div key={key}>{row}</div>;

    const editable = opts.editable;
    return (
      <ContextMenu key={key}>
        <ContextMenuTrigger>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setEditingAgent(editable)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit agent
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const openParentCabinet = () => {
    if (!parentCabinet) return;
    openCabinetOverview(parentCabinet.path);
  };

  return (
    <>
    <ScrollArea className="flex-1 min-h-0 [&_[data-slot=scroll-area-scrollbar]]:w-2 [&_[data-slot=scroll-area-scrollbar]]:py-0 [&_[data-slot=scroll-area-scrollbar]]:pr-0 [&_[data-slot=scroll-area-scrollbar]]:pl-1 [&_[data-slot=scroll-area-scrollbar]]:border-l-0">
      <div className="py-1">
        {/* ── Back to parent cabinet ────────────────────── */}
        {activeCabinet && parentCabinet ? (
          <button
            onClick={openParentCabinet}
            className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-left text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground/80"
            style={pad(0)}
            title={`Back to ${parentCabinet.frontmatter?.title || parentCabinet.name}`}
          >
            <CornerLeftUp className="h-2.5 w-2.5 shrink-0 relative -top-px" />
            Back
          </button>
        ) : null}

        {/* ── Cabinet (depth 0) ───────────────────────────── */}
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 w-full" style={pad(0)}>
          <ContextMenu>
          <ContextMenuTrigger>
          <button
            onClick={() => openCabinetOverview(activeCabinet?.path || cabinetPath)}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-left hover:text-foreground/80 transition-colors"
          >
            <Archive className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            {cabinetAgentScopeName || activeCabinet?.frontmatter?.title || activeCabinet?.name || "Cabinet"}
          </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem disabled className="flex-col items-start gap-0">
              <span className="flex items-center">
                <Pencil className="h-4 w-4 mr-2" />
                Rename
              </span>
              <span className="text-[10px] text-muted-foreground/60 ml-6">
                Coming soon
              </span>
            </ContextMenuItem>
            {cabinetPath !== ROOT_CABINET_PATH && (
              <ContextMenuItem onClick={() => navigator.clipboard.writeText(cabinetPath)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Relative Path
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={async () => {
              const dir = await getDataDir();
              navigator.clipboard.writeText(
                cabinetPath === ROOT_CABINET_PATH ? dir : `${dir}/${cabinetPath}`
              );
            }}>
              <ClipboardCopy className="h-4 w-4 mr-2" />
              Copy Full Path
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
              fetch("/api/system/open-data-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subpath: cabinetPath === ROOT_CABINET_PATH ? "" : cabinetPath,
                }),
              });
            }}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Open in Finder
            </ContextMenuItem>
            {cabinetPath !== ROOT_CABINET_PATH && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-destructive"
                  onClick={() => setCabinetDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
          </ContextMenu>

          <Select
            items={CABINET_VISIBILITY_OPTIONS.map((opt) => ({
              label: opt.shortLabel,
              value: opt.value,
            }))}
            value={cabinetVisibilityMode}
            onValueChange={(value) =>
              setCabinetVisibilityMode(
                effectiveCabinetPath,
                value as CabinetVisibilityMode
              )
            }
          >
            <SelectTrigger
              size="sm"
              className="ml-auto h-5 min-w-0 w-auto gap-0.5 rounded border-none bg-transparent px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 shadow-none hover:text-foreground/80 focus-visible:ring-0"
            >
              <SelectValue placeholder="Own" />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[200px]">
              <SelectGroup>
                {CABINET_VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.shortLabel}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {cabinetExpanded && (
          <>

            {/* ── Cabinet drawers ───────────────────────────────
                Three horizontal tabs (Data · Agents · Tasks) that act like
                physical drawer pulls. Exactly one is open; clicking a closed
                tab routes to that section and slides its content in below. */}
            <div className="px-2 pt-2 pb-1">
              <div
                role="tablist"
                aria-label="Cabinet drawers"
                className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 ring-1 ring-border/60"
              >
                {([
                  {
                    id: "data" as DrawerId,
                    label: "Data",
                    icon: BookOpen,
                    onOpen: () => {
                      if (activeCabinet) {
                        openCabinetDataPage(activeCabinet.path);
                        return;
                      }
                      if (
                        section.type !== "home" &&
                        section.type !== "page" &&
                        section.type !== "cabinet"
                      ) {
                        setSection({ type: "home" });
                      }
                    },
                    onAdd: () => {
                      if (activeCabinet) {
                        setKbSubPageOpen(true);
                      } else {
                        const btn = document.querySelector<HTMLButtonElement>(
                          "[data-new-page-trigger]"
                        );
                        btn?.click();
                      }
                    },
                  },
                  {
                    id: "agents" as DrawerId,
                    label: "Agents",
                    icon: Users,
                    onOpen: () =>
                      setSection({
                        type: "agents",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      }),
                    onAdd: () => {
                      setSection({
                        type: "agents",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      });
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("cabinet:open-add-agent")
                        );
                      }, 100);
                    },
                  },
                  {
                    id: "tasks" as DrawerId,
                    label: "Tasks",
                    icon: SquareKanban,
                    onOpen: () =>
                      setSection({
                        type: "tasks",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      }),
                    onAdd: () => {
                      setSection({
                        type: "tasks",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      });
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("cabinet:open-create-task")
                        );
                      }, 100);
                    },
                  },
                ] as const).map((drawer) => {
                  const Icon = drawer.icon;
                  const active = activeDrawer === drawer.id;
                  return (
                    <div key={drawer.id} className="relative group">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={`${drawer.label} drawer`}
                        onClick={() => {
                          setActiveDrawer(drawer.id);
                          drawer.onOpen();
                        }}
                        className={cn(
                          "flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 py-2 transition-all duration-150",
                          active
                            ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide">
                          {drawer.label}
                        </span>
                      </button>
                      {active && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            drawer.onAdd();
                          }}
                          title={`Add to ${drawer.label}`}
                          aria-label={`Add to ${drawer.label}`}
                          className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded text-muted-foreground/70 opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {agentsExpanded && (
              <div
                key="drawer-agents"
                className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
              >
                {[
                  ...agents.filter((a) => a.slug === "editor"),
                  ...agents.filter((a) => a.slug !== "editor"),
                ].map((agent, i) => {
                  const cabinetPathForAgent =
                    agent.cabinetPath ||
                    activeCabinet?.path ||
                    ROOT_CABINET_PATH;
                  const scopedId =
                    agent.scopedId ||
                    `${cabinetPathForAgent}::agent::${agent.slug}`;
                  return (
                    <div
                      key={agent.scopedId || agent.slug}
                      className="animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
                      style={{ animationDelay: `${Math.min(i, 10) * 20}ms`, animationFillMode: "backwards" }}
                    >
                      {renderAgentRow(
                        agent.scopedId || agent.slug,
                        agent,
                        {
                          selected:
                            selectedAgentScopedId === scopedId ||
                            (section.type === "agent" &&
                              section.slug === agent.slug),
                          activeDot: (agent.runningCount || 0) > 0,
                          onClick: () =>
                            setSection({
                              type: "agent",
                              slug: agent.slug,
                              cabinetPath: cabinetPathForAgent,
                              agentScopedId: scopedId,
                            }),
                          editable: {
                            slug: agent.slug,
                            cabinetPath: cabinetPathForAgent,
                          },
                        }
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tasksExpanded && (
              <div
                key="drawer-tasks"
                className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
              >
                <RecentTasks
                  active
                  padStyle={pad(1)}
                  itemClass={itemClass}
                  cabinetPath={activeCabinet?.path}
                  agents={agents}
                />
              </div>
            )}

            {kbExpanded && (
              <ContextMenu>
                <ContextMenuTrigger>
                  <div
                    key="drawer-data"
                    className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
                  >
              <>
                {visibleTreeNodes.length === 0 ? (
                  <button
                    onClick={() => {
                      if (activeCabinet) {
                        setKbSubPageOpen(true);
                      } else {
                        const btn = document.querySelector<HTMLButtonElement>(
                          "[data-new-page-trigger]"
                        );
                        btn?.click();
                      }
                    }}
                    className={itemClass(false)}
                    style={pad(1)}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {activeCabinet ? "Add cabinet data" : "Add your first page"}
                  </button>
                ) : (
                  visibleTreeNodes.map((node, index) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={1}
                      contextCabinetPath={activeCabinet?.path || null}
                      siblings={visibleTreeNodes}
                      onMoveToRequest={requestMoveTo}
                      animationDelayMs={index * 22}
                    />
                  ))
                )}
              </>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => setKbSubPageOpen(true)}>
                    <FilePlus className="h-4 w-4 mr-2" />
                    Add Sub Page
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => setLinkRepoOpen(true)}>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Load Knowledge
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={async () => {
                      const dir = await getDataDir();
                      navigator.clipboard.writeText(
                        dataRootPath ? `${dir}/${dataRootPath}` : dir
                      );
                    }}
                  >
                    <ClipboardCopy className="h-4 w-4 mr-2" />
                    Copy Full Path
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      fetch("/api/system/open-data-dir", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subpath: dataRootPath }),
                      });
                    }}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Open in Finder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
          </>
        )}
      </div>
    </ScrollArea>

    <Dialog open={kbSubPageOpen} onOpenChange={setKbSubPageOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add Sub Page to &ldquo;{kbSectionLabel}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!kbSubPageTitle.trim()) return;
            setKbCreating(true);
            try {
              await createPage(dataRootPath, kbSubPageTitle.trim());
              const slug = kbSubPageTitle
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              const nextPath = dataRootPath ? `${dataRootPath}/${slug}` : slug;
              selectPage(nextPath);
              await loadPage(nextPath);
              setSection(
                activeCabinet
                  ? {
                      type: "page",
                      cabinetPath: activeCabinet.path,
                    }
                  : { type: "page" }
              );
              setKbSubPageTitle("");
              setKbSubPageOpen(false);
            } catch (error) {
              console.error("Failed to create sub page:", error);
            } finally {
              setKbCreating(false);
            }
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Page title..."
            value={kbSubPageTitle}
            onChange={(e) => setKbSubPageTitle(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={!kbSubPageTitle.trim() || kbCreating}>
            {kbCreating ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    <LinkRepoDialog open={linkRepoOpen} onOpenChange={setLinkRepoOpen} />

    <MoveToDialog
      open={moveToOpen}
      onOpenChange={setMoveToOpen}
      source={moveToSource}
    />

    <EditAgentIdentityDialog
      target={editingAgent}
      onOpenChange={(open) => {
        if (!open) setEditingAgent(null);
      }}
      onSaved={() => {
        void loadAgents();
      }}
    />

    <Dialog open={cabinetDeleteOpen} onOpenChange={setCabinetDeleteOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <TriangleAlert className="h-4 w-4 text-destructive" />
            </div>
            <div className="flex flex-col gap-1">
              <DialogTitle>
                Delete Cabinet &ldquo;{activeCabinet?.frontmatter?.title || activeCabinet?.name || cabinetPath}&rdquo;
              </DialogTitle>
              <DialogDescription>
                This will permanently delete the cabinet and everything inside it — all pages, agents, jobs, and tasks. This cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setCabinetDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await deletePage(cabinetPath);
              setCabinetDeleteOpen(false);
              setSection({ type: "home" });
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </>
  );
}
