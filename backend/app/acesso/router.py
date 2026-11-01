from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.contexto import Contexto, contexto_atual
from app.acesso.models import Usuario
from app.acesso.seguranca import criar_token, verificar_senha
from app.db import obter_sessao
from app.erros import ErroApi

router = APIRouter(prefix="/api/auth", tags=["acesso"])


class Credenciais(BaseModel):
    email: str
    senha: str


class Token(BaseModel):
    token: str
    papel: str
    nome: str


class Eu(BaseModel):
    nome: str
    papel: str


@router.post("/entrar", response_model=Token)
async def entrar(dados: Credenciais, sessao: AsyncSession = Depends(obter_sessao)) -> Token:
    usuario = await sessao.scalar(select(Usuario).where(Usuario.email == dados.email.strip().lower()))
    # Mesma mensagem para e-mail inexistente e senha errada: não revela quem tem conta
    if usuario is None or not usuario.ativo or not verificar_senha(dados.senha, usuario.senha_hash):
        raise ErroApi(401, "credenciais_invalidas", "E-mail ou senha incorretos.")
    return Token(token=criar_token(usuario), papel=usuario.papel.value, nome=usuario.nome)


@router.get("/eu", response_model=Eu)
async def eu(ctx: Contexto = Depends(contexto_atual)) -> Eu:
    return Eu(nome=ctx.nome, papel=ctx.papel.value)
