from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class TipoCompromisso(str, enum.Enum):
    CONSULTA = "consulta"
    EXAME = "exame"
    PROCEDIMENTO = "procedimento"
    OUTRO = "outro"


class OrigemCompromisso(str, enum.Enum):
    SIMULADO = "simulado"
    INTEGRACAO = "integracao"


class Compromisso(ModeloBase):
    """Agenda simulada: nenhuma integração com a agenda hospitalar é presumida no MVP."""

    __tablename__ = "compromisso"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    etapa_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("etapa_jornada.id"))
    tipo: Mapped[TipoCompromisso] = mapped_column(enum_pg(TipoCompromisso, "tipo_compromisso"))
    titulo: Mapped[str] = mapped_column(String(160))
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    local: Mapped[str | None] = mapped_column(String(160))
    orientacao_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orientacao_institucional.id"))
    origem: Mapped[OrigemCompromisso] = mapped_column(
        enum_pg(OrigemCompromisso, "origem_compromisso"), default=OrigemCompromisso.SIMULADO
    )
