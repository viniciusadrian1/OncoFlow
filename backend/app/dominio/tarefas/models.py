from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.acesso.models import Papel
from app.db import ModeloBase, enum_pg


class TipoTarefa(str, enum.Enum):
    EXAME = "exame"
    CONSULTA = "consulta"
    AUTORIZACAO = "autorizacao"
    ENCAMINHAMENTO = "encaminhamento"
    CONTATO = "contato"
    OUTRO = "outro"


class EstadoTarefa(str, enum.Enum):
    """Vencida não é estado: é derivada de prazo < agora com a tarefa ainda aberta."""

    ABERTA = "aberta"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


ESTADOS_TAREFA_ABERTOS = (EstadoTarefa.ABERTA, EstadoTarefa.EM_ANDAMENTO)


class OrigemTarefa(str, enum.Enum):
    MANUAL = "manual"
    ITEM_EXTRAIDO = "item_extraido"
    SOLICITACAO = "solicitacao"


class Tarefa(ModeloBase):
    __tablename__ = "tarefa"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    etapa_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("etapa_jornada.id"))
    tipo: Mapped[TipoTarefa] = mapped_column(enum_pg(TipoTarefa, "tipo_tarefa"))
    descricao: Mapped[str] = mapped_column(Text)
    responsavel_usuario_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    # Reaproveita o tipo "papel" criado pela tabela usuario
    responsavel_papel: Mapped[Papel | None] = mapped_column(
        Enum(Papel, name="papel", values_callable=lambda c: [m.value for m in c], create_type=False)
    )
    prazo: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    estado: Mapped[EstadoTarefa] = mapped_column(enum_pg(EstadoTarefa, "estado_tarefa"), default=EstadoTarefa.ABERTA)
    motivo_cancelamento: Mapped[str | None] = mapped_column(String(300))
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    origem: Mapped[OrigemTarefa] = mapped_column(enum_pg(OrigemTarefa, "origem_tarefa"), default=OrigemTarefa.MANUAL)
