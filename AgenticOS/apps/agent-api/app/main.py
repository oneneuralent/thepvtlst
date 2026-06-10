import os
import json
import asyncio
from collections.abc import AsyncIterator

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.core.env import load_local_dev_env
from app.core.runtime import AgentRuntime
from app.core.safety import build_tool_policy
from app.core.schemas import ApprovalRequest, RunRequest, RunResponse

load_local_dev_env()

app = FastAPI(title="AgenticOS Agent API", version="0.2.0")
runtime = AgentRuntime()

# Register connector tools at startup
@app.on_event("startup")
async def startup_event():
    """Register connector tools when the app starts."""
    try:
        from app.adapters.connector_tools import register_connector_tools
        register_connector_tools()
    except Exception as e:
        print(f"Failed to register connector tools at startup: {e}")


async def require_agent_secret(x_agent_api_secret: str | None = Header(default=None)) -> None:
    expected = os.getenv("AGENT_API_SECRET")
    if expected and x_agent_api_secret != expected:
        raise HTTPException(status_code=401, detail="Invalid agent runtime secret.")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "agenticos-agent-api",
        "version": "0.2.0",
        "engine": "hermes" if runtime.hermes.available and runtime._use_hermes else "fallback_openrouter",
        "hermes": runtime.hermes.describe(),
        "tavily_configured": bool(os.getenv("TAVILY_API_KEY")),
        "openrouter_configured": bool(os.getenv("OPENROUTER_API_KEY")),
    }


@app.get("/debug/tools")
async def debug_tools() -> dict:
    """Debug endpoint to check what tools are registered in Hermes."""
    try:
        from tools.registry import registry
        from toolsets import TOOLSETS
        tool_names = list(registry._tools.keys())
        return {
            "registered_tools": tool_names,
            "toolsets": list(TOOLSETS.keys()),
            "agenticos_connectors_in_toolsets": "agenticos_connectors" in TOOLSETS,
            "gmail_tools": [k for k in tool_names if "gmail" in k.lower()]
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/runs")
async def create_run(payload: RunRequest, _: None = Depends(require_agent_secret)) -> RunResponse:
    policy = build_tool_policy(mode=payload.mode)
    if "chat" not in policy["allowed_tools"]:
        raise HTTPException(status_code=403, detail="This mode has no chat permission.")

    return await runtime.run(payload)


@app.post("/runs/stream")
async def stream_run(payload: RunRequest, _: None = Depends(require_agent_secret)) -> StreamingResponse:
    policy = build_tool_policy(mode=payload.mode)
    if "chat" not in policy["allowed_tools"]:
        raise HTTPException(status_code=403, detail="This mode has no chat permission.")

    async def events() -> AsyncIterator[str]:
        def emit(event_type: str, data: dict) -> str:
            return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

        yield emit("run.started", {"runId": payload.run_id, "mode": payload.mode, "model": payload.model})
        yield emit("reasoning.summary", {"summary": "AgenticOS is preparing the safe Hermes runtime."})

        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def forward_event(event_type: str, data: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, (event_type, data))

        task = asyncio.create_task(runtime.run(payload, event_callback=forward_event))
        try:
            while not task.done():
                try:
                    event_type, data = await asyncio.wait_for(queue.get(), timeout=10.0)
                    yield emit(event_type, data)
                except asyncio.TimeoutError:
                    yield emit("run.heartbeat", {"message": "Hermes is still working.", "runId": payload.run_id})

            while not queue.empty():
                event_type, data = queue.get_nowait()
                yield emit(event_type, data)

            result = await task
        except Exception as exc:
            yield emit("run.failed", {"message": str(exc)})
            return

        if result.status == "requires_approval":
            yield emit("approval.required", {"approval": result.approval_payload})

        if result.message:
            yield emit("message.delta", {"delta": result.message})

        yield emit(
            "run.completed" if result.status in ("completed", "requires_approval") else "run.failed",
            result.model_dump(),
        )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/runs/{run_id}")
async def get_run(run_id: str) -> dict:
    return {"run_id": run_id, "status": "completed"}


@app.post("/runs/{run_id}/approve")
async def approve_run(run_id: str, payload: ApprovalRequest) -> dict:
    return {
        "run_id": run_id,
        "approval_id": payload.approval_id,
        "decision": payload.decision,
        "status": "received",
    }
