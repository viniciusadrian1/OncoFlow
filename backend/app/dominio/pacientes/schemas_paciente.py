"""Campos que o app do paciente pode receber. Lista explícita: nada de nota interna, tarefa ou IA não validada."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class EtapaPaciente(BaseModel):
    id: uuid.UUID
    titulo: str
    estado: str
    descricao: str | None


class ProximoCompromisso(BaseModel):
    titulo: str
    inicio: datetime
    local: str | None
    preparo_titulo: str | None
    preparo_texto: str | None


class Jornada(BaseModel):
    concluidas: int
    cadastradas: int
    percentual: int
    etapas: list[EtapaPaciente]


class Inicio(BaseModel):
    nome_exibicao: str
    assistente_nome: str
    proximo_compromisso: ProximoCompromisso | None
    jornada: Jornada
