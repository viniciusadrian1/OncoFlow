from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.contexto import Contexto, contexto_paciente
from app.db import obter_sessao
from app.dominio.pacientes import service
from app.dominio.pacientes.schemas_paciente import Inicio

router = APIRouter(prefix="/api/paciente", tags=["paciente"])


@router.get("/inicio", response_model=Inicio)
async def inicio(ctx: Contexto = Depends(contexto_paciente), sessao: AsyncSession = Depends(obter_sessao)) -> Inicio:
    return await service.inicio_paciente(sessao, ctx)
