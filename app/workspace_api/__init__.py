"""OneShot AI Workspace API.

This package is an isolated control-plane service for users, workspaces,
provider credentials, model routing, chat history, and usage accounting. It
does not own or mutate the canonical OneShot workflow.

Example::

    from workspace_api.api import create_app

    app = create_app()
"""

from workspace_api.api import create_app

__all__ = ["create_app"]
__version__ = "0.1.0"
