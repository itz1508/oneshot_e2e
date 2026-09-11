"""Application services for users, workspaces, and Integration credentials.

Services own transaction-level domain rules and keep endpoint functions thin.
They never return decrypted vendor Integration secrets.

Example::

    user, workspace = AuthService(passwords).register(session, request)
"""

from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from workspace_api.errors import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
)
from workspace_api.models import (
    AvailabilityStatus,
    ModelConfiguration,
    ModelProvider,
    ProviderCredential,
    Subscription,
    User,
    Workspace,
    WorkspaceMembership,
    WorkspaceRole,
)
from workspace_api.security import SecretCipher


ROLE_ORDER = {
    WorkspaceRole.VIEWER: 0,
    WorkspaceRole.MEMBER: 1,
    WorkspaceRole.ADMIN: 2,
    WorkspaceRole.OWNER: 3,
}


def slugify(value: str) -> str:
    """Create a conservative lowercase workspace slug."""

    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:90] or "workspace"


class WorkspaceService:
    """Manage tenant creation, membership, and role authorization."""

    def require_role(
        self,
        session: Session,
        workspace_id: str,
        user_id: str,
        minimum: WorkspaceRole = WorkspaceRole.VIEWER,
    ) -> WorkspaceMembership:
        """Return membership when the user meets the required role."""

        membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.user_id == user_id,
            )
        )
        if not membership or ROLE_ORDER[membership.role] < ROLE_ORDER[minimum]:
            raise AuthorizationError()
        return membership

    def create(
        self,
        session: Session,
        user_id: str | None,
        name: str,
        requested_slug: str | None,
    ) -> Workspace:
        """Create a workspace, optionally attributed to a user."""

        slug = slugify(requested_slug or name)
        if session.scalar(select(Workspace.id).where(Workspace.slug == slug)):
            raise ConflictError("Workspace slug is already in use", slug=slug)
        workspace = Workspace(name=name.strip(), slug=slug, owner_user_id=user_id)
        session.add(workspace)
        session.flush()
        session.add_all(
            [
                *(
                    [
                        WorkspaceMembership(
                            workspace_id=workspace.id,
                            user_id=user_id,
                            role=WorkspaceRole.OWNER,
                        )
                    ]
                    if user_id
                    else []
                ),
                Subscription(workspace_id=workspace.id),
            ]
        )
        session.flush()
        return workspace

    def add_member(
        self,
        session: Session,
        workspace_id: str,
        actor_user_id: str | None,
        email: str,
        role: WorkspaceRole,
    ) -> WorkspaceMembership:
        """Add an existing user to a workspace."""

        if actor_user_id:
            self.require_role(
                session, workspace_id, actor_user_id, WorkspaceRole.ADMIN
            )
        if role == WorkspaceRole.OWNER:
            raise ConflictError(
                "Workspace ownership transfer uses a separate operation"
            )
        user = session.scalar(
            select(User).where(func.lower(User.email) == email.lower())
        )
        if not user:
            raise NotFoundError("user", email)
        existing = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.user_id == user.id,
            )
        )
        if existing:
            raise ConflictError("User is already a workspace member")
        membership = WorkspaceMembership(
            workspace_id=workspace_id,
            user_id=user.id,
            role=role,
            invited_by_user_id=actor_user_id,
        )
        session.add(membership)
        session.flush()
        return membership


class CredentialService:
    """Encrypt vendor Integration secrets for workspace model configurations."""

    def __init__(self, cipher: SecretCipher) -> None:
        self.cipher = cipher

    def create_provider_credential(
        self,
        session: Session,
        *,
        workspace_id: str,
        provider_id: str,
        name: str,
        secret: str,
        expires_at: datetime | None,
    ) -> ProviderCredential:
        """Create version one of an encrypted provider credential."""

        if not session.get(ModelProvider, provider_id):
            raise NotFoundError("provider", provider_id)
        existing = session.scalar(
            select(ProviderCredential.id).where(
                ProviderCredential.workspace_id == workspace_id,
                ProviderCredential.provider_id == provider_id,
                ProviderCredential.name == name,
            )
        )
        if existing:
            raise ConflictError("An active credential with this name already exists")
        credential = ProviderCredential(
            workspace_id=workspace_id,
            provider_id=provider_id,
            name=name,
            encrypted_secret=self.cipher.encrypt(secret),
            secret_prefix=secret[:8],
            version=1,
            expires_at=expires_at,
        )
        session.add(credential)
        session.flush()
        return credential

    def rotate_provider_credential(
        self,
        session: Session,
        *,
        workspace_id: str,
        credential_id: str,
        secret: str,
        expires_at: datetime | None,
    ) -> ProviderCredential:
        """Retire an old provider key, create its successor, and rebind models."""

        old = session.get(ProviderCredential, credential_id)
        if not old or old.workspace_id != workspace_id:
            raise NotFoundError("provider credential", credential_id)
        old.status = "retired"
        replacement = ProviderCredential(
            workspace_id=old.workspace_id,
            provider_id=old.provider_id,
            name=old.name,
            encrypted_secret=self.cipher.encrypt(secret),
            secret_prefix=secret[:8],
            version=old.version + 1,
            rotated_from_id=old.id,
            expires_at=expires_at,
        )
        session.add(replacement)
        session.flush()
        session.execute(
            update(ModelConfiguration)
            .where(ModelConfiguration.credential_id == old.id)
            .values(credential_id=replacement.id)
        )
        return replacement

    def revoke_provider_credential(
        self, session: Session, workspace_id: str, credential_id: str
    ) -> None:
        """Revoke a credential and detach it from model configurations."""

        credential = session.get(ProviderCredential, credential_id)
        if not credential or credential.workspace_id != workspace_id:
            raise NotFoundError("provider credential", credential_id)
        session.execute(
            update(ModelConfiguration)
            .where(ModelConfiguration.credential_id == credential.id)
            .values(
                credential_id=None,
                availability=AvailabilityStatus.UNAVAILABLE,
            )
        )
