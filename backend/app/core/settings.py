from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore"
    )

    APP_NAME: str = "Nimbus"
    BASE_URL: str = "http://localhost:5173"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "nimbus"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_SSLMODE: str = "prefer"
    SESSION_HOURS: int = 12
    SEED_HOM_PIN: str = ""
    SEED_PEACH_PIN: str = ""

    SPEECH_PROVIDER: str = "whisperkit"
    WHISPERKIT_BINARY_PATH: str = str(
        Path(__file__).resolve().parents[3]
        / "tools/whisperkit/.build/release/nimbus-whisperkit"
    )
    WHISPERKIT_MODEL_PATH: str = ""
    WHISPERKIT_TOKENIZER_PATH: str = ""
    ARGMAX_TOKEN: str = ""
    ARGMAX_SDK_TOKEN: str = ""
    ARGMAX_BINARY_PATH: str = ""
    ARGMAX_BASE_URL: str = "ws://127.0.0.1:50060/v1/listen"
    ARGMAX_MODEL: str = "parakeet-v3_494MB"
    ARGMAX_MODEL_REPO: str = "argmaxinc/parakeetkit-pro"
    BONSAI_BASE_URL: str = "http://127.0.0.1:18080/v1"
    BONSAI_MODEL: str = "bonsai-9b"

    @property
    def database_url(self) -> URL:
        return URL.create(
            "postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            database=self.POSTGRES_DB,
            query={"sslmode": self.POSTGRES_SSLMODE},
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
