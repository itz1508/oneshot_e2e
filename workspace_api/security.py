"""Password hashing, JWTs, provider-secret encryption, and API-key hashing.

Passwords use pwdlib's recommended Argon2 configuration. Provider secrets use
MultiFernet with the first configured key for encryption and all configured
keys for decryption. Workspace API keys are returned once and stored as an HMAC.

Example::

    token = TokenService(settings).create_access_token(user.id)
    raw_key, prefix, digest = ApiKeyService(settings).issue()
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from workspace_api.config import WorkspaceSettings
from workspace_api.errors import AuthenticationError


class PasswordService:
    """Hash and verify user passwords with Argon2."""

    def __init__(self) -> None:
        self._hash = PasswordHash.recommended()
        self._dummy = self._hash.hash("oneshot-dummy-password-not-a-user")

    def hash(self, password: str) -> str:
        """Return a salted password hash."""

        return self._hash.hash(password)

    def verify(self, password: str, encoded: str | None) -> bool:
        """Verify a password, doing dummy work when the account does not exist."""

        candidate = encoded or self._dummy
        try:
            return self._hash.verify(password, candidate) if encoded else False
        except Exception:
            return False


@dataclass(frozen=True, slots=True)
class TokenClaims:
    """Validated identity claims used by authentication dependencies."""

    user_id: str
    expires_at: datetime
    token_id: str


class TokenService:
    """Issue and validate short-lived signed user access tokens."""

    def __init__(self, settings: WorkspaceSettings) -> None:
        self.settings = settings

    def create_access_token(self, user_id: str) -> tuple[str, int]:
        """Return a signed JWT and its lifetime in seconds."""

        now = datetime.now(timezone.utc)
        ttl = timedelta(minutes=self.settings.access_token_ttl_minutes)
        payload = {
            "sub": f"user:{user_id}",
            "iat": now,
            "nbf": now,
            "exp": now + ttl,
            "jti": secrets.token_hex(16),
            "iss": "oneshot-workspace",
            "aud": "oneshot-workspace-api",
        }
        token = jwt.encode(
            payload,
            self.settings.jwt_secret.get_secret_value(),
            algorithm=self.settings.jwt_algorithm,
        )
        return token, int(ttl.total_seconds())

    def decode_access_token(self, token: str) -> TokenClaims:
        """Validate signature, issuer, audience, timestamps, and subject type."""

        try:
            payload = jwt.decode(
                token,
                self.settings.jwt_secret.get_secret_value(),
                algorithms=[self.settings.jwt_algorithm],
                audience="oneshot-workspace-api",
                issuer="oneshot-workspace",
                options={"require": ["sub", "exp", "iat", "jti"]},
            )
            subject = str(payload["sub"])
            if not subject.startswith("user:"):
                raise InvalidTokenError("unexpected subject type")
            return TokenClaims(
                user_id=subject.removeprefix("user:"),
                expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc),
                token_id=str(payload["jti"]),
            )
        except InvalidTokenError as error:
            raise AuthenticationError("Invalid or expired access token") from error


class SecretCipher:
    """Encrypt, decrypt, and rewrap provider credentials with MultiFernet."""

    def __init__(self, settings: WorkspaceSettings) -> None:
        self._cipher = MultiFernet([Fernet(key) for key in settings.fernet_keys])

    def encrypt(self, secret: str) -> str:
        """Encrypt plaintext with the primary configured key."""

        return self._cipher.encrypt(secret.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt ciphertext using any active key without logging the value."""

        try:
            return self._cipher.decrypt(ciphertext.encode()).decode()
        except InvalidToken as error:
            raise AuthenticationError("Provider credential cannot be decrypted") from error

    def rotate_encryption(self, ciphertext: str) -> str:
        """Re-encrypt an existing token under the primary configured key."""

        try:
            return self._cipher.rotate(ciphertext.encode()).decode()
        except InvalidToken as error:
            raise AuthenticationError("Provider credential cannot be rotated") from error


class ApiKeyService:
    """Issue and verify opaque workspace API keys using an HMAC pepper."""

    def __init__(self, settings: WorkspaceSettings) -> None:
        self._pepper = settings.api_key_pepper.get_secret_value().encode()

    def digest(self, raw_key: str) -> str:
        """Return the keyed SHA-256 digest stored in the database."""

        return hmac.new(self._pepper, raw_key.encode(), hashlib.sha256).hexdigest()

    def issue(self) -> tuple[str, str, str]:
        """Return raw key, lookup prefix, and database digest."""

        raw_key = "osk_" + secrets.token_urlsafe(32)
        prefix = raw_key[:16]
        return raw_key, prefix, self.digest(raw_key)

    def verify(self, raw_key: str, expected_digest: str) -> bool:
        """Compare a presented key with a stored digest in constant time."""

        return hmac.compare_digest(self.digest(raw_key), expected_digest)
