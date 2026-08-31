"""Application services for users, workspaces, credentials, and API keys.

Services own transaction-level domain rules and keep endpoint functions thin.
They never return decrypted provider credentials or persisted API-key secrets.

Example::

    user, workspace = AuthService(passwords).register(session, request)
    issued = CredentialService(cipher, keys).create_workspace_api_key(...)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from workspace_api.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
)
from workspace_api.models import (
    AvailabilityStatus,
    AuditLog,
    CredentialStatus,
    ModelConfiguration,
    ModelProvider,
    ProviderCredential,
    Subscription,
    User,
    UserStatus,
    Workspace,
    WorkspaceApiKey,
    WorkspaceMembership,
    WorkspaceRole,
    utcnow,
)
from workspace_api.schemas import RegisterRequest
from workspace_api.security import ApiKeyService, PasswordService, SecretCipher


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


class AuthService:
    """Register and authenticate human users."""

    def __init__(self, passwords: PasswordService) -> None:
        self.passwords = passwords

    def register(
        self, session: Session, request: RegisterRequest
    ) -> tuple[User, Workspace]:
        """Create an active user, owner workspace, membership, and default plan."""

        email = str(request.email).lower()
        if session.scalar(select(User).where(func.lower(User.email) == email)):
            raise ConflictError("A user with this email already exists")
        base_slug = slugify(request.workspace_name)
        slug = base_slug
        suffix = 1
        while session.scalar(select(Workspace.id).where(Workspace.slug == slug)):
            suffix += 1
            slug = f"{base_slug[:85]}-{suffix}"

        user = User(
            email=email,
            display_name=request.display_name.strip(),
            password_hash=self.passwords.hash(request.password.get_secret_value()),
            status=UserStatus.ACTIVE,
        )
        session.add(user)
        session.flush()
        workspace = Workspace(
            name=request.workspace_name.strip(), slug=slug, owner_user_id=user.id
        )
        session.add(workspace)
        session.flush()
        session.add_all(
            [
                WorkspaceMembership(
                    workspace_id=workspace.id,
                    user_id=user.id,
                    role=WorkspaceRole.OWNER,
                ),
                Subscription(workspace_id=workspace.id),
                AuditLog(
                    workspace_id=workspace.id,
                    actor_user_id=user.id,
                    action="workspace.created",
                    target_type="workspace",
                    target_id=workspace.id,
                ),
            ]
        )
        session.flush()
        return user, workspace

    def authenticate(self, session: Session, email: str, password: str) -> User:
        """Verify credentials without revealing whether an email exists."""

        user = session.scalar(
            select(User).where(func.lower(User.email) == email.lower())
        )
        if not self.passwords.verify(password, user.password_hash if user else None):
            raise AuthenticationError("Invalid email or password")
        if not user or user.status != UserStatus.ACTIVE:
            raise AuthenticationError("Invalid email or password")
        user.last_login_at = utcnow()
        session.flush()
        return user


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
        self, session: Session, user_id: str, name: str, requested_slug: str | None
    ) -> Workspace:
        """Create another workspace owned by the current user."""

        slug = slugify(requested_slug or name)
        if session.scalar(select(Workspace.id).where(Workspace.slug == slug)):
            raise ConflictError("Workspace slug is already in use", slug=slug)
        workspace = Workspace(name=name.strip(), slug=slug, owner_user_id=user_id)
        session.add(workspace)
        session.flush()
        session.add_all(
            [
                WorkspaceMembership(
                    workspace_id=workspace.id,
                    user_id=user_id,
                    role=WorkspaceRole.OWNER,
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
        actor_user_id: str,
        email: str,
        role: WorkspaceRole,
    ) -> WorkspaceMembership:
        """Add an existing user to a workspace after an admin authorization check."""

        self.require_role(session, workspace_id, actor_user_id, WorkspaceRole.ADMIN)
        if role == WorkspaceRole.OWNER:
            raise ConflictError("Workspace ownership transfer uses a separate operation")
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


@dataclass(frozen=True, slots=True)
class IssuedApiKey:
    record: WorkspaceApiKey
    secret: str


class CredentialService:
    """Encrypt provider keys and issue/rotate/revoke workspace API keys."""

    def __init__(self, cipher: SecretCipher, api_keys: ApiKeyService) -> None:
        self.cipher = cipher
        self.api_keys = api_keys

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
                ProviderCredential.status == CredentialStatus.ACTIVE,
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
        if old.status != CredentialStatus.ACTIVE:
            raise ConflictError("Only an active provider credential can be rotated")
        old.status = CredentialStatus.RETIRED
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
        credential.status = CredentialStatus.REVOKED
        session.execute(
            update(ModelConfiguration)
            .where(ModelConfiguration.credential_id == credential.id)
            .values(
                credential_id=None,
                availability=AvailabilityStatus.UNAVAILABLE,
            )
        )

    def create_workspace_api_key(
        self,
        session: Session,
        *,
        workspace_id: str,
        user_id: str,
        name: str,
        scopes: list[str],
        expires_at: datetime | None,
    ) -> IssuedApiKey:
        """Create a workspace API key and return its raw value exactly once."""

        raw, prefix, digest = self.api_keys.issue()
        record = WorkspaceApiKey(
            workspace_id=workspace_id,
            created_by_user_id=user_id,
            name=name,
            key_prefix=prefix,
            key_hash=digest,
            scopes_json=sorted(set(scopes)),
            expires_at=expires_at,
        )
        session.add(record)
        session.flush()
        return IssuedApiKey(record=record, secret=raw)

    def rotate_workspace_api_key(
        self,
        session: Session,
        *,
        workspace_id: str,
        user_id: str,
        key_id: str,
    ) -> IssuedApiKey:
        """Retire an API key and return a single-use replacement secret."""

        old = session.get(WorkspaceApiKey, key_id)
        if not old or old.workspace_id != workspace_id:
            raise NotFoundError("workspace API key", key_id)
        if old.status != CredentialStatus.ACTIVE:
            raise ConflictError("Only an active workspace API key can be rotated")
        old.status = CredentialStatus.RETIRED
        raw, prefix, digest = self.api_keys.issue()
        replacement = WorkspaceApiKey(
            workspace_id=workspace_id,
            created_by_user_id=user_id,
            name=old.name,
            key_prefix=prefix,
            key_hash=digest,
            version=old.version + 1,
            status=CredentialStatus.ACTIVE,
            scopes_json=old.scopes_json,
            rotated_from_id=old.id,
            expires_at=old.expires_at,
        )
        session.add(replacement)
        session.flush()
        return IssuedApiKey(record=replacement, secret=raw)

    def revoke_workspace_api_key(
        self, session: Session, workspace_id: str, key_id: str
    ) -> None:
        """Revoke a workspace API key immediately."""

        record = session.get(WorkspaceApiKey, key_id)
        if not record or record.workspace_id != workspace_id:
            raise NotFoundError("workspace API key", key_id)
        record.status = CredentialStatus.REVOKED
