import { NextResponse } from "next/server";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

const TOOLSET_CATALOG = [
  {
    name: "image_gen",
    display: "Image Generation",
    description: "Generate images from text prompts (FLUX, DALL-E) via fal.ai",
    category: "ai",
    requiresApiKey: true,
    apiKeyProvider: "fal",
    apiKeyEnvVar: "FAL_KEY",
    apiKeyLabel: "FAL.ai API Key",
    apiKeyUrl: "https://fal.ai/dashboard/keys",
  },
  {
    name: "tts",
    display: "Text-to-Speech",
    description: "Edge TTS is free (Microsoft neural voices). Add ElevenLabs key for premium voices.",
    category: "ai",
    requiresApiKey: false,
    apiKeyProvider: "elevenlabs",
    apiKeyEnvVar: "ELEVENLABS_API_KEY",
    apiKeyLabel: "ElevenLabs API Key (optional)",
    apiKeyUrl: "https://elevenlabs.io/app/settings/api-keys",
  },
  {
    name: "discord",
    display: "Discord",
    description: "Read channels and participate in Discord threads",
    category: "platform",
    requiresApiKey: true,
    apiKeyProvider: "discord",
    apiKeyEnvVar: "DISCORD_TOKEN",
    apiKeyLabel: "Discord Bot Token",
    apiKeyUrl: "https://discord.com/developers/applications",
  },
  {
    name: "messaging",
    display: "Messaging (Telegram / Slack / SMS)",
    description: "Send messages across Telegram, Slack, and SMS",
    category: "platform",
    requiresApiKey: false,
    apiKeyProvider: "messaging",
    apiKeyEnvVar: null,
    apiKeyLabel: "Platform credentials (Telegram token, Slack token…)",
    apiKeyUrl: "",
  },
  {
    name: "cronjob",
    display: "Scheduled Tasks",
    description: "Schedule recurring automations — reminders, digests, daily summaries",
    category: "automation",
    requiresApiKey: false,
    apiKeyProvider: null,
    apiKeyEnvVar: null,
    apiKeyLabel: null,
    apiKeyUrl: null,
  },
  {
    name: "homeassistant",
    display: "Home Assistant",
    description: "Control and monitor smart home devices",
    category: "platform",
    requiresApiKey: true,
    apiKeyProvider: "homeassistant",
    apiKeyEnvVar: "HASS_TOKEN",
    apiKeyLabel: "Home Assistant long-lived access token",
    apiKeyUrl: "https://www.home-assistant.io/docs/authentication",
  },
  {
    name: "browser",
    display: "Browser Automation (Cloud)",
    description: "Automate web browsing — navigate pages, click elements, fill forms, extract content behind authentication. Runs in an isolated cloud browser (Browserbase or Browser Use). No local Chromium needed.",
    category: "compute",
    requiresApiKey: false,
    apiKeyProvider: "browser",
    apiKeyEnvVar: null,
    apiKeyLabel: "Browserbase API Key + Project ID (or) Browser Use API Key",
    apiKeyUrl: "https://www.browserbase.com",
  },
  {
    name: "code_interpreter",
    display: "Code Interpreter",
    description: "Run Python or JavaScript in a secure cloud sandbox (E2B). Use for data analysis, calculations, CSV/JSON processing, and any custom computation.",
    category: "compute",
    requiresApiKey: true,
    apiKeyProvider: "e2b",
    apiKeyEnvVar: "E2B_API_KEY",
    apiKeyLabel: "E2B API Key",
    apiKeyUrl: "https://e2b.dev/dashboard",
  },
] as const;

export type ToolsetName = (typeof TOOLSET_CATALOG)[number]["name"];

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const workspaceId = await ensureUserWorkspace(identity);
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("workspace_tool_settings")
    .select("toolset_name, enabled, metadata")
    .eq("workspace_id", workspaceId);

  const { data: apiKeyConnections } = await admin
    .from("connections")
    .select("provider, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.id)
    .eq("connection_type", "api_key");

  // Extract LLM settings
  const llmSettings = settings?.find(s => s.toolset_name === "llm_settings")?.metadata as { provider?: string; model?: string } | undefined;

  const enabledMap: Record<string, boolean> = {};
  for (const row of settings ?? []) {
    enabledMap[row.toolset_name] = row.enabled;
  }

  const apiKeySet = new Set((apiKeyConnections ?? []).map((c) => c.provider));

  const catalog = TOOLSET_CATALOG.map((tool) => {
    const metadata = settings?.find(s => s.toolset_name === tool.name)?.metadata as Record<string, unknown> | undefined;
    
    // Special handling for browser provider selection
    if (tool.name === "browser") {
      const browserProvider = metadata?.browserProvider as string | undefined;
      const browserbaseKeyConfigured = apiKeySet.has("browserbase");
      const browserbaseProjectConfigured = apiKeySet.has("browserbase_project");
      const browserUseKeyConfigured = apiKeySet.has("browser_use");
      
      return {
        ...tool,
        enabled: enabledMap[tool.name] ?? false,
        apiKeyConfigured: null,
        browserProvider: browserProvider || null,
        browserbaseKeyConfigured,
        browserbaseProjectConfigured,
        browserUseKeyConfigured,
      };
    }
    
    return {
      ...tool,
      enabled: enabledMap[tool.name] ?? false,
      apiKeyConfigured: tool.apiKeyProvider ? apiKeySet.has(tool.apiKeyProvider) : null,
    };
  });

  return NextResponse.json({ catalog, llmSettings });
}

