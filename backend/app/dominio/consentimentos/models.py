from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class FinalidadeConsentimento(str, enum.Enum):
    GRAVACAO_AUDIO_CONSULTA = "gravacao_audio_consulta"
    TRANSCRICAO_E_IA_CONSULTA = "transcricao_e_ia_consulta"
    CHECKIN = "checkin"
    ASSISTENTE_VOZ = "assistente_voz"
    COMPARTILHAMENTO_CUIDADOR = "compartilhamento_cuidador"


class EstadoConsentimento(str, enum.Enum):
    ATIVO = "ativo"
    REVOGADO = "revogado"


class Consentimento(ModeloBase):
    __tablename__ = "consentimento"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    finalidade: Mapped[FinalidadeConsentimento] = mapped_column(
        enum_pg(FinalidadeConsentimento, "finalidade_consentimento")
    )
    versao_termo: Mapped[str] = mapped_column(String(20))
    estado: Mapped[EstadoConsentimento] = mapped_column(
        enum_pg(EstadoConsentimento, "estado_consentimento"), default=EstadoConsentimento.ATIVO
    )
    concedido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
