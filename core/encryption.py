from cryptography.fernet import Fernet
import base64
import hashlib

class HydraCipher:
    def __init__(self, key: bytes):
        # Derive a 32-byte key using SHA-256
        key_hash = hashlib.sha256(key).digest()
        # Convert to URL-safe base64 for Fernet
        key_b64 = base64.urlsafe_b64encode(key_hash)
        self.cipher = Fernet(key_b64)

    def encrypt(self, data: bytes) -> bytes:
        return self.cipher.encrypt(data)

    def decrypt(self, data: bytes) -> bytes:
        return self.cipher.decrypt(data)