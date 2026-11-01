"""Quem está chamando a API: usuário, papel, instituição e (para o app do paciente) qual paciente."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.models import Papel, Usuario
from app.acesso.seguranca import ler_token
from app.db import obter_sessao
from app.erros import ErroApi

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Contexto:
    usuario_id: uuid.UUID
    nome: str
    papel: Papel
    instituicao_id: uuid.UUID
    paciente_id: uuid.UUID | None


async def contexto_atual(
    credenciais: HTTPAuthorizationCredentials | None = Depends(_bearer),
    sessao: AsyncSession = Depends(obter_sessao),
) -> Contexto:
    if credenciais is None:
        raise ErroApi(401, "nao_autenticado", "Faça login para continuar.")
    usuario_id = ler_token(credenciais.credentials)
    usuario = await sessao.get(Usuario, usuario_id) if usuario_id else None
    if usuario is None or not usuario.ativo:
        raise ErroApi(401, "sessao_invalida", "Sua sessão expirou. Entre novamente.")
    # Papel e instituição vêm do banco, não do token: desativar ou trocar o papel vale na hora
    return Contexto(usuario.id, usuario.nome, usuario.papel, usuario.instituicao_id, usuario.paciente_id)


def requer_papel(*papeis: Papel) -> Callable[..., Awaitable[Contexto]]:
    async def _verificar(ctx: Contexto = Depends(contexto_atual)) -> Contexto:
        if ctx.papel not in papeis:
            raise ErroApi(403, "sem_permissao", "Seu perfil não tem acesso a esta área.")
        return ctx

    return _verificar


async def contexto_paciente(ctx: Contexto = Depends(contexto_atual)) -> Contexto:
    """Rotas /api/paciente/*: o paciente vem sempre do token, nunca da URL ou do corpo.

    Cuidadores entram por delegação com escopos (ainda não implementada): até lá, ficam de fora.
    """
    if ctx.papel is not Papel.PACIENTE or ctx.paciente_id is None:
        raise ErroApi(403, "sem_permissao", "Esta área é do app do paciente.")
    return ctx
