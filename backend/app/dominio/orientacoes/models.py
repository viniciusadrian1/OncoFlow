from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class TipoOrientacao(str, enum.Enum):
    PREPARO_EXAME = "preparo_exame"
    FAQ = "faq"
    APOIO = "apoio"


class OrientacaoInstitucional(ModeloBase):
    """Única fonte para preparo de exame e FAQ: texto aprovado pela instituição, nunca gerado pela IA."""

    __tablename__ = "orientacao_institucional"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    titulo: Mapped[str] = mapped_column(String(160))
    tipo: Mapped[TipoOrientacao] = mapped_column(enum_pg(TipoOrientacao, "tipo_orientacao"))
    texto: Mapped[str] = mapped_column(Text)
    aprovada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    versao: Mapped[int] = mapped_column(Integer, default=1)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
