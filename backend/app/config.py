"""Configuração lida do ambiente (.env). Falha cedo se faltar segredo obrigatório."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_REPOSITORIO = Path(__file__).resolve().parents[2]


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(RAIZ_REPOSITORIO / ".env", ".env"), extra="ignore", case_sensitive=False
    )

    database_url: str = "postgresql+asyncpg://oncoflow:oncoflow@localhost:5432/oncoflow"
    # Pool nulo nos testes: cada teste roda num event loop próprio e conexões asyncpg não migram de loop
    database_pool_nulo: bool = False

    jwt_segredo: str
    jwt_minutos: int = 15

    demo_mode: bool = False
    demo_senha: str = ""

    cors_origens: list[str] = ["http://localhost:5173", "http://localhost:5174"]
    fixtures_dir: Path = RAIZ_REPOSITORIO / "fixtures"

    ia_modo: str = "fixture"


@lru_cache
def obter_config() -> Config:
    return Config()
