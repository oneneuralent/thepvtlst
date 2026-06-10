import logging
import os
from typing import Callable, Any

from app.adapters.hermes_bridge import HermesBridge
from app.core.connectors import build_connector_policy
from app.core.safety import build_tool_policy
from app.core.schemas import RunRequest, RunResponse, ToolEvent
from app.services.openrouter import generate_with_openrouter
from app.services.tavily import search_tavily

logger = logging.getLogger(__name__)


class AgentRuntime:
    """Stable SaaS-facing runtime interface.

    Hermes or any future agent engine should sit behind this class, never in front of it.
    """

    def __init__(self) -> None:
        self.hermes = HermesBridge()
        self._use_hermes = os.getenv("USE_HERMES", "true").lower() in ("1", "true", "yes")

    async def run(
        self,
        payload: RunRequest,
        event_callback: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> RunResponse:
        policy = build_tool_policy(mode=payload.mode)
        connector_policy = build_connector_policy(mode=payload.mode)

        # Act mode goes through Hermes like ask/create.
        # Hermes is instructed to propose actions (not execute them).
        # Connector side effects are approval-gated at the web layer.

        memory_context = "\n".join(
            f"- {item.get('type', 'memory')}: {item.get('title', '')} — {item.get('content', '')}"
            for item in payload.memory_context[:8]
        )

        # --- Primary path: Hermes engine ---
        if self._use_hermes and self.hermes.available:
            logger.info("Running via Hermes bridge (run_id=%s, mode=%s)", payload.run_id, payload.mode)
            result = await self.hermes.run(
                mode=payload.mode,
                message=payload.message,
                run_id=payload.run_id or "anon",
                workspace_id=payload.workspace_id,
                user_id=payload.user_id,
                thread_id=payload.thread_id,
                memory_context=memory_context,
                model=payload.model,
                provider=payload.provider,
                conversation_history=payload.conversation_history or [],
                user_tool_settings=payload.user_tool_settings or {},
                event_callback=event_callback,
            )
            result.runtime["policy"] = policy
            result.runtime["connectors"] = connector_policy
            result.runtime["engine"] = "hermes"
            return result

        # --- Fallback: raw OpenRouter + Tavily ---
        logger.info("Hermes unavailable, falling back to raw OpenRouter (mode=%s)", payload.mode)
        return await self._run_fallback(payload, policy, connector_policy, memory_context)

    async def _run_fallback(
        self,
        payload: RunRequest,
        policy: dict,
        connector_policy: list[dict],
        memory_context: str,
    ) -> RunResponse:
        """Legacy direct-call path when Hermes is not available."""

        answer, sources, search_error = await search_tavily(payload.message)
        research_context = "\n".join(
            f"{index + 1}. {source.title}: {source.content} ({source.url})"
            for index, source in enumerate(sources[:5])
        )

        llm_answer, llm_error = await generate_with_openrouter(
            mode=payload.mode,
            message=payload.message,
            model=payload.model,
            research_context="\n\n".join(part for part in [memory_context, research_context] if part),
        )

        if llm_answer:
            main_answer = llm_answer
        elif answer:
            main_answer = answer
        else:
            main_answer = (
                "I reached the safe runtime boundary, but I need OPENROUTER_API_KEY for LLM generation. "
                "Tavily is also needed for live research context."
            )

        prefix = "Create Mode draft" if payload.mode == "create" else "Ask Mode answer"
        notes = [note for note in [search_error, llm_error] if note]
        source_lines = "\n".join(f"{index + 1}. {source.title} - {source.url}" for index, source in enumerate(sources[:3]))
        message = f"{prefix} from AgenticOS runtime:\n\n{main_answer}"
        if source_lines:
            message += f"\n\nSources:\n{source_lines}"
        if notes:
            message += "\n\nRuntime notes:\n" + "\n".join(f"- {note}" for note in notes)

        return RunResponse(
            status="completed",
            message=message,
            sources=sources,
            tool_events=[
                ToolEvent(
                    tool_name="tavily_search",
                    tool_category="web_search",
                    input={"query": payload.message},
                    output={"answer": answer, "sources": [source.model_dump() for source in sources], "error": search_error},
                    status="failed" if search_error else "completed",
                    requires_approval=False,
                ),
                ToolEvent(
                    tool_name="openrouter_chat",
                    tool_category="llm_generation",
                    input={"mode": payload.mode},
                    output={"error": llm_error, "configured": llm_error is None},
                    status="failed" if llm_error else "completed",
                    requires_approval=False,
                ),
            ],
            runtime={"policy": policy, "connectors": connector_policy, "engine": "fallback_openrouter"},
        )
