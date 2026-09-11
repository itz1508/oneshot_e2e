"""Password hashing and Integration-secret encryption.

Passwords use pwdlib's recommended Argon2 configuration. Vendor Integration
secrets use MultiFernet with the first configured key for encryption and all
configured keys for decryption.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
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
            raise AuthenticationError(
                "Provider credential cannot be decrypted"
            ) from error

    def rotate_encryption(self, ciphertext: str) -> str:
        """Re-encrypt an existing token under the primary configured key."""

        try:
            return self._cipher.rotate(ciphertext.encode()).decode()
        except InvalidToken as error:
            raise AuthenticationError(
                "Provider credential cannot be rotated"
            ) from error