export async function POST(request: Request) {
  const identity = await getRuntimeIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    toolset: string;
    enabled: boolean;
    apiKey?: string;
    browserProvider?: "browserbase" | "browser_use";
    browserbaseApiKey?: string;
    browserbaseProjectId?: string;
    browserUseApiKey?: string;
  } | null;

  if (!body?.toolset) {
    return NextResponse.json({ error: "toolset is required." }, { status: 400 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const admin = createAdminClient();

  // Handle LLM provider/model settings
  if (body.toolset === "llm_settings") {
    const { provider, model, apiKey } = body as { provider?: string; model?: string; apiKey?: string };
    
    // Save provider/model to workspace_tool_settings metadata
    const { error: settingsError } = await admin
      .from("workspace_tool_settings")
      .upsert(
        {
          workspace_id: workspaceId,
          toolset_name: "llm_settings",
          enabled: true,
          metadata: { provider, model }
        },
        { onConflict: "workspace_id,toolset_name" }
      );

    // Save API key to connections if provided
    if (apiKey && provider === "nvidia-nim") {
      const { error: connError } = await admin
        .from("connections")
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: identity.id,
            provider: "nvidia-nim",
            connection_type: "api_key",
            encrypted_access_token: apiKey,
            status: "connected",
            metadata: {}
          },
          { onConflict: "workspace_id,provider" }
        );
      if (connError) return NextResponse.json({ error: connError.message }, { status: 500 });
    }

    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Handle browser toolset with provider selection and multiple keys
  if (body.toolset === "browser") {
    const { browserProvider, browserbaseApiKey, browserbaseProjectId, browserUseApiKey } = body;
    
    // Save provider selection in metadata
    const { error: settingsError } = await admin
      .from("workspace_tool_settings")
      .upsert(
        {
          workspace_id: workspaceId,
          toolset_name: "browser",
          enabled: body.enabled,
          metadata: { browserProvider },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,toolset_name" }
      );

    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

    // Save API keys based on provider
    if (browserProvider === "browserbase" && browserbaseApiKey && browserbaseProjectId) {
      // Save both key and project ID as separate connections
      const { error: keyError } = await admin
        .from("connections")
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: identity.id,
            provider: "browserbase",
            connection_type: "api_key",
            encrypted_access_token: browserbaseApiKey,
            status: "connected",
            metadata: { env_var: "BROWSERBASE_API_KEY", toolset: "browser" },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,provider" }
        );

      const { error: projectError } = await admin
        .from("connections")
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: identity.id,
            provider: "browserbase_project",
            connection_type: "api_key",
            encrypted_access_token: browserbaseProjectId,
            status: "connected",
            metadata: { env_var: "BROWSERBASE_PROJECT_ID", toolset: "browser" },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,provider" }
        );

      if (keyError || projectError) {
        return NextResponse.json({ error: "Failed to save Browserbase credentials" }, { status: 500 });
      }
    } else if (browserProvider === "browser_use" && browserUseApiKey) {
      const { error: connError } = await admin
        .from("connections")
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: identity.id,
            provider: "browser_use",
            connection_type: "api_key",
            encrypted_access_token: browserUseApiKey,
            status: "connected",
            metadata: { env_var: "BROWSER_USE_API_KEY", toolset: "browser" },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,provider" }
        );

      if (connError) return NextResponse.json({ error: connError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, toolset: "browser", enabled: body.enabled });
  }

  const catalogEntry = TOOLSET_CATALOG.find((t) => t.name === body.toolset);
  if (!catalogEntry) {
    return NextResponse.json({ error: "Unknown toolset." }, { status: 400 });
  }

  const { error: upsertError } = await admin.from("workspace_tool_settings").upsert(
    {
      workspace_id: workspaceId,
      toolset_name: body.toolset,
      enabled: body.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,toolset_name" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (body.apiKey && catalogEntry.apiKeyProvider) {
    const { error: connError } = await admin.from("connections").upsert(
      {
        workspace_id: workspaceId,
        user_id: identity.id,
        provider: catalogEntry.apiKeyProvider,
        connection_type: "api_key",
        encrypted_access_token: body.apiKey,
        status: "connected",
        metadata: {
          toolset: body.toolset,
          env_var: catalogEntry.apiKeyEnvVar,
          display: catalogEntry.apiKeyLabel,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" }
    );

    if (connError) {
      return NextResponse.json({ error: connError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, toolset: body.toolset, enabled: body.enabled });
}
