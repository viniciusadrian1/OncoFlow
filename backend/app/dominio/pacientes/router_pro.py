from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.contexto import Contexto, requer_papel
from app.acesso.models import PAPEIS_EQUIPE_ASSISTENCIAL
from app.db import obter_sessao
from app.dominio.pacientes import service
from app.dominio.pacientes.schemas_pro import VisaoGeral

router = APIRouter(prefix="/api/pro", tags=["pro"])


@router.get("/pacientes", response_model=VisaoGeral)
async def visao_geral(
    ctx: Contexto = Depends(requer_papel(*PAPEIS_EQUIPE_ASSISTENCIAL)),
    sessao: AsyncSession = Depends(obter_sessao),
) -> VisaoGeral:
    return await service.visao_geral_pro(sessao, ctx)
