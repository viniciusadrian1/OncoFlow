from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class EventoAuditoria(Base):
    """Somente inserção. UPDATE, DELETE e TRUNCATE são bloqueados por trigger no banco (ver migração).

    Grava ids, estados e finalidade — nunca o conteúdo de fala, relato ou documento.
    """

    __tablename__ = "evento_auditoria"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    ator_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    ator_papel: Mapped[str | None] = mapped_column(String(30))
    via_delegacao_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    acao: Mapped[str] = mapped_column(String(40))
    recurso: Mapped[str] = mapped_column(String(60))
    recurso_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    paciente_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("paciente.id"), index=True)
    finalidade: Mapped[str | None] = mapped_column(String(40))
    antes: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    depois: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    motivo: Mapped[str | None] = mapped_column(String(300))
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
