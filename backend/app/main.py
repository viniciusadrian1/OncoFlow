from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app import db
from app.acesso.router import router as router_acesso
from app.config import Config, obter_config
from app.dominio.pacientes.router_paciente import router as router_paciente_inicio
from app.dominio.pacientes.router_pro import router as router_pro_pacientes
from app.erros import registrar_tratadores


def create_app(config: Config | None = None) -> FastAPI:
    config = config or obter_config()
    db.configurar(config.database_url, pool_nulo=config.database_pool_nulo)

    @asynccontextmanager
    async def ciclo_de_vida(_: FastAPI) -> AsyncIterator[None]:
        if config.demo_mode:
            await _semear_se_vazio()
        yield
        await db.encerrar()

    app = FastAPI(title="OncoFlow API", version="0.1.0", lifespan=ciclo_de_vida)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origens,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )
    registrar_tratadores(app)

    app.include_router(router_acesso)
    app.include_router(router_paciente_inicio)
    app.include_router(router_pro_pacientes)
    if config.demo_mode:
        # Importado só aqui: fora do modo demo as rotas nem existem
        from app.demo.router import router as router_demo

        app.include_router(router_demo)

    @app.get("/api/saude", tags=["infra"])
    async def saude() -> dict[str, str | bool]:
        return {"status": "ok", "demo": config.demo_mode}

    return app


async def _semear_se_vazio() -> None:
    """Primeira subida da demo com banco vazio: já deixa o cenário pronto para abrir os apps."""
    from app.demo.seed import semear
    from app.dominio.instituicoes.models import Instituicao

    async with db.fabrica_sessao()() as sessao, sessao.begin():
        if not await sessao.scalar(select(func.count()).select_from(Instituicao)):
            await semear(sessao)


app = create_app()
