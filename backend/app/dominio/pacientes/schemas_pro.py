from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class UltimoCheckin(BaseModel):
    escala: str
    enviado_em: datetime


class PacienteResumo(BaseModel):
    id: uuid.UUID
    nome_exibicao: str
    linha_cuidado: str
    etapa_atual: str | None
    tarefas_abertas: int
    tarefas_vencidas: int
    revisoes_aguardando: int
    revisoes_atrasadas: int
    ultimo_checkin: UltimoCheckin | None


class VisaoGeral(BaseModel):
    pacientes: list[PacienteResumo]
    dados_ficticios: bool
