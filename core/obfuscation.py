# core/obfuscation.py
import base64

def encrypt_string(s: str, key: int) -> bytes:
    return base64.b64encode(
        bytes([ord(c) ^ key for c in s]))