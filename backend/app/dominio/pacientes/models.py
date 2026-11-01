from __future__ import annotations

import enum
import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import ModeloBase, enum_pg


class Paciente(ModeloBase):
    __tablename__ = "paciente"

    instituicao_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instituicao.id"), index=True)
    nome_exibicao: Mapped[str] = mapped_column(String(120))
    linha_cuidado: Mapped[str] = mapped_column(String(60))
    medico_responsavel_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    navegador_responsavel_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))


class VinculoEquipe(ModeloBase):
    """Quem da equipe acompanha o paciente. Sem vínculo, o profissional não acessa o paciente."""

    __tablename__ = "vinculo_equipe"
    __table_args__ = (UniqueConstraint("paciente_id", "usuario_id"),)

    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), index=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), index=True)
    funcao: Mapped[str] = mapped_column(String(60))


class ModoInteracao(str, enum.Enum):
    VISUAL = "visual"
    VOZ = "voz"
    AMBOS = "ambos"


class TamanhoFonte(str, enum.Enum):
    PADRAO = "padrao"
    GRANDE = "grande"
    MUITO_GRANDE = "muito_grande"


class PreferenciasComunicacao(ModeloBase):
    __tablename__ = "preferencias_comunicacao"

    paciente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("paciente.id"), unique=True)
    modo_preferido: Mapped[ModoInteracao] = mapped_column(
        enum_pg(ModoInteracao, "modo_interacao"), default=ModoInteracao.AMBOS
    )
    velocidade_audio: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("1.00"))
    tamanho_fonte: Mapped[TamanhoFonte] = mapped_column(
        enum_pg(TamanhoFonte, "tamanho_fonte"), default=TamanhoFonte.PADRAO
    )
    forma_tratamento: Mapped[str | None] = mapped_column(String(40))
    frequencia_checkin: Mapped[str] = mapped_column(String(30), default="semanal")
