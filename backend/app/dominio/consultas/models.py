from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class Consulta(ModeloBase):
    __tablename__ = "consulta"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    medico_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"))
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fim: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Nulo = consulta sem gravação
    consentimento_audio_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("consentimento.id"))


class Interlocutor(str, enum.Enum):
    MEDICO = "medico"
    PACIENTE = "paciente"
    ACOMPANHANTE = "acompanhante"
    NAO_IDENTIFICADO = "nao_identificado"


class SegmentoTranscricao(ModeloBase):
    """Nível da fala literal: base de toda evidência citada pela IA."""

    __tablename__ = "segmento_transcricao"

    consulta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consulta.id"), index=True)
    codigo: Mapped[str] = mapped_column(String(10))  # id estável usado nas citações (ex.: "s07")
    ordem: Mapped[int] = mapped_column(Integer)
    interlocutor: Mapped[Interlocutor] = mapped_column(enum_pg(Interlocutor, "interlocutor"))
    texto: Mapped[str] = mapped_column(Text)
    inicio_ms: Mapped[int | None] = mapped_column(Integer)
    fim_ms: Mapped[int | None] = mapped_column(Integer)
