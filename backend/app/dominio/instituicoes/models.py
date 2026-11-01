from __future__ import annotations

from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase


class Instituicao(ModeloBase):
    __tablename__ = "instituicao"

    nome: Mapped[str] = mapped_column(String(160))
    fuso: Mapped[str] = mapped_column(String(64), default="America/Sao_Paulo")
    # prazos padrão por tipo de tarefa, texto de urgência aprovado, nome da assistente, frequência de check-in
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
