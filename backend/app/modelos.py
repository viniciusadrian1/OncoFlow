"""Importa todos os modelos para registrá-los no metadata (usado pelo Alembic e pelo reset da demo)."""

from app.acesso.models import Usuario
from app.auditoria.models import EventoAuditoria
from app.db import Base
from app.dominio.agenda.models import Compromisso
from app.dominio.checkins.models import Checkin, RegraRevisao, RevisaoCheckin
from app.dominio.consentimentos.models import Consentimento
from app.dominio.consultas.models import Consulta, SegmentoTranscricao
from app.dominio.instituicoes.models import Instituicao
from app.dominio.jornada.models import EtapaJornada
from app.dominio.orientacoes.models import OrientacaoInstitucional
from app.dominio.pacientes.models import Paciente, PreferenciasComunicacao, VinculoEquipe
from app.dominio.tarefas.models import Tarefa

__all__ = [
    "Base",
    "Checkin",
    "Compromisso",
    "Consentimento",
    "Consulta",
    "EtapaJornada",
    "EventoAuditoria",
    "Instituicao",
    "OrientacaoInstitucional",
    "Paciente",
    "PreferenciasComunicacao",
    "RegraRevisao",
    "RevisaoCheckin",
    "SegmentoTranscricao",
    "Tarefa",
    "Usuario",
    "VinculoEquipe",
]
