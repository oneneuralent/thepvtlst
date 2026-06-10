import { z } from "zod";

const tavilyResultSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  content: z.string().optional(),
  score: z.number().optional()
});

const tavilyResponseSchema = z.object({
  answer: z.string().optional(),
  results: z.array(tavilyResultSchema).optional()
});

export type TavilySource = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export async function searchWithTavily(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return {
      answer: "",
      sources: [] as TavilySource[],
      error: "TAVILY_API_KEY is not configured."
    };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5
    })
  });

  if (!response.ok) {
    return {
      answer: "",
      sources: [] as TavilySource[],
      error: `Tavily search failed with ${response.status}.`
    };
  }

  const parsed = tavilyResponseSchema.parse(await response.json());
  const sources =
    parsed.results
      ?.filter((result) => result.title && result.url)
      .map((result) => ({
        title: result.title!,
        url: result.url!,
        content: result.content ?? "",
        score: result.score
      })) ?? [];

  return {
    answer: parsed.answer ?? "",
    sources,
    error: null
  };
}
