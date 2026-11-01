from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.acesso.models import Usuario
from app.config import obter_config

ALGORITMO = "HS256"


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(senha.encode(), senha_hash.encode())


def criar_token(usuario: Usuario) -> str:
    config = obter_config()
    agora = datetime.now(UTC)
    dados = {
        "sub": str(usuario.id),
        "papel": usuario.papel.value,
        "inst": str(usuario.instituicao_id),
        "iat": agora,
        "exp": agora + timedelta(minutes=config.jwt_minutos),
    }
    return jwt.encode(dados, config.jwt_segredo, algorithm=ALGORITMO)


def ler_token(token: str) -> uuid.UUID | None:
    """Devolve o id do usuário se o token for válido. Papel e instituição são relidos do banco."""
    try:
        dados = jwt.decode(token, obter_config().jwt_segredo, algorithms=[ALGORITMO])
        return uuid.UUID(dados["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
