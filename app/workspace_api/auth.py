"""Request attribution for the workspace HTTP API.

The workspace sidecar runs inside the OneShot deployment boundary and is
reached same-origin through the application server. No OneShot-issued
credential exists; requests are trusted at that boundary and carry no
bearer token or API key.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Principal:
    """Attribution for the actor that issued a workspace API request."""

    user_id: str | None = None
    workspace_id: str | None = None
