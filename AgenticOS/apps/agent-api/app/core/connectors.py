GOOGLE_CONNECTOR_TOOLS = [
    {
        "name": "google.gmail.search",
        "category": "connector",
        "provider": "google",
        "required_scopes": ["gmail.readonly"],
        "allowed_modes": ["ask", "create", "act"],
        "approval_required": False,
    },
    {
        "name": "google.gmail.send",
        "category": "connector",
        "provider": "google",
        "required_scopes": ["gmail.send"],
        "allowed_modes": ["act"],
        "approval_required": True,
    },
    {
        "name": "google.calendar.list",
        "category": "connector",
        "provider": "google",
        "required_scopes": ["calendar.readonly"],
        "allowed_modes": ["ask", "create", "act"],
        "approval_required": False,
    },
    {
        "name": "google.calendar.create",
        "category": "connector",
        "provider": "google",
        "required_scopes": ["calendar.events"],
        "allowed_modes": ["act"],
        "approval_required": True,
    },
    {
        "name": "google.drive.search",
        "category": "connector",
        "provider": "google",
        "required_scopes": ["drive.metadata.readonly"],
        "allowed_modes": ["ask", "create", "act"],
        "approval_required": False,
    },
    {
        "name": "google.sheets.update",
        "category": "connector",
        "provider": "google",
        "required_scopes": ["spreadsheets"],
        "allowed_modes": ["act"],
        "approval_required": True,
    },
]


def build_connector_policy(mode: str, granted_scopes: list[str] | None = None) -> list[dict]:
    granted = set(granted_scopes or [])
    available = []

    for tool in GOOGLE_CONNECTOR_TOOLS:
        if mode not in tool["allowed_modes"]:
            continue

        required = set(tool["required_scopes"])
        available.append(
            {
                **tool,
                "configured": required.issubset(granted),
                "missing_scopes": sorted(required - granted),
            }
        )

    return available
