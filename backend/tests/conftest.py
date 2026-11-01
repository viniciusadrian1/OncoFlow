"""Testes contra o Postgres do docker compose, num banco separado (oncoflow_teste).

A sessão de testes desce todas as migrações e sobe de novo: assim o downgrade também é testado.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url

os.environ.setdefault("JWT_SEGREDO", "segredo-apenas-para-testes-com-32-bytes-ou-mais")
os.environ["DEMO_MODE"] = "true"
os.environ["DEMO_SENHA"] = "senha-de-teste"
os.environ["DATABASE_POOL_NULO"] = "true"
os.environ["IA_MODO"] = "fixture"

from app.config import Config, obter_config  # noqa: E402

URL_TESTE = os.environ.get("DATABASE_URL_TESTE") or make_url(Config().database_url).set(
    database="oncoflow_teste"
).render_as_string(hide_password=False)
os.environ["DATABASE_URL"] = URL_TESTE
obter_config.cache_clear()

from app.main import create_app  # noqa: E402

SENHA = "senha-de-teste"
DOMINIO = "demo.oncoflow.test"
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def banco_migrado() -> None:
    cfg = AlembicConfig(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.attributes["url"] = URL_TESTE
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture
async def cliente() -> AsyncIterator[AsyncClient]:
    app = create_app(obter_config())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://teste") as c:
        resposta = await c.post("/api/demo/reset")
        assert resposta.status_code == 200, resposta.text
        yield c


async def entrar(cliente: AsyncClient, login: str) -> dict[str, str]:
    resposta = await cliente.post("/api/auth/entrar", json={"email": f"{login}@{DOMINIO}", "senha": SENHA})
    assert resposta.status_code == 200, resposta.text
    return {"Authorization": f"Bearer {resposta.json()['token']}"}
