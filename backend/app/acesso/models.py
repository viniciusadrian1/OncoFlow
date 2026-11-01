from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class Papel(str, enum.Enum):
    PACIENTE = "paciente"
    CUIDADOR = "cuidador"
    MEDICO = "medico"
    ENFERMAGEM = "enfermagem"
    NAVEGACAO = "navegacao"
    GESTAO = "gestao"
    ADMIN_DEMO = "admin_demo"


PAPEIS_EQUIPE_ASSISTENCIAL = (Papel.MEDICO, Papel.ENFERMAGEM, Papel.NAVEGACAO)


class Usuario(ModeloBase):
    __tablename__ = "usuario"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    senha_hash: Mapped[str] = mapped_column(String(100))
    papel: Mapped[Papel] = mapped_column(enum_pg(Papel, "papel"))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    # use_alter: paciente também referencia usuario (médico e navegador responsáveis)
    paciente_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("paciente.id", use_alter=True), nullable=True
    )
