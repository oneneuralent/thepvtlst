import os

import httpx


SYSTEM_PROMPT = """You are AgenticOS, a safe personal AI operating system for normal users.
You can help in Ask, Create, and Act modes. Never claim an external action was executed unless
the tool layer confirms it. For Act Mode, draft and request approval before side effects."""


async def generate_with_openrouter(
    mode: str,
    message: str,
    research_context: str = "",
    model: str | None = None,
) -> tuple[str, str | None]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return "", "OPENROUTER_API_KEY is not configured yet."

    selected_model = model or os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    user_content = f"Mode: {mode}\n\nUser request:\n{message}"
    if research_context:
        user_content += f"\n\nResearch context:\n{research_context}"

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": os.getenv("APP_PUBLIC_URL", "http://localhost:3000"),
                    "X-Title": "AgenticOS",
                },
                json={
                    "model": selected_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    "temperature": 0.4,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        return "", f"OpenRouter generation failed: {exc}"

    try:
        return str(payload["choices"][0]["message"]["content"]), None
    except (KeyError, IndexError, TypeError):
        return "", "OpenRouter returned an unexpected response shape."
