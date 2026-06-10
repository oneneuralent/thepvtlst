export type ModelPresetId = "fast" | "smart" | "tool" | "creative";

export type ModelPreset = {
  id: ModelPresetId;
  label: string;
  model: string;
  description: string;
  strengths: string[];
  toolCalling: "strong" | "medium" | "weak";
};

export const modelPresets: ModelPreset[] = [
  {
    id: "fast",
    label: "Fast",
    model: "openrouter/free",
    description: "Zero-cost router that picks an available free model for the request.",
    strengths: ["free", "chat", "experiments"],
    toolCalling: "medium"
  },
  {
    id: "smart",
    label: "Smart",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    description: "Large free reasoning model with long context and tool parameters.",
    strengths: ["reasoning", "long context", "analysis"],
    toolCalling: "strong"
  },
  {
    id: "tool",
    label: "Tool-use",
    model: "deepseek/deepseek-v4-flash:free",
    description: "Free DeepSeek model with very large context and tool support.",
    strengths: ["tools", "web research", "agent loops"],
    toolCalling: "strong"
  },
  {
    id: "creative",
    label: "Creative",
    model: "openai/gpt-oss-120b:free",
    description: "Free open-weight model for writing, drafting, and broad reasoning.",
    strengths: ["writing", "brainstorming", "drafts"],
    toolCalling: "strong"
  }
];

export function resolveModelPreset(id: string | null | undefined) {
  return modelPresets.find((preset) => preset.id === id) ?? modelPresets[0];
}
