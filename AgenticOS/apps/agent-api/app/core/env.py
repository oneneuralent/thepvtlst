import os
from pathlib import Path


def load_local_dev_env() -> None:
    """Load local env from the web app when running the split stack on one machine.

    Production should provide real environment variables to the agent service directly.
    """

    env_path = Path(__file__).resolve().parents[3] / "web" / ".env.local"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
