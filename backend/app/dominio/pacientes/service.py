from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import and_, case, func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.contexto import Contexto
from app.auditoria import service as auditoria
from app.config import obter_config
from app.dominio.agenda.models import Compromisso
from app.dominio.checkins.models import Checkin, EstadoRevisao, RevisaoCheckin
from app.dominio.instituicoes.models import Instituicao
from app.dominio.jornada.models import EstadoEtapa, EtapaJornada
from app.dominio.orientacoes.models import OrientacaoInstitucional
from app.dominio.pacientes import schemas_paciente as sp
from app.dominio.pacientes import schemas_pro as spro
from app.dominio.pacientes.models import Paciente, VinculoEquipe
from app.dominio.tarefas.models import ESTADOS_TAREFA_ABERTOS, Tarefa
from app.erros import ErroApi

# Ordem de prioridade para "etapa atual" no Pro
_PRIORIDADE_ETAPA_ATUAL = (EstadoEtapa.EM_ANDAMENTO, EstadoEtapa.PROXIMA, EstadoEtapa.AGUARDANDO)


async def inicio_paciente(sessao: AsyncSession, ctx: Contexto) -> sp.Inicio:
    paciente = await sessao.get(Paciente, ctx.paciente_id)
    if paciente is None or paciente.instituicao_id != ctx.instituicao_id:
        raise ErroApi(404, "nao_encontrado", "Paciente não encontrado.")
    instituicao = await sessao.get(Instituicao, paciente.instituicao_id)

    etapas = (
        await sessao.scalars(
            select(EtapaJornada)
            .where(
                EtapaJornada.paciente_id == paciente.id,
                EtapaJornada.visivel_paciente.is_(True),
                EtapaJornada.estado != EstadoEtapa.CANCELADA,
            )
            .order_by(EtapaJornada.ordem)
        )
    ).all()
    concluidas = sum(e.estado is EstadoEtapa.CONCLUIDA for e in etapas)
    cadastradas = len(etapas)

    linha = (
        await sessao.execute(
            select(Compromisso, OrientacaoInstitucional)
            .outerjoin(
                OrientacaoInstitucional,
                and_(
                    OrientacaoInstitucional.id == Compromisso.orientacao_id,
                    OrientacaoInstitucional.ativa.is_(True),
                ),
            )
            .where(Compromisso.paciente_id == paciente.id, Compromisso.inicio >= datetime.now(UTC))
            .order_by(Compromisso.inicio)
            .limit(1)
        )
    ).first()
    proximo = None
    if linha:
        compromisso, orientacao = linha
        proximo = sp.ProximoCompromisso(
            titulo=compromisso.titulo,
            inicio=compromisso.inicio,
            local=compromisso.local,
            preparo_titulo=orientacao.titulo if orientacao else None,
            preparo_texto=orientacao.texto if orientacao else None,
        )

    return sp.Inicio(
        nome_exibicao=paciente.nome_exibicao,
        assistente_nome=(instituicao.config or {}).get("assistente_nome", "Lia"),
        proximo_compromisso=proximo,
        jornada=sp.Jornada(
            concluidas=concluidas,
            cadastradas=cadastradas,
            percentual=round(100 * concluidas / cadastradas) if cadastradas else 0,
            etapas=[
                sp.EtapaPaciente(id=e.id, titulo=e.titulo, estado=e.estado.value, descricao=e.descricao_paciente)
                for e in etapas
            ],
        ),
    )


async def visao_geral_pro(sessao: AsyncSession, ctx: Contexto) -> spro.VisaoGeral:
    """Pacientes acompanhados pelo profissional (vínculo + mesma instituição), com sinais operacionais."""
    agora = datetime.now(UTC)

    pacientes = (
        await sessao.scalars(
            select(Paciente)
            .join(VinculoEquipe, VinculoEquipe.paciente_id == Paciente.id)
            .where(VinculoEquipe.usuario_id == ctx.usuario_id, Paciente.instituicao_id == ctx.instituicao_id)
            .order_by(Paciente.nome_exibicao)
        )
    ).all()
    ids = [p.id for p in pacientes]
    if not ids:
        return spro.VisaoGeral(pacientes=[], dados_ficticios=obter_config().demo_mode)

    tarefas = dict(
        (pid, (abertas, vencidas))
        for pid, abertas, vencidas in await sessao.execute(
            select(
                Tarefa.paciente_id,
                func.count(),
                func.count().filter(Tarefa.prazo < agora),
            )
            .where(Tarefa.paciente_id.in_(ids), Tarefa.estado.in_(ESTADOS_TAREFA_ABERTOS))
            .group_by(Tarefa.paciente_id)
        )
    )
    revisoes = dict(
        (pid, (aguardando, atrasadas))
        for pid, aguardando, atrasadas in await sessao.execute(
            select(
                Checkin.paciente_id,
                func.count(),
                func.count().filter(RevisaoCheckin.prazo_resposta < agora),
            )
            .join(Checkin, Checkin.id == RevisaoCheckin.checkin_id)
            .where(Checkin.paciente_id.in_(ids), RevisaoCheckin.estado != EstadoRevisao.REVISADO)
            .group_by(Checkin.paciente_id)
        )
    )
    ultimos = {
        c.paciente_id: c
        for c in await sessao.scalars(
            select(Checkin)
            .where(Checkin.paciente_id.in_(ids))
            .ext(distinct_on(Checkin.paciente_id))
            .order_by(Checkin.paciente_id, Checkin.enviado_em.desc())
        )
    }
    prioridade = case(
        {estado: i for i, estado in enumerate(_PRIORIDADE_ETAPA_ATUAL)}, value=EtapaJornada.estado
    )
    etapas_atuais = {
        e.paciente_id: e.titulo
        for e in await sessao.scalars(
            select(EtapaJornada)
            .where(EtapaJornada.paciente_id.in_(ids), EtapaJornada.estado.in_(_PRIORIDADE_ETAPA_ATUAL))
            .ext(distinct_on(EtapaJornada.paciente_id))
            .order_by(EtapaJornada.paciente_id, prioridade, EtapaJornada.ordem)
        )
    }

    # A escala do último check-in é dado de saúde: a leitura da lista fica registrada
    await auditoria.registrar(sessao, ctx, acao="ler", recurso="visao_geral_pacientes", finalidade="cuidado")

    def resumo(p: Paciente) -> spro.PacienteResumo:
        abertas, vencidas = tarefas.get(p.id, (0, 0))
        aguardando, atrasadas = revisoes.get(p.id, (0, 0))
        ultimo = ultimos.get(p.id)
        return spro.PacienteResumo(
            id=p.id,
            nome_exibicao=p.nome_exibicao,
            linha_cuidado=p.linha_cuidado,
            etapa_atual=etapas_atuais.get(p.id),
            tarefas_abertas=abertas,
            tarefas_vencidas=vencidas,
            revisoes_aguardando=aguardando,
            revisoes_atrasadas=atrasadas,
            ultimo_checkin=spro.UltimoCheckin(escala=ultimo.escala.value, enviado_em=ultimo.enviado_em)
            if ultimo
            else None,
        )

    return spro.VisaoGeral(pacientes=[resumo(p) for p in pacientes], dados_ficticios=obter_config().demo_mode)
