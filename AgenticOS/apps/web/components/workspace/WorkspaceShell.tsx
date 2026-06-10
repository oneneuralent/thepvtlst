"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { UserButton } from "@clerk/nextjs";
import {
  Archive,
  Bot,
  Brain,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Files,
  Grid3X3,
  Globe,
  Inbox,
  Layers3,
  Library,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  PlugZap,
  Save,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  UserCircle,
  BarChart3,
  ExternalLink,
  HardDrive,
  Wrench,
  X,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelPreset, ModelPresetId } from "@/lib/server/model-presets";
import type { AgenticSkill } from "@/lib/server/skill-catalog";

type Mode = "act";
type View = "chat" | "library" | "email" | "canvas" | "connections" | "skills" | "tokens" | "kanban";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  approvalId?: string | null;
  approvalStatus?: "ready" | "pending" | "sent" | "failed";
  sources?: AgentSource[];
  toolEvents?: AgentToolEvent[];
  isProgress?: boolean;
  progressType?: "reasoning" | "tool" | "thinking" | "api_call" | "token_usage";
  metadata?: {
    latency?: string;
    tokens?: string;
    apiCallNumber?: number;
    toolOutput?: Record<string, unknown>;
  };
};

type AgentSource = {
  title: string;
  url: string;
  content?: string;
  score?: number | null;
};

type AgentToolEvent = {
  tool_name: string;
  tool_category: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
  requires_approval: boolean;
};

type RunStep = {
  id: string;
  type: string;
  label: string;
  detail?: string;
  status: "running" | "completed" | "failed" | "waiting";
};

type LibraryItem = {
  id: string;
  type: string;
  title: string;
  content?: string | null;
  tags?: string[];
  created_at?: string;
  thread_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Connection = {
  id: string;
  provider: string;
  provider_account_id?: string | null;
  scopes?: string[];
  status: string;
  created_at?: string;
};

type EmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

type DriveFile = {
  id: string;
  name: string;
  type: "doc" | "sheet";
  webViewLink: string;
  modifiedTime?: string;
};

type TokenRun = {
  id: string;
  status: string;
  mode: string;
  created_at: string;
  model: string;
  total_tokens: number;
  message: string;
};

type TokenStats = {
  total_runs: number;
  completed_runs: number;
  total_tokens: number;
  by_model: Record<string, { runs: number; total_tokens: number }>;
  monthly: Record<string, { runs: number; total_tokens: number }>;
  recent_runs: TokenRun[];
};

type KanbanItem = {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  created_at: string;
};

type WorkspaceSkill = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: string;
  version?: {
    id: string;
    version: number;
    body: string;
    status: string;
    safety_status: string;
  } | null;
};

type Thread = {
  id: string;
  title: string;
  mode: Mode;
  created_at: string;
};

const starterMessages: ChatMessage[] = [
  {
    id: "starter",
    role: "assistant",
    content: "The PVTLST is online. What do you need?",
    createdAt: new Date().toISOString()
  }
];

const modeCopy: Record<Mode, string> = {
  act: "Approval-gated actions"
};

const navItems: { view: View; label: string; icon: React.ElementType }[] = [
  { view: "chat", label: "Chat", icon: MessageSquare },
  { view: "library", label: "Library", icon: Library },
  { view: "email", label: "Email", icon: Mail },
  { view: "canvas", label: "Canvas", icon: Grid3X3 },
  { view: "connections", label: "Connections", icon: PlugZap },
  { view: "skills", label: "Skills", icon: Brain },
  { view: "tokens", label: "Tokens", icon: BarChart3 },
  { view: "kanban", label: "Kanban", icon: CalendarCheck }
];

