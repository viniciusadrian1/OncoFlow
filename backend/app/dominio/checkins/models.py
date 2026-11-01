from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.acesso.models import Papel
from app.db import ModeloBase, enum_pg


class EscalaBemEstar(str, enum.Enum):
    MUITO_BEM = "muito_bem"
    BEM = "bem"
    MAIS_OU_MENOS = "mais_ou_menos"
    MAL = "mal"
    MUITO_MAL = "muito_mal"


class CanalCheckin(str, enum.Enum):
    VISUAL = "visual"
    VOZ = "voz"


class Checkin(ModeloBase):
    """Imutável: correção gera nova linha com substitui_id."""

    __tablename__ = "checkin"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    registrado_por_usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"))
    canal: Mapped[CanalCheckin] = mapped_column(enum_pg(CanalCheckin, "canal_checkin"))
    escala: Mapped[EscalaBemEstar] = mapped_column(enum_pg(EscalaBemEstar, "escala_bem_estar"))
    relatos: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    texto_livre: Mapped[str | None] = mapped_column(Text)
    substitui_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("checkin.id"))
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RegraRevisao(ModeloBase):
    """Critério definido pelo serviço (dado, não código). exemplo=True marca critério ilustrativo."""

    __tablename__ = "regra_revisao"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    nome: Mapped[str] = mapped_column(String(160))
    condicao: Mapped[dict[str, Any]] = mapped_column(JSONB)
    papel_responsavel: Mapped[Papel] = mapped_column(
        Enum(Papel, name="papel", values_callable=lambda c: [m.value for m in c], create_type=False)
    )
    prazo_resposta_horas: Mapped[int] = mapped_column(Integer)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
    exemplo: Mapped[bool] = mapped_column(Boolean, default=False)


class EstadoRevisao(str, enum.Enum):
    AGUARDANDO_REVISAO = "aguardando_revisao"
    EM_REVISAO = "em_revisao"
    REVISADO = "revisado"


class DesfechoRevisao(str, enum.Enum):
    SEM_ACAO_NECESSARIA = "sem_acao_necessaria"
    CONTATO_REALIZADO = "contato_realizado"
    ENCAMINHADO = "encaminhado"


class RevisaoCheckin(ModeloBase):
    __tablename__ = "revisao_checkin"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    checkin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("checkin.id"), index=True)
    regra_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("regra_revisao.id"))
    estado: Mapped[EstadoRevisao] = mapped_column(
        enum_pg(EstadoRevisao, "estado_revisao"), default=EstadoRevisao.AGUARDANDO_REVISAO
    )
    responsavel_papel: Mapped[Papel] = mapped_column(
        Enum(Papel, name="papel", values_callable=lambda c: [m.value for m in c], create_type=False)
    )
    prazo_resposta: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    desfecho: Mapped[DesfechoRevisao | None] = mapped_column(enum_pg(DesfechoRevisao, "desfecho_revisao"))
    nota: Mapped[str | None] = mapped_column(Text)
    revisado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    revisado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
