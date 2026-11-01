"""Rotas da demonstração. Só são registradas quando DEMO_MODE=true (ver app.main.create_app)."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.models import Papel, Usuario
from app.acesso.router import Token
from app.acesso.seguranca import criar_token
from app.db import obter_sessao
from app.demo import seed
from app.dominio.pacientes.models import Paciente
from app.erros import ErroApi

router = APIRouter(prefix="/api/demo", tags=["demo"])

# Na barra de troca de usuário, o app do paciente mostra só a protagonista da demo
EMAIL_PROTAGONISTA = f"maria@{seed.DOMINIO_EMAIL}"
# Ordem em que os perfis aparecem no roteiro: médica, navegação, enfermagem; gestão por último
ORDEM_PAPEIS = [Papel.MEDICO, Papel.NAVEGACAO, Papel.ENFERMAGEM, Papel.GESTAO, Papel.PACIENTE]


class UsuarioDemo(BaseModel):
    id: uuid.UUID
    nome: str
    papel: str
    app: Literal["pro", "paciente"]


class ResultadoReset(BaseModel):
    ok: bool
    pacientes: int


@router.get("/usuarios", response_model=list[UsuarioDemo])
async def usuarios(sessao: AsyncSession = Depends(obter_sessao)) -> list[UsuarioDemo]:
    todos = (await sessao.scalars(select(Usuario).where(Usuario.ativo.is_(True)))).all()
    todos = sorted(todos, key=lambda u: (ORDEM_PAPEIS.index(u.papel) if u.papel in ORDEM_PAPEIS else 99, u.nome))
    return [
        UsuarioDemo(id=u.id, nome=u.nome, papel=u.papel.value, app="paciente" if u.papel is Papel.PACIENTE else "pro")
        for u in todos
        if u.papel is not Papel.PACIENTE or u.email == EMAIL_PROTAGONISTA
    ]


@router.post("/entrar/{usuario_id}", response_model=Token)
async def entrar_como(usuario_id: uuid.UUID, sessao: AsyncSession = Depends(obter_sessao)) -> Token:
    usuario = await sessao.get(Usuario, usuario_id)
    if usuario is None or not usuario.ativo:
        raise ErroApi(404, "nao_encontrado", "Usuário de demonstração não encontrado.")
    return Token(token=criar_token(usuario), papel=usuario.papel.value, nome=usuario.nome)


@router.post("/reset", response_model=ResultadoReset)
async def reset(sessao: AsyncSession = Depends(obter_sessao)) -> ResultadoReset:
    await seed.resetar(sessao)
    total = await sessao.scalar(select(func.count()).select_from(Paciente))
    return ResultadoReset(ok=True, pacientes=total or 0)
