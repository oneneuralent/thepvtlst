import os

import httpx

from app.core.schemas import Source


async def search_tavily(query: str, api_key: str | None = None) -> tuple[str, list[Source], str | None]:
    api_key = api_key or os.getenv("TAVILY_API_KEY")
    if not api_key:
        return "", [], "TAVILY_API_KEY is not set. Add it to Railway environment variables or store it as a workspace API key."

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "query": query,
                    "search_depth": "basic",
                    "include_answer": True,
                    "include_raw_content": False,
                    "max_results": 5,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        return "", [], f"Tavily search failed: {exc}"

    sources = [
        Source(
            title=str(item.get("title") or "Untitled source"),
            url=str(item.get("url") or ""),
            content=str(item.get("content") or ""),
            score=item.get("score"),
        )
        for item in payload.get("results", [])
        if item.get("url")
    ]

    return str(payload.get("answer") or ""), sources, None
