"""ASGI entry point for the OneShot AI Workspace API.

Example::

    uvicorn --app-dir app workspace_api.main:app --host 0.0.0.0 --port 8080
"""

from workspace_api.api import create_app

app = create_app()
