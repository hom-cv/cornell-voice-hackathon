import hashlib
import hmac
import secrets
from datetime import datetime, timezone


# A random salt per employee prevents matching PINs from sharing a stored hash.
def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(pin.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def verify_pin(pin: str, encoded: str) -> bool:
    _, salt, expected = encoded.split("$")
    actual = hashlib.scrypt(pin.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    # SQLite test databases return naive datetimes; PostgreSQL preserves tzinfo.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
