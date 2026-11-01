from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class EstadoEtapa(str, enum.Enum):
    FUTURA = "futura"
    AGUARDANDO = "aguardando"
    PROXIMA = "proxima"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class OrigemEtapa(str, enum.Enum):
    MANUAL = "manual"
    ITEM_EXTRAIDO = "item_extraido"


class EtapaJornada(ModeloBase):
    __tablename__ = "etapa_jornada"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    titulo: Mapped[str] = mapped_column(String(160))
    descricao_paciente: Mapped[str | None] = mapped_column(Text)
    servico_responsavel: Mapped[str | None] = mapped_column(String(120))
    ordem: Mapped[int] = mapped_column(Integer)
    estado: Mapped[EstadoEtapa] = mapped_column(enum_pg(EstadoEtapa, "estado_etapa"))
    data_prevista: Mapped[date | None] = mapped_column(Date)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    origem: Mapped[OrigemEtapa] = mapped_column(enum_pg(OrigemEtapa, "origem_etapa"), default=OrigemEtapa.MANUAL)
    visivel_paciente: Mapped[bool] = mapped_column(Boolean, default=True)
