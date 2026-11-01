from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.contexto import Contexto
from app.auditoria.models import EventoAuditoria


async def registrar(
    sessao: AsyncSession,
    ctx: Contexto,
    *,
    acao: str,
    recurso: str,
    recurso_id: uuid.UUID | None = None,
    paciente_id: uuid.UUID | None = None,
    finalidade: str | None = None,
    antes: dict[str, Any] | None = None,
    depois: dict[str, Any] | None = None,
    motivo: str | None = None,
) -> None:
    """Grava o evento na mesma transação da ação. Passe ids e estados, nunca texto clínico."""
    sessao.add(
        EventoAuditoria(
            instituicao_id=ctx.instituicao_id,
            ator_id=ctx.usuario_id,
            ator_papel=ctx.papel.value,
            acao=acao,
            recurso=recurso,
            recurso_id=recurso_id,
            paciente_id=paciente_id,
            finalidade=finalidade,
            antes=antes,
            depois=depois,
            motivo=motivo,
        )
    )