export function WorkspaceShell({ email }: { email: string }) {
  const [mode, setMode] = useState<Mode>("act");
  const [view, setView] = useState<View>("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [isSending, setIsSending] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runSteps, setRunSteps] = useState<RunStep[]>([]);
  const [toolEvents, setToolEvents] = useState<AgentToolEvent[]>([]);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [runtime, setRuntime] = useState<Record<string, unknown>>({});
  const [reasoningLog, setReasoningLog] = useState<string[]>([]);
  const [showReasoning, setShowReasoning] = useState(false);
  const [modelPresets, setModelPresets] = useState<ModelPreset[]>([]);
  const [modelPresetId, setModelPresetId] = useState<ModelPresetId>("fast");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [emailMessages, setEmailMessages] = useState<EmailMessage[]>([]);
  const [emailStatus, setEmailStatus] = useState("Not loaded");
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [skills, setSkills] = useState<AgenticSkill[]>([]);
  const [workspaceSkills, setWorkspaceSkills] = useState<WorkspaceSkill[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [currentLlmModel, setCurrentLlmModel] = useState<{ provider: string; model: string } | null>(null);
  const [liveTokenCount, setLiveTokenCount] = useState(0);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [kanbanItems, setKanbanItems] = useState<KanbanItem[]>([]);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedPreset = useMemo(
    () => modelPresets.find((preset) => preset.id === modelPresetId) ?? modelPresets[0],
    [modelPresetId, modelPresets]
  );

  useEffect(() => {
    void refreshModels();
    void refreshConnections();
    void refreshLibrary();
    void refreshSkills();
    void refreshThreads();
    const urlThreadId = new URLSearchParams(window.location.search).get("t");
    if (urlThreadId) void loadThread(urlThreadId);

    const params = new URLSearchParams(window.location.search);
    const connection = params.get("connection");
    if (connection === "google_connected") {
      setConnectionNotice(null);
      void refreshConnections();
      void refreshEmail();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (connection === "google_error") {
      setConnectionNotice("Google OAuth failed. Please try again or check that your email is added as a test user in Google Cloud Console.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, runSteps, isSending]);

  async function refreshModels() {
    const response = await fetch("/api/models/presets");
    const data = (await response.json()) as { presets?: ModelPreset[] };
    if (data.presets?.length) {
      setModelPresets(data.presets);
      setModelPresetId(data.presets[0].id);
    }
  }

  async function refreshConnections() {
    const response = await fetch("/api/connections");
    if (!response.ok) return;
    const data = (await response.json()) as { connections?: Connection[] };
    setConnections(data.connections ?? []);
  }

  async function refreshLibrary(type = "all") {
    const response = await fetch(`/api/library?type=${encodeURIComponent(type)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { items?: LibraryItem[] };
    setLibraryItems(data.items ?? []);
  }

  async function refreshSkills() {
    const response = await fetch("/api/skills");
    if (!response.ok) return;
    const data = (await response.json()) as { skills?: AgenticSkill[]; workspaceSkills?: WorkspaceSkill[] };
    setSkills(data.skills ?? []);
    setWorkspaceSkills(data.workspaceSkills ?? []);
  }

  async function refreshThreads() {
    const response = await fetch("/api/chat/threads");
    if (!response.ok) return;
    const data = (await response.json()) as { threads?: Thread[] };
    setThreads(data.threads ?? []);
  }

  async function loadThread(id: string) {
    setLoadingThread(true);
    setThreadId(id);
    setRunSteps([]);
    setToolEvents([]);
    const response = await fetch(`/api/chat/messages?threadId=${id}`);
    if (!response.ok) { setLoadingThread(false); return; }
    const data = (await response.json()) as {
      messages?: Array<{ id: string; role: string; content: string; created_at: string; metadata?: Record<string, unknown> }>;
    };
    if (data.messages?.length) {
      setMessages(
        data.messages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          createdAt: msg.created_at,
          approvalId: (msg.metadata?.approvalId as string) ?? null,
          approvalStatus: msg.metadata?.approvalId ? ("ready" as const) : undefined,
          sources: (msg.metadata?.sources as AgentSource[]) ?? []
        }))
      );
    }
    setLoadingThread(false);
  }

  function newThread() {
    setThreadId(null);
    setMessages(starterMessages);
    setRunSteps([]);
    setToolEvents([]);
    setSources([]);
    setRuntime({});
    router.push("/app");
  }

  async function activateWorkspaceSkill(skillId: string) {
    const response = await fetch(`/api/workspace-skills/${skillId}/activate`, { method: "POST" });
    if (response.ok) void refreshSkills();
  }

  async function refreshEmail() {
    setEmailStatus("Loading");
    const response = await fetch("/api/email");
    const data = (await response.json().catch(() => ({}))) as {
      connected?: boolean;
      messages?: EmailMessage[];
      error?: string;
    };
    if (!response.ok || data.error) {
      setEmailStatus(data.error ?? "Email unavailable");
      return;
    }
    if (!data.connected) {
      setEmailStatus("Connect Google Workspace");
      setEmailMessages([]);
      return;
    }
    setEmailMessages(data.messages ?? []);
    setEmailStatus("Connected");
  }

  async function refreshTokens() {
    const res = await fetch("/api/tokens");
    if (res.ok) setTokenStats((await res.json()) as TokenStats);
  }

  async function refreshKanban() {
    const res = await fetch("/api/kanban");
    if (res.ok) {
      const data = (await res.json()) as { todos: KanbanItem[] };
      setKanbanItems(data.todos ?? []);
    }
  }

  async function saveKanban(items: KanbanItem[]) {
    setKanbanItems(items);
    await fetch("/api/kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos: items })
    });
  }

  async function connectGoogle() {
    setConnectionNotice(null);
    const response = await fetch("/api/connections/google/start", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setConnectionNotice(data.error ?? `Google OAuth could not start (HTTP ${response.status}).`);
  }

  async function saveLastAssistantMessage() {
    const message = [...messages].reverse().find((item) => item.role === "assistant" && item.id !== "starter");
    if (!message) return;
    await fetch("/api/library/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "response",
        title: message.content.slice(0, 80) || "Saved response",
        content: message.content,
        metadata: { threadId, runId, sources },
        tags: [mode, "chat"]
      })
    });
    await refreshLibrary();
  }

  async function approveMessage(approvalId: string, messageId: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, approvalStatus: "pending" } : message
      )
    );

    const response = await fetch(`/api/approvals/${approvalId}/approve`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok || data.error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, approvalStatus: "failed", content: `${message.content}\n\nSend failed: ${data.error ?? "Unknown error"}` }
            : message
        )
      );
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, approvalStatus: "sent", content: `${message.content}\n\nAction completed.` } : message
      )
    );
    void refreshEmail();
  }

  function stopRun() {
    abortRef.current?.abort();
    setIsSending(false);
    upsertStep({
      id: "stopped",
      type: "run.stopped",
      label: "Stopped",
      detail: "The browser stopped waiting for this run.",
      status: "failed"
    });
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);
    setRunSteps([]);
    setToolEvents([]);
    setSources([]);
    setRuntime({});

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          mode,
          model: selectedPreset?.model,
          threadId: threadId ?? undefined
        }),
        signal: controller.signal
      });

      if (!response.body) {
        throw new Error("The chat stream did not open.");
      }

      await readEventStream(response.body);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: error instanceof Error ? error.message : "The agent run failed before completion.",
            createdAt: new Date().toISOString()
          }
        ]);
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }

  async function readEventStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const event = parseSseChunk(chunk);
        if (event) handleStreamEvent(event.type, event.data);
      }
    }
  }

  function handleStreamEvent(type: string, data: Record<string, unknown>) {
    if (type === "run.started") {
      flushSync(() => {
        setLiveTokenCount(0);
        setRunId(typeof data.runId === "string" ? data.runId : null);
        const newThreadId = typeof data.threadId === "string" ? data.threadId : threadId;
        setThreadId(newThreadId);
        if (newThreadId) router.replace(`/app?t=${newThreadId}`);
        setReasoningLog([]);
        setShowReasoning(false);
        upsertStep({ id: "run", type, label: "The PVTLST started", detail: String(data.model ?? "default model"), status: "running" });
        // Add inline progress message
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `🤖 Starting run with ${data.model ?? "default model"}...`,
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "thinking"
          }
        ]);
      });
      return;
    }

    if (type === "api.call") {
      flushSync(() => {
        const apiData = data as { call_number?: number; model?: string; provider?: string; latency?: string; tokens?: string };
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `📡 API call #${apiData.call_number ?? "?"}: ${apiData.provider ?? "unknown"}/${apiData.model ?? "unknown"} (${apiData.latency ?? "?"})`,
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "api_call",
            metadata: {
              latency: apiData.latency,
              tokens: apiData.tokens,
              apiCallNumber: apiData.call_number
            }
          }
        ]);
      });
      return;
    }

    if (type === "token.usage") {
      flushSync(() => {
        const tokenData = data as { prompt?: number; completion?: number; total?: number };
        setLiveTokenCount((prev) => prev + (tokenData.total ?? 0));
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `📊 Tokens: ${tokenData.prompt ?? "?"} in → ${tokenData.completion ?? "?"} out → ${tokenData.total ?? "?"} total`,
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "token_usage",
            metadata: {
              tokens: `${tokenData.prompt ?? "?"} in, ${tokenData.completion ?? "?"} out, ${tokenData.total ?? "?"} total`
            }
          }
        ]);
      });
      return;
    }

    if (type === "reasoning.summary") {
      flushSync(() => {
        upsertStep({ id: "reasoning", type, label: "Thinking", detail: String(data.summary ?? ""), status: "running" });
        // Add inline reasoning message
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `🧠 ${data.summary ?? "Thinking..."}`,
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "reasoning"
          }
        ]);
      });
      return;
    }

    if (type === "skills.synced") {
      flushSync(() => {
        const skillCount = Number(data.skills_count ?? 0);
        upsertStep({
          id: "skills-synced",
          type,
          label: "Skills synced",
          detail: `${skillCount} active skill${skillCount === 1 ? "" : "s"} loaded into Hermes`,
          status: skillCount > 0 ? "completed" : "running"
        });
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: skillCount > 0
              ? `Skills ready: ${skillCount} loaded into Hermes`
              : "No active skills loaded into Hermes yet",
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "thinking"
          }
        ]);
      });
      return;
    }

    if (type === "run.heartbeat") {
      upsertStep({
        id: "heartbeat",
        type,
        label: "Still working",
        detail: String(data.message ?? "Hermes is still working."),
        status: "running"
      });
      return;
    }

    if (type === "tool.started") {
      flushSync(() => {
        const event = data as unknown as AgentToolEvent;
        setToolEvents((current) => [...current, event]);
        upsertStep({
          id: `${event.tool_name}-${currentTimeKey()}`,
          type,
          label: humanizeToolName(event.tool_name),
          detail: "running",
          status: "running"
        });
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `Calling ${humanizeToolName(event.tool_name)}`,
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "tool"
          }
        ]);
      });
      return;
    }

    if (type === "tool.completed") {
      flushSync(() => {
        const event = data as unknown as AgentToolEvent;
        setToolEvents((current) => [...current, event]);
        upsertStep({
          id: `${event.tool_name}-${currentTimeKey()}`,
          type,
          label: humanizeToolName(event.tool_name),
          detail: event.status,
          status: event.status === "failed" ? "failed" : "completed"
        });
        // Add inline tool usage message with rich preview for write operations
        const statusIcon = event.status === "failed" ? "❌" : "✅";
        const evOut = event.output as Record<string, unknown>;
        const evIn = event.input as Record<string, unknown>;
        let toolContent = `${statusIcon} ${humanizeToolName(event.tool_name)}`;
        if (event.tool_name === "google_sheets_create" && evOut.spreadsheetId) {
          toolContent = `${statusIcon} Created spreadsheet "${String(evIn.title ?? "Untitled")}"${evOut.spreadsheet_url ? " → " + String(evOut.spreadsheet_url) : ""}`;
        } else if ((event.tool_name === "google_sheets_append" || event.tool_name === "google_sheets_write") && evOut.updates) {
          const upd = evOut.updates as { updatedRows?: number; updatedCells?: number; updatedRange?: string };
          toolContent = `${statusIcon} Wrote ${upd.updatedRows ?? "?"} rows${upd.updatedRange ? " (" + upd.updatedRange + ")" : ""} to spreadsheet`;
        } else if (event.tool_name === "google_docs_write" && (evOut.documentId ?? evOut.document_id)) {
          toolContent = `${statusIcon} Saved Google Doc: "${String(evOut.title ?? evIn.title ?? "Document")}"`;
        } else if (event.tool_name === "google_sheets_list" && Array.isArray(evOut.spreadsheets)) {
          toolContent = `${statusIcon} Found ${(evOut.spreadsheets as unknown[]).length} spreadsheets in Drive`;
        } else if (event.tool_name === "google_docs_list" && Array.isArray(evOut.documents)) {
          toolContent = `${statusIcon} Found ${(evOut.documents as unknown[]).length} docs in Drive`;
        } else if (event.tool_name === "gmail_send" && evIn.to) {
          toolContent = `${statusIcon} Email sent to ${String(evIn.to)}`;
        } else if (event.tool_name === "web_search" && evIn.query) {
          const evOutData = evOut as { success?: boolean; data?: { web?: Array<{ title?: string; url?: string }> } };
          const resultCount = evOutData.data?.web?.length ?? 0;
          toolContent = `${statusIcon} Searched for "${String(evIn.query)}" → ${resultCount} results`;
        } else if (event.tool_name === "web_extract" && evIn.urls) {
          const urls = evIn.urls as string[];
          const evOutData = evOut as { results?: Array<{ url?: string; title?: string }> };
          const extractedCount = evOutData.results?.length ?? 0;
          toolContent = `${statusIcon} Extracted content from ${extractedCount} page${extractedCount === 1 ? "" : "s"}`;
        }
        // Store full output in metadata for expandable display
        const toolOutput = event.tool_name === "web_search" || event.tool_name === "web_extract" ? evOut : undefined;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: toolContent,
            createdAt: new Date().toISOString(),
            isProgress: true,
            progressType: "tool",
            metadata: toolOutput ? { toolOutput } : undefined
          }
        ]);
      });
      return;
    }

    if (type === "approval.required") {
      upsertStep({ id: "approval", type, label: "Approval required", detail: "External action is paused.", status: "waiting" });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "⏸️ Approval required for external action",
          createdAt: new Date().toISOString(),
          isProgress: true,
          progressType: "thinking"
        }
      ]);
      return;
    }

    if (type === "reasoning.log") {
      const steps = data.steps as string[] | undefined;
      if (steps) setReasoningLog(steps);
      return;
    }

    if (type === "skill.created") {
      const skillData = data as { name?: string; category?: string };
      const skillName = skillData.name ?? "Unknown skill";
      // Show inline notification
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `🧠 The PVTLST learned a new skill: "${skillName}"${skillData.category ? ` (${skillData.category})` : ""}`,
          createdAt: new Date().toISOString(),
          isProgress: true,
          progressType: "thinking"
        }
      ]);
      // Refresh skills list to show the new skill
      void refreshSkills();
      return;
    }

    if (type === "run.failed") {
      upsertStep({ id: "failed", type, label: "Run failed", detail: String(data.message ?? "Unknown error"), status: "failed" });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: String(data.message ?? "The agent run failed."),
          createdAt: new Date().toISOString()
        }
      ]);
      return;
    }

    if (type === "run.completed") {
      const completed = data as {
        message?: string;
        threadId?: string;
        runId?: string;
        approvalId?: string;
        sources?: AgentSource[];
        tool_events?: AgentToolEvent[];
        runtime?: Record<string, unknown>;
        fallback_message?: string | null;
      };
      setThreadId(completed.threadId ?? threadId);
      setRunId(completed.runId ?? runId);
      setSources(completed.sources ?? []);
      setRuntime(completed.runtime ?? {});
      if (completed.tool_events?.length) setToolEvents(completed.tool_events);
      const assistantContent = completed.fallback_message
        ? `${completed.fallback_message}\n\n${completed.message ?? "The agent completed without a text response."}`
        : completed.message ?? "The agent completed without a text response.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantContent,
          createdAt: new Date().toISOString(),
          approvalId: completed.approvalId ?? null,
          approvalStatus: completed.approvalId ? "ready" : undefined,
          sources: completed.sources ?? [],
          toolEvents: completed.tool_events as AgentToolEvent[] ?? []
        }
      ]);
      upsertStep({ id: "completed", type, label: "Completed", detail: "Response saved to the thread.", status: "completed" });
      void refreshThreads();
    }
  }

  function upsertStep(step: RunStep) {
    setRunSteps((current) => {
      const index = current.findIndex((item) => item.id === step.id);
      if (index === -1) return [...current, step];
      return current.map((item) => (item.id === step.id ? step : item));
    });
  }

  const title = navItems.find((item) => item.view === view)?.label ?? "Chat";

  return (
    <main className="flex h-screen overflow-hidden bg-[#1a1a1a] text-[#ececec]">
      <aside
        className={cn(
          "flex h-full flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#242424] transition-all duration-200",
          leftOpen ? "w-64" : "w-12"
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-3">
          <div className={cn("flex items-center gap-2", !leftOpen && "justify-center")}>
            <div className="relative grid size-7 place-items-center rounded-md text-[#2dd4bf]">
              <Sparkles size={16} />
              {isSending && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#2dd4bf] animate-ping" />
              )}
            </div>
            {leftOpen ? (
              <div>
                <p className="text-sm font-medium">The PVTLST</p>
                <p className="text-[10px] text-[#9b9b9b]">Your AI OS</p>
              </div>
            ) : null}
          </div>
          <button className="grid size-7 place-items-center rounded-md hover:bg-[#2d2d2d]" onClick={() => setLeftOpen(!leftOpen)}>
            {leftOpen ? <ChevronLeft size={15} /> : <Menu size={15} />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col overflow-hidden p-2">
          <button
            onClick={newThread}
            className={cn("mb-2 flex h-8 w-full items-center gap-2 rounded-md border border-[rgba(45,212,191,0.3)] px-2 text-xs font-medium text-[#2dd4bf] hover:bg-[rgba(45,212,191,0.08)]", !leftOpen && "justify-center")}
            title="New chat"
          >
            <Plus size={14} />
            {leftOpen ? <span>New chat</span> : null}
          </button>
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <SidebarButton
                key={item.view}
                collapsed={!leftOpen}
                active={view === item.view}
                icon={item.icon}
                label={item.label}
                onClick={() => {
                  setView(item.view);
                  if (item.view === "email") void refreshEmail();
                  if (item.view === "library") void refreshLibrary();
                  if (item.view === "connections") void refreshConnections();
                  if (item.view === "tokens") void refreshTokens();
                  if (item.view === "kanban") void refreshKanban();
                }}
              />
            ))}
          </div>
          {leftOpen && threads.length > 0 ? (
            <div className="mt-3 border-t border-[rgba(255,255,255,0.08)] pt-2">
              <p className="mb-1 px-2 text-[10px] uppercase tracking-[0.12em] text-[#9b9b9b]">Recent</p>
              <div className="space-y-0.5 overflow-y-auto">
                {threads.slice(0, 12).map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => { void loadThread(thread.id); setView("chat"); }}
                    className={cn("flex h-8 w-full items-center rounded-md px-2 text-left text-xs text-[#9b9b9b] hover:bg-[#2d2d2d] hover:text-[#ececec]", threadId === thread.id && "bg-[#2d2d2d] text-[#ececec]")}
                  >
                    <span className="truncate">{thread.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="border-t border-[rgba(255,255,255,0.08)] p-2 space-y-1">
          <div className={cn("rounded-md bg-[#2d2d2d] p-2", !leftOpen && "p-1")}>
            <div className="flex items-center gap-2 text-xs text-[#9b9b9b]">
              <LockKeyhole size={12} />
              {leftOpen ? <span>Safe actions</span> : null}
            </div>
          </div>
          <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", !leftOpen && "justify-center")}>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-6",
                  userButtonPopoverCard: "bg-[#242424] border border-[rgba(255,255,255,0.08)] shadow-xl",
                  userButtonPopoverActionButton: "text-[#ececec] hover:bg-[#2d2d2d]",
                  userButtonPopoverActionButtonText: "text-[#ececec]",
                  userButtonPopoverFooter: "hidden",
                }
              }}
            />
            {leftOpen ? (
              <div className="flex flex-col">
                <span className="text-xs text-[#ececec] truncate">{email}</span>
                <span className="text-[10px] text-[#9b9b9b]">Signed in</span>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[#242424] px-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="grid size-8 place-items-center rounded-md hover:bg-[#2d2d2d]" onClick={() => setRightOpen(!rightOpen)}>
              {rightOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </header>

        {view === "chat" ? (
          <ChatSurface
            input={input}
            isSending={isSending}
            messages={messages}
            mode={mode}
            modeLabel={modeCopy[mode]}
            scrollRef={scrollRef}
            selectedPreset={selectedPreset}
            modelPresetId={modelPresetId}
            setModelPresetId={setModelPresetId}
            modelPresets={modelPresets}
            currentLlmModel={currentLlmModel}
            liveTokenCount={liveTokenCount}
            setInput={setInput}
            sendMessage={sendMessage}
            stopRun={stopRun}
            approveMessage={approveMessage}
            saveLastAssistantMessage={saveLastAssistantMessage}
            reasoningLog={reasoningLog}
            showReasoning={showReasoning}
            setShowReasoning={setShowReasoning}
            runSteps={runSteps}
          />
        ) : null}

        {view === "library" ? <LibraryPanel items={libraryItems} refreshLibrary={refreshLibrary} loadThread={loadThread} setView={setView} /> : null}
        {view === "email" ? <EmailPanel status={emailStatus} messages={emailMessages} connectGoogle={connectGoogle} refreshEmail={refreshEmail} /> : null}
        {view === "canvas" ? <CanvasPanel /> : null}
        {view === "connections" ? (
          <ConnectionsPanel
            connectionNotice={connectionNotice}
            connections={connections}
            connectGoogle={connectGoogle}
            refreshConnections={refreshConnections}
            onLlmModelChange={setCurrentLlmModel}
          />
        ) : null}
        {view === "tokens" ? (
          <TokensPanel data={tokenStats} refresh={refreshTokens} />
        ) : null}
        {view === "kanban" ? (
          <KanbanPanel
            items={kanbanItems}
            isSending={isSending}
            onStatusChange={(id, status) => {
              const updated = kanbanItems.map((i) => i.id === id ? { ...i, status } : i);
              void saveKanban(updated);
            }}
            onAdd={(title) => {
              const item: KanbanItem = { id: crypto.randomUUID(), title, status: "todo", priority: "medium", created_at: new Date().toISOString() };
              void saveKanban([...kanbanItems, item]);
            }}
            onDelete={(id) => void saveKanban(kanbanItems.filter((i) => i.id !== id))}
          />
        ) : null}
        {view === "skills" ? (
          <SkillsPanel activateWorkspaceSkill={activateWorkspaceSkill} skills={skills} workspaceSkills={workspaceSkills} />
        ) : null}
      </section>

      {rightOpen ? (
        <RunInspector
          mode={mode}
          model={selectedPreset}
          runId={runId}
          runtime={runtime}
          sources={sources}
          steps={runSteps}
          toolEvents={toolEvents}
          skills={skills}
          workspaceSkills={workspaceSkills}
          activateWorkspaceSkill={activateWorkspaceSkill}
        />
      ) : null}
    </main>
  );
}

function ChatSurface({
  input,
  isSending,
  messages,
  mode,
  modeLabel,
  scrollRef,
  selectedPreset,
  modelPresetId,
  setModelPresetId,
  modelPresets,
  currentLlmModel,
  liveTokenCount,
  setInput,
  sendMessage,
  stopRun,
  approveMessage,
  saveLastAssistantMessage,
  reasoningLog,
  showReasoning,
  setShowReasoning,
  runSteps
}: {
  input: string;
  isSending: boolean;
  messages: ChatMessage[];
  mode: Mode;
  modeLabel: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  selectedPreset?: ModelPreset;
  modelPresetId: ModelPresetId;
  setModelPresetId: (value: ModelPresetId) => void;
  modelPresets: ModelPreset[];
  currentLlmModel: { provider: string; model: string } | null;
  liveTokenCount: number;
  setInput: (value: string) => void;
  sendMessage: (event: React.FormEvent<HTMLFormElement>) => void;
  stopRun: () => void;
  approveMessage: (approvalId: string, messageId: string) => void;
  saveLastAssistantMessage: () => void;
  reasoningLog: string[];
  showReasoning: boolean;
  setShowReasoning: (value: boolean) => void;
  runSteps: RunStep[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bot size={16} className="text-[#2dd4bf]" />
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#555]">
                {currentLlmModel?.provider === "openrouter" ? "OR" : currentLlmModel?.provider === "nvidia-nim" ? "NIM" : "AI"} ·
              </span>
              {modelPresets.length > 0 ? (
                <select
                  value={modelPresetId}
                  onChange={(e) => setModelPresetId(e.target.value as ModelPresetId)}
                  className="bg-transparent text-[10px] text-[#2dd4bf] focus:outline-none cursor-pointer max-w-[150px] truncate"
                >
                  {modelPresets.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#2d2d2d] text-[#ececec]">
                      {(p as unknown as { name?: string }).name ?? p.model?.split("/").pop() ?? p.id}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] text-[#2dd4bf]">{currentLlmModel?.model?.split("/").pop() ?? "default"}</span>
              )}
            </div>
            {liveTokenCount > 0 && (
              <span className="text-[9px] text-[#555]">{liveTokenCount.toLocaleString()} tokens this run</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reasoningLog.length > 0 && (
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d]"
            >
              <Brain size={14} />
              {showReasoning ? "Hide Brain" : "Show Brain"}
            </button>
          )}
          <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d]" onClick={saveLastAssistantMessage}>
            <Save size={13} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} approveMessage={approveMessage} />
        ))}
        {isSending ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-[#9b9b9b]">
              <Clock3 size={14} className="animate-pulse text-[#2dd4bf]" />
              The PVTLST is working...
            </div>
            {runSteps.filter(s => s.type === "tool.completed").slice(-3).map((s) => (
              <div key={s.id} className="ml-5 flex items-center gap-1.5 text-[11px] text-[#555]">
                <span className="text-[#2dd4bf]" style={{ fontSize: 10 }}>✓</span>
                <span className="truncate">{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {showReasoning && reasoningLog.length > 0 && (
        <div className="shrink-0 border-t border-[rgba(255,255,255,0.08)] bg-[#111] flex flex-col" style={{ maxHeight: "200px" }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#2dd4bf] font-mono uppercase tracking-widest">
              <Brain size={11} />
              Agent Reasoning
            </div>
            <button
              onClick={() => setShowReasoning(false)}
              className="rounded p-0.5 text-[#555] hover:text-[#9b9b9b]"
            >
              <X size={12} />
            </button>
          </div>
          <div className="overflow-y-auto px-3 py-2 space-y-0.5">
            {reasoningLog.map((step, i) => (
              <p key={i} className="font-mono text-[11px] leading-4 whitespace-pre-wrap" style={{
                color: step.startsWith("→") ? "#2dd4bf" : step.includes("✓") ? "#6ee7b7" : step.includes("⏸") ? "#fbbf24" : "#9b9b9b"
              }}>
                {step}
              </p>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={sendMessage} className="shrink-0 border-t border-[rgba(255,255,255,0.08)] bg-[#242424] p-2">
        <div className="flex items-end gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-1.5 focus-within:border-[#2dd4bf] focus-within:shadow-[0_0_0_2px_rgba(45,212,191,0.3)] transition-all">
          <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-[#3d3d3d]">
            <Paperclip size={14} className="text-[#9b9b9b]" />
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="max-h-28 min-h-7 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm leading-5 outline-none"
            placeholder={isSending ? "Agent is working…" : "Type your message…"}
            disabled={isSending}
          />
          {isSending ? (
            <button type="button" onClick={stopRun} className="grid size-7 shrink-0 place-items-center rounded-md bg-[#3d3d3d] text-[#ececec]">
              <Square size={12} />
            </button>
          ) : (
            <button className="grid size-7 shrink-0 place-items-center rounded-md text-[#2dd4bf] hover:bg-[#2d2d2d]">
              <Send size={14} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  approveMessage,
  message
}: {
  approveMessage: (approvalId: string, messageId: string) => void;
  message: ChatMessage;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [showToolOutput, setShowToolOutput] = useState(false);

  // Render system/progress messages inline with different styles based on type
  if (isSystem) {
    const getProgressStyle = () => {
      switch (message.progressType) {
        case "api_call":
          return "border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.05)] text-[#60a5fa]";
        case "token_usage":
          return "border-[rgba(168,85,247,0.2)] bg-[rgba(168,85,247,0.05)] text-[#a78bfa]";
        case "tool":
          return "border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.05)] text-[#4ade80]";
        case "reasoning":
          return "border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.05)] text-[#fbbf24]";
        default:
          return "border-[rgba(45,212,191,0.15)] bg-[rgba(45,212,191,0.05)] text-[#9b9b9b]";
      }
    };

    return (
      <div className="flex justify-start">
        <div className={cn(
          "max-w-[min(700px,85%)] rounded-md border px-3 py-1.5 text-xs leading-5",
          getProgressStyle()
        )}>
          {message.content}
          {message.metadata?.latency && (
            <span className="ml-2 opacity-60">({message.metadata.latency})</span>
          )}
          {message.metadata?.toolOutput && (
            <>
              <button
                onClick={() => setShowToolOutput(!showToolOutput)}
                className="ml-2 text-[10px] text-[#9b9b9b] hover:text-[#ececec] underline"
              >
                {showToolOutput ? "Hide" : "Show"} details
              </button>
              {showToolOutput && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded bg-[#1a1a1a] p-2 text-[10px] font-mono text-[#9b9b9b]">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(message.metadata.toolOutput, null, 2)}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(700px,85%)] rounded-md px-3 py-2 text-sm leading-6",
          isUser
            ? "bg-[#2d2d2d] text-[#ececec]"
            : "bg-[#242424] text-[#ececec]"
        )}
      >
        {!isUser && message.toolEvents && message.toolEvents.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolEvents.map((evt, i) => (
              <span key={i} className="inline-flex items-center rounded-full bg-[#2d2d2d] px-2 py-0.5 text-[10px] text-[#9b9b9b]">
                {humanizeToolName(evt.tool_name)}
              </span>
            ))}
          </div>
        ) : null}
        {!isUser && message.toolEvents?.some((e) => e.tool_name === "delegate_task") ? (
          <div className="mb-2 rounded-md border border-[rgba(45,212,191,0.2)] bg-[rgba(45,212,191,0.05)] px-2 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#2dd4bf]">⚡ Worker spawned</p>
            <p className="mt-0.5 text-[10px] text-[#9b9b9b]">
              {String(message.toolEvents.find((e) => e.tool_name === "delegate_task")?.input?.task ?? "Delegated subtask completed")}
            </p>
          </div>
        ) : null}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.sources?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.sources.slice(0, 3).map((source) => (
              <a key={source.url} className="rounded-md bg-[#2d2d2d] px-2 py-1 text-xs text-[#2dd4bf]" href={source.url} target="_blank">
                {source.title}
              </a>
            ))}
          </div>
        ) : null}
        {!isUser && message.approvalId ? (
          <div className="mt-3 rounded-md border border-[rgba(45,212,191,0.3)] bg-[rgba(45,212,191,0.1)] p-2">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#2dd4bf]">Approval required</p>
            <p className="mt-1 text-xs text-[#ececec]/80">This action will only run after you approve it.</p>
            <button
              type="button"
              disabled={message.approvalStatus === "pending" || message.approvalStatus === "sent"}
              onClick={() => approveMessage(message.approvalId!, message.id)}
              className="mt-2 rounded-md bg-[#2dd4bf] px-3 py-1.5 text-xs font-medium text-[#1a1a1a] hover:bg-[#2dd4bf]/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {message.approvalStatus === "sent"
                ? "✓ Sent"
                : message.approvalStatus === "pending"
                  ? "Sending..."
                  : message.approvalStatus === "failed"
                    ? "Failed — try again"
                    : "Approve and send"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RunInspector({
  mode,
  model,
  runId,
  runtime,
  sources,
  steps,
  toolEvents,
  skills,
  workspaceSkills,
  activateWorkspaceSkill
}: {
  mode: Mode;
  model?: ModelPreset;
  runId: string | null;
  runtime: Record<string, unknown>;
  sources: AgentSource[];
  steps: RunStep[];
  toolEvents: AgentToolEvent[];
  skills: AgenticSkill[];
  workspaceSkills: WorkspaceSkill[];
  activateWorkspaceSkill: (skillId: string) => Promise<void>;
}) {
  return (
    <aside className="hidden h-full w-80 shrink-0 overflow-y-auto border-l border-[rgba(255,255,255,0.08)] bg-[#242424] p-3 xl:block">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-[#9b9b9b]">Run inspector</p>
          <h2 className="mt-1 text-sm font-medium">{mode.toUpperCase()}</h2>
        </div>
        <Wrench size={16} className="text-[#2dd4bf]" />
      </div>

      <div className="mt-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
        <p className="text-sm font-medium">{model?.label ?? "Default"}</p>
        <p className="mt-1 break-all text-xs text-[#9b9b9b]">{model?.model ?? String(runtime.model ?? "env default")}</p>
        <p className="mt-2 text-xs text-[#9b9b9b]">Tool calling: {model?.toolCalling ?? "runtime"}</p>
      </div>

      <InspectorSection title="Progress">
        {steps.length ? (
          steps.map((step) => <StepRow key={step.id} step={step} />)
        ) : (
          <EmptyLine text="No active run" />
        )}
      </InspectorSection>

      <InspectorSection title="Tools">
        {toolEvents.length ? (
          toolEvents.map((event, index) => (
            <div key={`${event.tool_name}-${index}`} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{humanizeToolName(event.tool_name)}</p>
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[10px]",
                  event.status === "completed" ? "bg-[#2dd4bf]/20 text-[#2dd4bf]" :
                  event.status === "failed" ? "bg-red-500/20 text-red-400" :
                  event.status === "requires_approval" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-[#3d3d3d] text-[#9b9b9b]"
                )}>{event.status}</span>
              </div>
              <p className="mt-1 text-xs text-[#9b9b9b]">{event.tool_category}</p>
              {event.tool_name === "delegate_task" && event.input ? (
                <p className="mt-1.5 truncate text-[10px] text-[#2dd4bf]">Task: {String(event.input.task || "Delegated work")}</p>
              ) : null}
              {event.tool_name === "skills_list" || event.tool_name === "skill_view" || event.tool_name === "skill_manage" ? (
                <p className="mt-1.5 text-[10px] text-[#2dd4bf]">Skill operation</p>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyLine text="No tools used yet" />
        )}
      </InspectorSection>

      <InspectorSection title="Sources">
        {sources.length ? (
          sources.slice(0, 5).map((source) => (
            <a key={source.url} href={source.url} target="_blank" className="block rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-2 hover:bg-[#3d3d3d]">
              <p className="line-clamp-2 text-xs">{source.title}</p>
              <p className="mt-1 truncate text-[10px] text-[#9b9b9b]">{source.url}</p>
            </a>
          ))
        ) : (
          <EmptyLine text="No sources attached" />
        )}
      </InspectorSection>

      <InspectorSection title="Skills">
        <div className="space-y-2">
          {skills.filter(s => s.status === "active" || s.status === "partial").map((skill) => {
            const wsSkill = workspaceSkills.find(ws => ws.name.toLowerCase() === skill.name.toLowerCase());
            const isActive = wsSkill?.status === "active";
            return (
              <button
                key={skill.id}
                onClick={() => wsSkill && !isActive ? void activateWorkspaceSkill(wsSkill.id) : undefined}
                disabled={isActive || !wsSkill}
                title={!wsSkill ? "Ask the agent to create this skill procedure first" : undefined}
                className={cn(
                  "w-full rounded-md border p-2 text-left transition-colors",
                  isActive
                    ? "border-[#2dd4bf]/30 bg-[#2dd4bf]/10"
                    : wsSkill
                    ? "border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] hover:border-[rgba(255,255,255,0.15)]"
                    : "border-[rgba(255,255,255,0.04)] bg-[#1e1e1e] opacity-60"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium">{skill.name}</p>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    isActive ? "bg-[#2dd4bf]/20 text-[#2dd4bf]" :
                    wsSkill ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-[#3d3d3d] text-[#555]"
                  )}>{isActive ? "Active" : wsSkill ? "Inactive" : "Not created"}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] text-[#9b9b9b]">{skill.description}</p>
              </button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorSection title="Runtime">
        <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-2 text-xs leading-5 text-[#9b9b9b]">
          <p>Run: {runId ?? "none"}</p>
          <p>Engine: The PVTLST (Hermes v0.14)</p>
        </div>
      </InspectorSection>
    </aside>
  );
}

function LibraryPanel({ items, refreshLibrary, loadThread, setView }: { items: LibraryItem[]; refreshLibrary: (type?: string) => void; loadThread: (id: string) => void; setView: (view: View) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const filters = ["all", "response", "web_result", "document", "image", "file", "link", "note"];

  const filteredItems = items.filter((item) => {
    const matchesType = selectedType === "all" || item.type === selectedType;
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.content?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ?? false);
    return matchesType && matchesSearch;
  });

  const handleTypeFilter = (type: string) => {
    setSelectedType(type);
    refreshLibrary(type === "all" ? undefined : type);
  };

  const handleCopyContent = () => {
    if (selectedItem?.content) {
      navigator.clipboard.writeText(selectedItem.content);
    }
  };

  const handleOpenThread = () => {
    if (selectedItem?.thread_id) {
      loadThread(selectedItem.thread_id);
      setView("chat");
      setSelectedItem(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem?.id) return;
    try {
      const response = await fetch(`/api/library/${selectedItem.id}`, { method: "DELETE" });
      if (response.ok) {
        refreshLibrary(selectedType === "all" ? undefined : selectedType);
        setSelectedItem(null);
      }
    } catch (error) {
      console.error("Failed to delete library item:", error);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9b9b]" />
          <input
            type="text"
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] pl-9 pr-3 py-2 text-xs text-[#ececec] placeholder:text-[#555] focus:border-[#2dd4bf] focus:outline-none"
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <button 
            key={filter} 
            onClick={() => handleTypeFilter(filter)} 
            className={cn(
              "rounded-md border px-2 py-1 text-xs capitalize transition-colors",
              selectedType === filter 
                ? "border-[#2dd4bf] bg-[rgba(45,212,191,0.1)] text-[#2dd4bf]" 
                : "border-[rgba(255,255,255,0.08)] text-[#9b9b9b] hover:bg-[#2d2d2d]"
            )}
          >
            {filter.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => (
          <div 
            key={item.id} 
            className="cursor-pointer rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3 hover:border-[rgba(45,212,191,0.3)] transition-colors"
            onClick={() => setSelectedItem(item)}
          >
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">{item.type}</p>
            <h2 className="mt-2 line-clamp-2 text-xs font-medium">{item.title}</h2>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#9b9b9b]">{item.content}</p>
          </div>
        ))}
        {!filteredItems.length ? <EmptyState icon={Archive} title="No items found" /> : null}
      </div>

      {/* Library Item Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#242424] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">{selectedItem.title}</h2>
              <button onClick={() => setSelectedItem(null)} className="rounded-md p-1 hover:bg-[#2d2d2d]">
                <X size={16} />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Type</p>
              <p className="mt-1 text-xs">{selectedItem.type}</p>
            </div>
            {selectedItem.tags && selectedItem.tags.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Tags</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedItem.tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-[#3d3d3d] px-2 py-0.5 text-[10px] text-[#9b9b9b]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedItem.metadata && Object.keys(selectedItem.metadata).length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Metadata</p>
                <pre className="mt-2 rounded-md bg-[#1a1a1a] p-3 text-xs text-[#9b9b9b] whitespace-pre-wrap">
                  {JSON.stringify(selectedItem.metadata, null, 2)}
                </pre>
              </div>
            )}
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Content</p>
              <pre className="mt-2 max-h-64 overflow-y-auto rounded-md bg-[#1a1a1a] p-3 text-xs text-[#ececec] whitespace-pre-wrap">
                {selectedItem.content || "No content"}
              </pre>
            </div>
            {selectedItem.created_at && (
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Created</p>
                <p className="mt-1 text-xs">{new Date(selectedItem.created_at).toLocaleString()}</p>
              </div>
            )}
            <div className="flex gap-2">
              {selectedItem.thread_id && (
                <button
                  onClick={handleOpenThread}
                  className="flex-1 rounded-md bg-[#3d3d3d] px-3 py-2 text-xs font-medium text-[#ececec] hover:bg-[#4d4d4d]"
                >
                  Open Thread
                </button>
              )}
              <button
                onClick={handleCopyContent}
                className="flex-1 rounded-md bg-[#3d3d3d] px-3 py-2 text-xs font-medium text-[#ececec] hover:bg-[#4d4d4d]"
              >
                Copy Content
              </button>
              <button
                onClick={handleDeleteItem}
                className="flex-1 rounded-md bg-[rgba(251,113,133,0.15)] px-3 py-2 text-xs font-medium text-[#fb7185] hover:bg-[rgba(251,113,133,0.25)]"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="flex-1 rounded-md bg-[#2dd4bf] px-3 py-2 text-xs font-medium text-[#1a1a1a]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailPanel({
  connectGoogle,
  messages,
  refreshEmail,
  status
}: {
  connectGoogle: () => void;
  messages: EmailMessage[];
  refreshEmail: () => void;
  status: string;
}) {
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"inbox" | "drive">("inbox");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveFilter, setDriveFilter] = useState<"all" | "doc" | "sheet">("all");

  const loadDrive = async () => {
    setDriveLoading(true);
    try {
      const [docsRes, sheetsRes] = await Promise.all([
        fetch("/api/google/docs/list"),
        fetch("/api/google/sheets/list")
      ]);
      const docsData = docsRes.ok ? (await docsRes.json() as { documents?: { id: string; name: string; webViewLink: string; modifiedTime?: string }[] }) : { documents: [] };
      const sheetsData = sheetsRes.ok ? (await sheetsRes.json() as { spreadsheets?: { id: string; name: string; webViewLink: string; modifiedTime?: string }[] }) : { spreadsheets: [] };
      const docs: DriveFile[] = (docsData.documents ?? []).map((d) => ({ ...d, type: "doc" as const }));
      const sheets: DriveFile[] = (sheetsData.spreadsheets ?? []).map((s) => ({ ...s, type: "sheet" as const }));
      setDriveFiles([...docs, ...sheets].sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setDriveLoading(false);
    }
  };

  const filteredMessages = messages.filter((msg) =>
    msg.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    msg.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
    msg.snippet.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const visibleDriveFiles = driveFiles.filter((f) => driveFilter === "all" || f.type === driveFilter);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-2">
        <div className="flex items-center gap-1">
          {(["inbox", "drive"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === "drive" && driveFiles.length === 0) void loadDrive(); }}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                activeTab === tab ? "bg-[#2dd4bf] text-[#1a1a1a]" : "text-[#9b9b9b] hover:bg-[#2d2d2d]"
              )}
            >
              {tab === "inbox" ? <Inbox size={13} /> : <HardDrive size={13} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === "inbox" && messages.length > 0 && (
                <span className="rounded-full bg-[rgba(45,212,191,0.2)] px-1.5 py-0.5 text-[10px] text-[#2dd4bf]">{messages.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {activeTab === "inbox" ? (
            <>
              <button onClick={refreshEmail} className="rounded-md border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d] transition-colors">Refresh</button>
              <button onClick={connectGoogle} className="rounded-md bg-[#2dd4bf] px-3 py-1.5 text-xs font-medium text-[#1a1a1a]">Connect Google</button>
            </>
          ) : (
            <button onClick={loadDrive} className="rounded-md border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d] transition-colors">
              {driveLoading ? "Loading..." : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {activeTab === "drive" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-2">
            {(["all", "doc", "sheet"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setDriveFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  driveFilter === f ? "bg-[#2d2d2d] text-[#ececec]" : "text-[#555] hover:text-[#9b9b9b]"
                )}
              >
                {f === "all" ? "All Files" : f === "doc" ? "📄 Docs" : "📊 Sheets"}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[#555]">{visibleDriveFiles.length} files</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {driveLoading ? (
              <div className="flex items-center gap-2 p-4 text-xs text-[#555]">
                <Zap size={13} className="animate-pulse text-[#2dd4bf]" />
                Loading Drive files...
              </div>
            ) : visibleDriveFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <HardDrive size={36} className="text-[#3d3d3d]" />
                <p className="mt-3 text-xs text-[#9b9b9b]">No files found. Connect Google and click Refresh.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {visibleDriveFiles.map((file) => (
                  <a
                    key={file.id}
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#2d2d2d] p-3 hover:border-[rgba(45,212,191,0.3)] transition-colors group"
                  >
                    <span className="text-lg">{file.type === "doc" ? "📄" : "📊"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[#ececec]">{file.name}</p>
                      <p className="mt-0.5 text-[10px] text-[#555]">{file.type === "doc" ? "Google Doc" : "Google Sheet"}</p>
                    </div>
                    <ExternalLink size={12} className="shrink-0 text-[#555] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        {/* Message List */}
        <div className="flex w-80 shrink-0 flex-col border-r border-[rgba(255,255,255,0.08)]">
          <div className="shrink-0 border-b border-[rgba(255,255,255,0.08)] p-3">
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] px-3 py-2 text-xs outline-none focus:border-[#2dd4bf] transition-colors"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredMessages.map((message) => (
              <button
                key={message.id}
                onClick={() => setSelectedMessage(message)}
                className={cn(
                  "w-full border-b border-[rgba(255,255,255,0.05)] px-4 py-3 text-left transition-colors hover:bg-[#2d2d2d]",
                  selectedMessage?.id === message.id && "bg-[#2d2d2d] border-l-2 border-l-[#2dd4bf]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[#ececec]">{message.subject}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#9b9b9b]">{message.from}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-[#9b9b9b]">{message.date}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] text-[#9b9b9b]">{message.snippet}</p>
              </button>
            ))}
            {!filteredMessages.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail size={32} className="text-[#3d3d3d]" />
                <p className="mt-3 text-xs text-[#9b9b9b]">
                  {searchQuery ? "No emails match your search" : "No emails loaded"}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Message Detail */}
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedMessage ? (
            <>
              <div className="shrink-0 border-b border-[rgba(255,255,255,0.08)] px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-[#ececec]">{selectedMessage.subject}</h2>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2d2d2d]">
                        <UserCircle size={16} className="text-[#9b9b9b]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-[#ececec]">{selectedMessage.from}</p>
                        <p className="text-[10px] text-[#9b9b9b]">{selectedMessage.date}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="rounded-md border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d] transition-colors">
                      Reply
                    </button>
                    <button className="rounded-md border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d] transition-colors">
                      Forward
                    </button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="prose prose-invert prose-sm max-w-none">
                  <p className="text-sm text-[#ececec] leading-relaxed whitespace-pre-wrap">{selectedMessage.snippet}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <Mail size={48} className="text-[#3d3d3d]" />
              <p className="mt-4 text-sm text-[#9b9b9b]">Select an email to view</p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function ConnectionsPanel({
  connectGoogle,
  connectionNotice,
  connections,
  refreshConnections,
  onLlmModelChange
}: {
  connectGoogle: () => void;
  connectionNotice: string | null;
  connections: Connection[];
  refreshConnections: () => void;
  onLlmModelChange: (model: { provider: string; model: string } | null) => void;
}) {
  const [llmProvider, setLlmProvider] = useState<"openrouter" | "nvidia-nim">("openrouter");
  const [llmModel, setLlmModel] = useState("nvidia/nemotron-3-super-120b-a12b:free");
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [openrouterModels, setOpenrouterModels] = useState<{ id: string; name: string; pricing?: any }[]>([]);
  const [nvidiaModels, setNvidiaModels] = useState<{ id: string; name: string }[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentLlmModel, setCurrentLlmModel] = useState<{ provider: string; model: string } | null>(null);
  const [toolsetCatalog, setToolsetCatalog] = useState<any[]>([]);
  const [browserProvider, setBrowserProvider] = useState<"browserbase" | "browser_use">("browserbase");
  const [browserbaseApiKey, setBrowserbaseApiKey] = useState("");
  const [browserbaseProjectId, setBrowserbaseProjectId] = useState("");
  const [browserUseApiKey, setBrowserUseApiKey] = useState("");
  const [browserUsage, setBrowserUsage] = useState<any>(null);

  const google = connections.find((connection) => connection.provider === "google");
  const providers = [
    { name: "Google Workspace", status: google?.status ?? "not_connected", account: google?.provider_account_id },
    { name: "Slack", status: "planned", account: null },
    { name: "Notion", status: "planned", account: null },
    { name: "CRM", status: "planned", account: null }
  ];

  const currentModels = llmProvider === "openrouter" ? openrouterModels : nvidiaModels;

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/workspace/tools");
        if (response.ok) {
          const data = await response.json();
          if (data.llmSettings) {
            setLlmProvider(data.llmSettings.provider || "openrouter");
            setLlmModel(data.llmSettings.model || "nvidia/nemotron-3-super-120b-a12b:free");
            setCurrentLlmModel({
              provider: data.llmSettings.provider || "openrouter",
              model: data.llmSettings.model || "nvidia/nemotron-3-super-120b-a12b:free"
            });
          }
          if (data.catalog) {
            setToolsetCatalog(data.catalog);
            // Load browser settings
            const browserTool = data.catalog.find((t: any) => t.name === "browser");
            if (browserTool) {
              setBrowserProvider(browserTool.browserProvider || "browserbase");
            }
          }
        }
        // Load browser usage
        const usageResponse = await fetch("/api/browser/limits");
        if (usageResponse.ok) {
          const usageData = await usageResponse.json();
          setBrowserUsage(usageData);
        }
      } catch (error) {
        console.error("Failed to load LLM settings:", error);
      } finally {
        setLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  // Fetch OpenRouter models when provider is selected
  useEffect(() => {
    if (llmProvider === "openrouter" && openrouterModels.length === 0) {
      fetchOpenrouterModels();
    }
  }, [llmProvider]);

  // Fetch NVIDIA NIM models when provider is selected
  useEffect(() => {
    if (llmProvider === "nvidia-nim" && nvidiaModels.length === 0) {
      fetchNvidiaModels();
    }
  }, [llmProvider]);

  const fetchOpenrouterModels = async () => {
    setFetchingModels(true);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (response.ok) {
        const data = await response.json();
        const models = data.data?.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          pricing: m.pricing
        })) || [];
        setOpenrouterModels(models);
      }
    } catch (error) {
      console.error("Failed to fetch OpenRouter models:", error);
      // Fallback to hardcoded models
      setOpenrouterModels([
        { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 120B (Free)" },
        { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
        { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
        { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5" }
      ]);
    } finally {
      setFetchingModels(false);
    }
  };

  const fetchNvidiaModels = async () => {
    setFetchingModels(true);
    try {
      const response = await fetch("/api/workspace/tools/nvidia-models");
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => ({
          id: m.id,
          name: m.id
        })) || [];
        setNvidiaModels(models);
      }
    } catch (error) {
      console.error("Failed to fetch NVIDIA models:", error);
      // Fallback to hardcoded models
      setNvidiaModels([
        { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
        { id: "meta/llama-3.1-405b-instruct", name: "Llama 3.1 405B" },
        { id: "mistralai/mistral-large", name: "Mistral Large" }
      ]);
    } finally {
      setFetchingModels(false);
    }
  };

  const saveLlmSettings = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/workspace/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolset: "llm_settings",
          provider: llmProvider,
          model: llmModel
        })
      });
      if (response.ok) {
        setCurrentLlmModel({ provider: llmProvider, model: llmModel });
        alert("LLM settings saved!");
      } else {
        const error = await response.text();
        setSaveError(error);
        alert("Failed to save: " + error);
      }
    } catch (error) {
      console.error("Failed to save LLM settings:", error);
      setSaveError("Network error");
      alert("Failed to save: Network error");
    } finally {
      setSaving(false);
    }
  };

  const saveBrowserSettings = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/workspace/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolset: "browser",
          enabled: true,
          browserProvider,
          browserbaseApiKey: browserProvider === "browserbase" ? browserbaseApiKey : undefined,
          browserbaseProjectId: browserProvider === "browserbase" ? browserbaseProjectId : undefined,
          browserUseApiKey: browserProvider === "browser_use" ? browserUseApiKey : undefined
        })
      });
      if (response.ok) {
        alert("Browser settings saved!");
        // Refresh catalog to update configured status
        const catalogResponse = await fetch("/api/workspace/tools");
        if (catalogResponse.ok) {
          const data = await catalogResponse.json();
          if (data.catalog) setToolsetCatalog(data.catalog);
        }
      } else {
        const error = await response.text();
        setSaveError(error);
        alert("Failed to save: " + error);
      }
    } catch (error) {
      console.error("Failed to save browser settings:", error);
      setSaveError("Network error");
      alert("Failed to save: Network error");
    } finally {
      setSaving(false);
    }
  };

  const toggleToolset = async (toolsetName: string, enabled: boolean) => {
    try {
      const response = await fetch("/api/workspace/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolset: toolsetName, enabled })
      });
      if (response.ok) {
        setToolsetCatalog(prev => prev.map(t => t.name === toolsetName ? { ...t, enabled } : t));
      } else {
        alert("Failed to toggle toolset");
      }
    } catch (error) {
      console.error("Failed to toggle toolset:", error);
      alert("Network error");
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {connectionNotice ? (
        <div className="mb-3 rounded-md border border-[rgba(45,212,191,0.3)] bg-[rgba(45,212,191,0.1)] p-3 text-xs text-[#ececec]">
          <p className="font-medium">Google connection needs setup</p>
          <p className="mt-1 text-[#ececec]/80">{connectionNotice}</p>
        </div>
      ) : null}

      {/* LLM Provider Settings */}
      <div className="mb-4 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
        <div className="flex items-center gap-2">
          <Bot className="text-[#2dd4bf]" size={18} />
          <h2 className="text-xs font-medium">LLM Provider</h2>
        </div>
        
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] text-[#9b9b9b]">Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value as "openrouter" | "nvidia-nim")}
              className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] focus:border-[#2dd4bf] focus:outline-none"
            >
              <option value="openrouter">OpenRouter (300+ models)</option>
              <option value="nvidia-nim">NVIDIA NIM</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-[#9b9b9b]">Model</label>
            {((llmProvider === "nvidia-nim" && nvidiaModels.length === 0) || (llmProvider === "openrouter" && openrouterModels.length === 0)) && !fetchingModels ? (
              <button
                onClick={llmProvider === "nvidia-nim" ? fetchNvidiaModels : fetchOpenrouterModels}
                className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] hover:border-[#2dd4bf] focus:border-[#2dd4bf] focus:outline-none"
              >
                Load {llmProvider === "nvidia-nim" ? "NVIDIA" : "OpenRouter"} Models
              </button>
            ) : (
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                disabled={fetchingModels || loadingSettings}
                className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] focus:border-[#2dd4bf] focus:outline-none disabled:opacity-50"
              >
                {fetchingModels ? (
                  <option>Loading models...</option>
                ) : currentModels.length === 0 ? (
                  <option>No models available</option>
                ) : (
                  currentModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                )}
              </select>
            )}
          </div>

          <button
            onClick={saveLlmSettings}
            disabled={saving}
            className="w-full rounded-md bg-[#2dd4bf] px-2 py-1.5 text-xs font-medium text-[#1a1a1a] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider) => (
          <div key={provider.name} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
            <UserCircle className="text-[#2dd4bf]" size={18} />
            <h2 className="mt-3 text-xs font-medium">{provider.name}</h2>
            <p className="mt-1 text-[10px] text-[#9b9b9b]">{provider.account ?? provider.status}</p>
            {provider.name === "Google Workspace" ? (
              <button onClick={connectGoogle} className="mt-3 rounded-md bg-[#2dd4bf] px-2 py-1 text-xs font-medium text-[#1a1a1a]">
                {google ? "Reconnect" : "Connect"}
              </button>
            ) : (
              <button className="mt-3 rounded-md border border-[rgba(255,255,255,0.08)] px-2 py-1 text-xs text-[#9b9b9b]">Queued</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={refreshConnections} className="mt-3 rounded-md border border-[rgba(255,255,255,0.08)] px-3 py-1 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d]">
        Refresh connections
      </button>

      {/* Toolsets */}
      <div className="mt-4 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
        <div className="flex items-center gap-2">
          <Wrench className="text-[#2dd4bf]" size={18} />
          <h2 className="text-xs font-medium">Toolsets</h2>
        </div>
        
        <div className="mt-3 space-y-2">
          {toolsetCatalog.map((tool) => (
            <div key={tool.name} className="flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.05)] bg-[#1a1a1a] p-2">
              <div className="flex-1">
                <p className="text-xs font-medium text-[#ececec]">{tool.display}</p>
                <p className="mt-0.5 text-[10px] text-[#9b9b9b]">{tool.description}</p>
              </div>
              <button
                onClick={() => toggleToolset(tool.name, !tool.enabled)}
                className={cn(
                  "ml-2 rounded-md px-2 py-1 text-xs font-medium",
                  tool.enabled
                    ? "bg-[#2dd4bf] text-[#1a1a1a]"
                    : "border border-[rgba(255,255,255,0.08)] text-[#9b9b9b] hover:bg-[#2d2d2d]"
                )}
              >
                {tool.enabled ? "Enabled" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Browser Configuration */}
      <div className="mt-4 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
        <div className="flex items-center gap-2">
          <Globe className="text-[#2dd4bf]" size={18} />
          <h2 className="text-xs font-medium">Browser Automation</h2>
        </div>

        {browserUsage && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-[rgba(255,255,255,0.05)] bg-[#1a1a1a] p-2">
            <div>
              <p className="text-[10px] text-[#9b9b9b]">Sessions Today</p>
              <p className="text-xs font-medium text-[#ececec]">{browserUsage.usage?.sessions_today || 0} / {browserUsage.limits?.max_sessions_per_day || 50}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9b9b9b]">Cost This Month</p>
              <p className="text-xs font-medium text-[#ececec]">${(browserUsage.usage?.cost_this_month || 0).toFixed(2)} / ${browserUsage.limits?.max_cost_per_month_usd || 100}</p>
            </div>
          </div>
        )}
        
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] text-[#9b9b9b]">Provider</label>
            <select
              value={browserProvider}
              onChange={(e) => setBrowserProvider(e.target.value as "browserbase" | "browser_use")}
              className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] focus:border-[#2dd4bf] focus:outline-none"
            >
              <option value="browserbase">Browserbase (recommended)</option>
              <option value="browser_use">Browser Use</option>
            </select>
          </div>

          {browserProvider === "browserbase" ? (
            <>
              <div>
                <label className="mb-1 block text-[10px] text-[#9b9b9b]">API Key</label>
                <input
                  type="password"
                  value={browserbaseApiKey}
                  onChange={(e) => setBrowserbaseApiKey(e.target.value)}
                  placeholder="Enter Browserbase API key"
                  className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] focus:border-[#2dd4bf] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[#9b9b9b]">Project ID</label>
                <input
                  type="text"
                  value={browserbaseProjectId}
                  onChange={(e) => setBrowserbaseProjectId(e.target.value)}
                  placeholder="Enter Browserbase Project ID"
                  className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] focus:border-[#2dd4bf] focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-[10px] text-[#9b9b9b]">API Key</label>
              <input
                type="password"
                value={browserUseApiKey}
                onChange={(e) => setBrowserUseApiKey(e.target.value)}
                placeholder="Enter Browser Use API key"
                className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ececec] focus:border-[#2dd4bf] focus:outline-none"
              />
            </div>
          )}

          <button
            onClick={saveBrowserSettings}
            disabled={saving}
            className="w-full rounded-md bg-[#2dd4bf] px-2 py-1.5 text-xs font-medium text-[#1a1a1a] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Browser Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CanvasPanel() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {["Prompt", "Response", "Media", "Decision", "Task", "Research"].map((item) => (
          <div key={item} className="min-h-40 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
            <Layers3 className="text-[#2dd4bf]" size={16} />
            <h2 className="mt-3 text-xs font-medium">{item}</h2>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillsPanel({
  activateWorkspaceSkill,
  skills,
  workspaceSkills
}: {
  activateWorkspaceSkill: (skillId: string) => Promise<void>;
  skills: AgenticSkill[];
  workspaceSkills: WorkspaceSkill[];
}) {
  const [reviewingSkill, setReviewingSkill] = useState<WorkspaceSkill | null>(null);
  const [viewingVersions, setViewingVersions] = useState<WorkspaceSkill | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = ["all", ...Array.from(new Set(workspaceSkills.map(s => s.category)))];

  const pendingSkills = workspaceSkills.filter(s => 
    s.status === "needs_review" &&
    (selectedCategory === "all" || s.category === selectedCategory) &&
    (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const activeSkills = workspaceSkills.filter(s => 
    s.status === "active" &&
    (selectedCategory === "all" || s.category === selectedCategory) &&
    (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const loadVersions = async (skill: WorkspaceSkill) => {
    setViewingVersions(skill);
    const response = await fetch(`/api/skills/versions?skillId=${skill.id}`);
    if (response.ok) {
      const data = await response.json();
      setVersions(data.versions || []);
    }
  };

  const handleRollback = async (version: any) => {
    if (!viewingVersions) return;
    try {
      const response = await fetch("/api/skills/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: viewingVersions.id, body: version.body })
      });
      if (response.ok) {
        setViewingVersions(null);
        setSelectedVersion(null);
        setVersions([]);
        void activateWorkspaceSkill(viewingVersions.id);
      }
    } catch (error) {
      console.error("Failed to rollback skill:", error);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {/* Search and Filter */}
      <div className="mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9b9b]" />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] pl-9 pr-3 py-2 text-xs text-[#ececec] placeholder:text-[#555] focus:border-[#2dd4bf] focus:outline-none"
          />
        </div>
      </div>
      {categories.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs capitalize transition-colors",
                selectedCategory === category
                  ? "border-[#2dd4bf] bg-[rgba(45,212,191,0.1)] text-[#2dd4bf]"
                  : "border-[rgba(255,255,255,0.08)] text-[#9b9b9b] hover:bg-[#2d2d2d]"
              )}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {/* Pending Review Section */}
      {pendingSkills.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#fbbf24]">Pending Review</p>
              <p className="mt-0.5 text-[10px] text-[#9b9b9b]">Skills created by The PVTLST that need your approval.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pendingSkills.map((skill) => (
              <div key={skill.id} className="rounded-md border border-[rgba(251,191,36,0.3)] bg-[#2d2d2d] p-3">
                <Brain className="text-[#fbbf24]" size={16} />
                <div className="mt-2 flex items-start justify-between gap-2">
                  <h2 className="text-xs font-medium">{skill.name}</h2>
                  <span className="rounded bg-[rgba(251,191,36,0.15)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[#fbbf24]">
                    needs_review
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-[#9b9b9b]">{skill.category}</p>
                <p className="mt-2 text-xs text-[#9b9b9b]">{skill.description}</p>
                {skill.version?.body ? <p className="mt-3 line-clamp-2 text-[10px] text-[#9b9b9b]">{skill.version.body}</p> : null}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setReviewingSkill(skill)}
                    className="flex-1 rounded-md bg-[#3d3d3d] px-2 py-1 text-[10px] font-medium text-[#ececec] hover:bg-[#4d4d4d]"
                  >
                    Review
                  </button>
                  <button
                    onClick={() => activateWorkspaceSkill(skill.id)}
                    className="flex-1 rounded-md bg-[#2dd4bf] px-2 py-1 text-[10px] font-medium text-[#1a1a1a]"
                  >
                    Activate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Skills Section */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Active Workspace Skills</p>
            <p className="mt-0.5 text-[10px] text-[#9b9b9b]">Procedures that The PVTLST loads and applies automatically.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activeSkills.map((skill) => (
            <div key={skill.id} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
              <Brain className="text-[#2dd4bf]" size={16} />
              <div className="mt-2 flex items-start justify-between gap-2">
                <h2 className="text-xs font-medium">{skill.name}</h2>
                <span className="rounded bg-[rgba(45,212,191,0.15)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[#2dd4bf]">
                  active
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#9b9b9b]">{skill.category}</p>
              <p className="mt-2 text-xs text-[#9b9b9b]">{skill.description}</p>
              {skill.version?.body ? <p className="mt-3 line-clamp-2 text-[10px] text-[#9b9b9b]">{skill.version.body}</p> : null}
              <button
                onClick={() => loadVersions(skill)}
                className="mt-3 w-full rounded-md bg-[#3d3d3d] px-2 py-1 text-[10px] font-medium text-[#ececec] hover:bg-[#4d4d4d]"
              >
                View Versions
              </button>
            </div>
          ))}
          {!activeSkills.length && !pendingSkills.length ? <EmptyState icon={Brain} title="No workspace skills yet" /> : null}
        </div>
      </div>

      <p className="mb-2 text-xs font-medium">Product Skill Catalog</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {skills.map((skill) => (
          <div key={skill.name} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-3">
            <Brain className="text-[#2dd4bf]" size={16} />
            <div className="mt-2 flex items-start justify-between gap-2">
              <h2 className="text-xs font-medium">{skill.name}</h2>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  skill.status === "active" && "bg-[rgba(45,212,191,0.15)] text-[#2dd4bf]",
                  skill.status === "partial" && "bg-[rgba(45,212,191,0.15)] text-[#2dd4bf]",
                  skill.status === "planned" && "bg-[rgba(251,191,36,0.15)] text-[#fbbf24]",
                  skill.status === "internal" && "bg-[rgba(251,113,133,0.15)] text-[#fb7185]"
                )}
              >
                {skill.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#9b9b9b]">{skill.description}</p>
            <p className="mt-3 text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Safe tools</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(skill.safeTools.length ? skill.safeTools : ["blocked"]).map((tool) => (
                <span key={tool} className="rounded-md bg-[#3d3d3d] px-1.5 py-0.5 text-[10px] text-[#9b9b9b]">
                  {tool}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-[#9b9b9b]">{skill.hermesPattern}</p>
            <p className="mt-2 text-xs text-[#9b9b9b]">{skill.nextStep}</p>
          </div>
        ))}
        {!skills.length ? <EmptyState icon={Brain} title="Skill catalog loading" /> : null}
      </div>

      {/* Review Modal */}
      {reviewingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#242424] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">Review Skill: {reviewingSkill.name}</h2>
              <button onClick={() => setReviewingSkill(null)} className="rounded-md p-1 hover:bg-[#2d2d2d]">
                <X size={16} />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Category</p>
              <p className="mt-1 text-xs">{reviewingSkill.category}</p>
            </div>
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Description</p>
              <p className="mt-1 text-xs">{reviewingSkill.description}</p>
            </div>
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Skill Body</p>
              <pre className="mt-2 rounded-md bg-[#1a1a1a] p-3 text-xs text-[#ececec] whitespace-pre-wrap">
                {reviewingSkill.version?.body || "No content"}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  activateWorkspaceSkill(reviewingSkill.id);
                  setReviewingSkill(null);
                }}
                className="flex-1 rounded-md bg-[#2dd4bf] px-3 py-2 text-xs font-medium text-[#1a1a1a]"
              >
                Activate
              </button>
              <button
                onClick={() => setReviewingSkill(null)}
                className="flex-1 rounded-md bg-[#3d3d3d] px-3 py-2 text-xs font-medium text-[#ececec] hover:bg-[#4d4d4d]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {viewingVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#242424] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">Version History: {viewingVersions.name}</h2>
              <button onClick={() => { setViewingVersions(null); setVersions([]); setSelectedVersion(null); }} className="rounded-md p-1 hover:bg-[#2d2d2d]">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Versions</p>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      onClick={() => setSelectedVersion(version)}
                      className={cn(
                        "cursor-pointer rounded-md border p-2 transition-colors",
                        selectedVersion?.id === version.id
                          ? "border-[#2dd4bf] bg-[rgba(45,212,191,0.1)]"
                          : "border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] hover:border-[rgba(45,212,191,0.3)]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">v{version.version}</span>
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          version.status === "active" && "bg-[rgba(45,212,191,0.15)] text-[#2dd4bf]",
                          version.safety_status === "needs_review" && "bg-[rgba(251,191,36,0.15)] text-[#fbbf24]"
                        )}>
                          {version.safety_status || version.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-[#9b9b9b]">{new Date(version.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                {selectedVersion ? (
                  <>
                    <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[#9b9b9b]">Version v{selectedVersion.version}</p>
                    <pre className="max-h-64 overflow-y-auto rounded-md bg-[#1a1a1a] p-3 text-xs text-[#ececec] whitespace-pre-wrap">
                      {selectedVersion.body}
                    </pre>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleRollback(selectedVersion)}
                        className="flex-1 rounded-md bg-[#2dd4bf] px-3 py-2 text-xs font-medium text-[#1a1a1a]"
                      >
                        Rollback to This
                      </button>
                      <button
                        onClick={() => setSelectedVersion(null)}
                        className="flex-1 rounded-md bg-[#3d3d3d] px-3 py-2 text-xs font-medium text-[#ececec] hover:bg-[#4d4d4d]"
                      >
                        Close
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-[#9b9b9b] text-xs">
                    Select a version to view
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TokensPanel({ data, refresh }: { data: TokenStats | null; refresh: () => void }) {
  const [filter, setFilter] = useState<"all" | "monthly" | "model">("all");

  const totalRuns = data?.total_runs ?? 0;
  const completedRuns = data?.completed_runs ?? 0;
  const totalTokens = data?.total_tokens ?? 0;
  const modelEntries = Object.entries(data?.by_model ?? {}).sort((a, b) => b[1].runs - a[1].runs);
  const monthlyEntries = Object.entries(data?.monthly ?? {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={18} className="text-[#2dd4bf]" />
          <div>
            <p className="text-sm font-medium">Token Usage</p>
            <p className="text-[11px] text-[#9b9b9b]">Lifetime spending across all runs</p>
          </div>
        </div>
        <button onClick={refresh} className="rounded-md border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-[#9b9b9b] hover:bg-[#2d2d2d] transition-colors">
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Credit-card-bill header */}
        <div className="mb-4 rounded-xl border border-[rgba(45,212,191,0.2)] bg-gradient-to-br from-[#1e2a2a] to-[#1a1a1a] p-5">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[#2dd4bf]">The PVTLST · Lifetime Statement</p>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {totalTokens > 0 ? totalTokens.toLocaleString() : "—"}
            <span className="ml-2 text-sm font-normal text-[#555]">tokens</span>
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[rgba(255,255,255,0.06)] pt-4">
            <div>
              <p className="text-[10px] text-[#555]">Total runs</p>
              <p className="mt-0.5 text-lg font-medium tabular-nums">{totalRuns}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#555]">Completed</p>
              <p className="mt-0.5 text-lg font-medium tabular-nums">{completedRuns}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#555]">Avg tokens/run</p>
              <p className="mt-0.5 text-lg font-medium tabular-nums">
                {totalRuns > 0 ? Math.round(totalTokens / totalRuns).toLocaleString() : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mb-3 flex items-center gap-1">
          {(["all", "monthly", "model"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-[#2d2d2d] text-[#ececec]" : "text-[#555] hover:text-[#9b9b9b]"
              )}
            >
              {f === "all" ? "Recent runs" : f === "monthly" ? "Monthly" : "By model"}
            </button>
          ))}
        </div>

        {filter === "model" && (
          <div className="space-y-2">
            {modelEntries.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#555]">No model data yet — run the agent to start tracking.</p>
            ) : modelEntries.map(([model, stats]) => (
              <div key={model} className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#2d2d2d] px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs font-medium text-[#ececec]">{model.split("/").pop() ?? model}</p>
                  <span className="text-[10px] text-[#555]">{stats.runs} runs</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#3d3d3d]">
                    <div
                      className="h-full rounded-full bg-[#2dd4bf]"
                      style={{ width: totalRuns > 0 ? `${(stats.runs / totalRuns) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-[#9b9b9b]">
                    {stats.total_tokens > 0 ? stats.total_tokens.toLocaleString() + " tk" : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filter === "monthly" && (
          <div className="space-y-2">
            {monthlyEntries.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#555]">No monthly data yet.</p>
            ) : monthlyEntries.map(([month, stats]) => (
              <div key={month} className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#2d2d2d] px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">{month}</p>
                  <span className="text-[10px] text-[#9b9b9b]">{stats.runs} runs · {stats.total_tokens > 0 ? stats.total_tokens.toLocaleString() + " tokens" : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filter === "all" && (
          <div className="space-y-1.5">
            {!data ? (
              <p className="py-6 text-center text-xs text-[#555]">Click Refresh to load usage data.</p>
            ) : (data.recent_runs ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-[#555]">No runs yet — start a conversation to begin tracking.</p>
            ) : (data.recent_runs ?? []).map((run) => (
              <div key={run.id} className="flex items-center gap-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#2d2d2d] px-3 py-2.5">
                <span className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase",
                  run.status === "completed" ? "bg-[rgba(34,197,94,0.15)] text-[#4ade80]" : "bg-[rgba(251,191,36,0.15)] text-[#fbbf24]"
                )}>
                  {run.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-[#9b9b9b]">{run.message || "—"}</p>
                  <p className="mt-0.5 text-[10px] text-[#555]">{run.model.split("/").pop()} · {run.created_at.slice(0, 10)}</p>
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-[#555]">
                  {run.total_tokens > 0 ? run.total_tokens.toLocaleString() + " tk" : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanPanel({
  items,
  isSending,
  onStatusChange,
  onAdd,
  onDelete
}: {
  items: KanbanItem[];
  isSending: boolean;
  onStatusChange: (id: string, status: KanbanItem["status"]) => void;
  onAdd: (title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");

  const doneCount = items.filter((i) => i.status === "done").length;
  const progressPct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  const columns: { status: KanbanItem["status"]; label: string; dot: string; ring: string }[] = [
    { status: "todo",        label: "To Do",       dot: "bg-[#555]",    ring: "border-[rgba(255,255,255,0.06)]" },
    { status: "in_progress", label: "In Progress",  dot: "bg-[#fbbf24]", ring: "border-[rgba(251,191,36,0.15)]" },
    { status: "done",        label: "Done",         dot: "bg-[#4ade80]", ring: "border-[rgba(74,222,128,0.15)]" }
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Agent running banner */}
      {isSending && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[rgba(45,212,191,0.2)] bg-[rgba(45,212,191,0.05)] px-4 py-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#2dd4bf] animate-ping" />
          <p className="text-[11px] text-[#2dd4bf]">Agent is working — tasks may update automatically</p>
        </div>
      )}

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
        <div className="flex items-center gap-3">
          <CalendarCheck size={18} className="text-[#2dd4bf]" />
          <div>
            <p className="text-sm font-medium">Task Board</p>
            <p className="text-[11px] text-[#9b9b9b]">
              {items.length === 0 ? "No tasks yet" : `${doneCount} of ${items.length} done${items.length > 0 ? ` · ${progressPct}%` : ""}`}
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) { onAdd(newTitle.trim()); setNewTitle(""); }
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add task…"
            className="h-8 w-40 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] px-3 text-xs outline-none focus:border-[#2dd4bf]/60 transition-colors placeholder:text-[#555]"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="h-8 rounded-lg bg-[#2dd4bf] px-3 text-xs font-semibold text-[#111] disabled:opacity-40 transition-opacity"
          >
            Add
          </button>
        </form>
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="h-0.5 w-full bg-[#2d2d2d]">
          <div
            className="h-full bg-[#2dd4bf] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Columns */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid h-full min-w-[540px] grid-cols-3 gap-3">
          {columns.map((col) => {
            const colItems = items.filter((i) => i.status === col.status);
            return (
              <div
                key={col.status}
                className={cn("flex flex-col rounded-xl border bg-[#1c1c1c]", col.ring)}
              >
                {/* Column header */}
                <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", col.dot)} />
                    <p className="text-[11px] font-semibold tracking-wide text-[#9b9b9b] uppercase">{col.label}</p>
                  </div>
                  {colItems.length > 0 && (
                    <span className="rounded-full bg-[#2d2d2d] px-1.5 py-0.5 text-[10px] font-medium text-[#555]">
                      {colItems.length}
                    </span>
                  )}
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {colItems.map((item) => (
                    <div
                      key={item.id}
                      className="group rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#242424] p-3 shadow-sm transition-shadow hover:shadow-md hover:border-[rgba(255,255,255,0.1)]"
                    >
                      <p className="text-xs font-medium leading-snug text-[#ececec]">{item.title}</p>
                      {item.description && (
                        <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[#666]">{item.description}</p>
                      )}
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                          item.priority === "high"   ? "bg-[rgba(239,68,68,0.12)] text-[#f87171]" :
                          item.priority === "medium" ? "bg-[rgba(251,191,36,0.12)] text-[#d97706]" :
                                                       "bg-[rgba(156,163,175,0.1)]  text-[#6b7280]"
                        )}>
                          {item.priority}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {col.status !== "todo" && (
                            <button
                              onClick={() => onStatusChange(item.id, col.status === "done" ? "in_progress" : "todo")}
                              className="rounded p-1 text-[#555] hover:text-[#9b9b9b]" title="Move back"
                            ><ChevronLeft size={11} /></button>
                          )}
                          {col.status !== "done" && (
                            <button
                              onClick={() => onStatusChange(item.id, col.status === "todo" ? "in_progress" : "done")}
                              className="rounded p-1 text-[#555] hover:text-[#9b9b9b]" title="Move forward"
                            ><ChevronRight size={11} /></button>
                          )}
                          <button
                            onClick={() => onDelete(item.id)}
                            className="rounded p-1 text-[#555] hover:text-rose-400" title="Delete"
                          ><X size={11} /></button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {colItems.length === 0 && (
                    <div className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[rgba(255,255,255,0.04)]">
                      <p className="text-[10px] text-[#3d3d3d]">Nothing here yet</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return (
    <div className="hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-0.5 sm:grid sm:grid-cols-3">
      {(["ask", "create", "act"] as Mode[]).map((item) => (
        <button
          key={item}
          onClick={() => setMode(item)}
          className={cn(
            "h-7 rounded px-2 text-[11px] font-medium capitalize text-[#9b9b9b]",
            mode === item && "bg-[#2dd4bf] text-[#1a1a1a]"
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function SidebarButton({
  active,
  collapsed,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  collapsed: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-[#9b9b9b] hover:bg-[#2d2d2d] hover:text-[#ececec]",
        active && "bg-[#2dd4bf] text-[#1a1a1a] hover:bg-[#2dd4bf] hover:text-[#1a1a1a]",
        collapsed && "justify-center px-0"
      )}
      title={label}
    >
      <Icon size={16} />
      {collapsed ? null : <span>{label}</span>}
    </button>
  );
}

function InspectorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mt-4">
      <p className="mb-2 text-xs uppercase tracking-[0.15em] text-[#9b9b9b]">{title}</p>
      <div className="grid gap-1.5">{children}</div>
    </section>
  );
}

function StepRow({ step }: { step: RunStep }) {
  const icon =
    step.status === "completed" ? CheckCircle2 : step.status === "failed" ? X : step.status === "waiting" ? CalendarCheck : Clock3;
  const Icon = icon;

  return (
    <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-2">
      <div className="flex items-center gap-2">
        <Icon size={14} className={cn(step.status === "failed" ? "text-rose-400" : "text-[#2dd4bf]")} />
        <p className="text-xs font-medium">{step.label}</p>
      </div>
      {step.detail ? <p className="mt-1 text-[10px] text-[#9b9b9b]">{step.detail}</p> : null}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#2d2d2d] p-2 text-xs text-[#9b9b9b]">{text}</p>;
}

function EmptyState({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="rounded-md border border-dashed border-[rgba(255,255,255,0.08)] p-6 text-center text-[#9b9b9b]">
      <Icon className="mx-auto" size={20} />
      <p className="mt-2 text-xs">{title}</p>
    </div>
  );
}

function parseSseChunk(chunk: string) {
  const eventLine = chunk.split("\n").find((line) => line.startsWith("event:"));
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;

  try {
    return {
      type: eventLine.slice("event:".length).trim(),
      data: JSON.parse(dataLine.slice("data:".length).trim()) as Record<string, unknown>
    };
  } catch {
    return null;
  }
}

function humanizeToolName(name: string) {
  if (name === "web_search" || name.includes("tavily")) return "The PVTLST → searching web";
  if (name === "web_extract") return "The PVTLST → reading page";
  if (name === "gmail_send") return "The PVTLST → composing email";
  if (name === "gmail_search") return "The PVTLST → searching email";
  if (name === "gmail_read") return "The PVTLST → reading email";
  if (name === "memory") return "The PVTLST → updating memory";
  if (name === "skill_manage") return "The PVTLST → writing skill";
  if (name.startsWith("skill")) return "The PVTLST → loading skill";
  if (name === "delegate_task") return "The PVTLST → spawning worker";
  if (name === "todo") return "The PVTLST → managing tasks";
  if (name === "vision_analyze") return "The PVTLST → analyzing image";
  if (name === "clarify") return "The PVTLST → asking clarification";
  if (name.includes("calendar")) return "The PVTLST → using Calendar";
  if (name.includes("drive")) return "The PVTLST → using Drive";
  return `The PVTLST → ${name.replaceAll("_", " ")}`;
}

function currentTimeKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
