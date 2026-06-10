from pathlib import Path


class HermesAdapter:
    """Inspection-ready adapter for the Hermes engine.

    Hermes has powerful terminal, tool, skill, MCP, and gateway surfaces. For AgenticOS,
    it must only run behind the SaaS policy layer after a safe profile is created.
    """

    def __init__(self) -> None:
        self.repo_path = Path(__file__).resolve().parents[4] / "vendor" / "hermes-agent"

    def describe(self) -> dict:
        return {
            "available": self.repo_path.exists(),
            "repo_path": str(self.repo_path),
            "status": "adapter_stub",
            "next_step": "Bind a safe Hermes worker profile after OpenRouter and connector policy are configured.",
            "disabled_public_surfaces": [
                "terminal",
                "shell",
                "raw_code_execution",
                "unrestricted_filesystem",
                "unknown_mcp_servers",
                "unapproved_browser_automation",
            ],
        }
