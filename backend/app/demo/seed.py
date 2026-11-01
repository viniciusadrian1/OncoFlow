"""Dados fictícios da demonstração. Idempotente: resetar() apaga tudo e recria o mesmo cenário.

Cenário (skill oncoflow-demo-hackathon): Maria, câncer de mama, na consulta oncológica em que relata a
preocupação com fertilidade. Não existe etapa de fertilidade antes da demo: ela nasce da aprovação ao vivo.
Outros pacientes dão realismo ao OncoFlow Pro (tarefas vencidas, revisões no prazo e atrasadas).
"""

from __future__ import annotations

import json
import re
import unicodedata
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.acesso.models import Papel, Usuario
from app.acesso.seguranca import hash_senha
from app.config import obter_config
from app.db import Base
from app.dominio.agenda.models import Compromisso, TipoCompromisso
from app.dominio.checkins.models import (
    CanalCheckin,
    Checkin,
    EscalaBemEstar,
    RegraRevisao,
    RevisaoCheckin,
)
from app.dominio.consentimentos.models import Consentimento, FinalidadeConsentimento
from app.dominio.consultas.models import Consulta, Interlocutor, SegmentoTranscricao
from app.dominio.instituicoes.models import Instituicao
from app.dominio.jornada.models import EstadoEtapa, EtapaJornada
from app.dominio.orientacoes.models import OrientacaoInstitucional, TipoOrientacao
from app.dominio.pacientes.models import Paciente, PreferenciasComunicacao, VinculoEquipe
from app.dominio.tarefas.models import Tarefa, TipoTarefa

FUSO = ZoneInfo("America/Sao_Paulo")
DOMINIO_EMAIL = "demo.oncoflow.test"  # .test é reservado: nenhum e-mail real
VERSAO_TERMO = "demo-1"

E = EstadoEtapa


def _login(nome: str) -> str:
    """Login do e-mail fictício a partir do nome de exibição: Lúcia M. -> lucia.m"""
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return ".".join(re.findall(r"[a-z]+", sem_acento.lower()))


def proxima_quinta_10h30(agora: datetime) -> datetime:
    local = agora.astimezone(FUSO)
    dias = (3 - local.weekday()) % 7
    alvo = datetime.combine(local.date() + timedelta(days=dias), time(10, 30), tzinfo=FUSO)
    if alvo <= local:
        alvo += timedelta(days=7)
    return alvo.astimezone(UTC)


async def resetar(sessao: AsyncSession) -> None:
    """Apaga todas as tabelas (inclusive a auditoria, liberada só nesta transação) e semeia de novo."""
    tabelas = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    await sessao.execute(text("SET LOCAL oncoflow.permitir_reset = 'on'"))
    await sessao.execute(text(f"TRUNCATE {tabelas} RESTART IDENTITY CASCADE"))
    await semear(sessao)


async def semear(sessao: AsyncSession) -> None:
    config = obter_config()
    agora = datetime.now(UTC)
    senha_hash = hash_senha(config.demo_senha or "demo")

    inst = Instituicao(
        nome="Cancer Center de Demonstração (fictício)",
        config={
            "assistente_nome": "Lia",
            "frequencia_checkin_padrao": "semanal",
            "prazo_padrao_horas": {
                "encaminhamento": 72, "exame": 72, "consulta": 72, "autorizacao": 48, "contato": 24, "outro": 72,
            },
            "texto_urgencia": (
                "[Instruções de urgência a definir pelo hospital — ex.: procure o pronto atendimento "
                "ou ligue 192]"
            ),
            "quem_ve_checkin": "Sua equipe de enfermagem e seu médico. Para acompanhar como você está entre as consultas.",
        },
    )
    sessao.add(inst)
    await sessao.flush()

    def usuario(nome: str, login: str, papel: Papel) -> Usuario:
        u = Usuario(
            instituicao_id=inst.id, nome=nome, email=f"{login}@{DOMINIO_EMAIL}", senha_hash=senha_hash, papel=papel
        )
        sessao.add(u)
        return u

    ana = usuario("Dra. Ana Souza", "ana", Papel.MEDICO)
    bruno = usuario("Enf. Bruno Lima", "bruno", Papel.ENFERMAGEM)
    carla = usuario("Carla Mendes", "carla", Papel.NAVEGACAO)
    usuario("Diego Ramos", "diego", Papel.GESTAO)
    equipe = [(ana, "medica"), (bruno, "enfermagem"), (carla, "navegacao")]
    await sessao.flush()

    orientacao_consulta = OrientacaoInstitucional(
        instituicao_id=inst.id,
        titulo="Como se preparar para a consulta com especialista",
        tipo=TipoOrientacao.PREPARO_EXAME,
        texto=(
            "Leve seus exames anteriores e a lista dos remédios que você usa. "
            "Chegue 30 minutos antes para o atendimento na recepção."
        ),
        aprovada_por=ana.id,
    )
    sessao.add(orientacao_consulta)

    regra_cansaco = RegraRevisao(
        instituicao_id=inst.id,
        nome="Check-in Mal ou Muito mal com relato de cansaço (critério ilustrativo — a definir com o serviço)",
        condicao={"escala_em": ["mal", "muito_mal"], "relato_marcado": "cansaco"},
        papel_responsavel=Papel.ENFERMAGEM,
        prazo_resposta_horas=24,
        exemplo=True,
    )
    regra_piora = RegraRevisao(
        instituicao_id=inst.id,
        nome="Piora em 3 check-ins seguidos (critério ilustrativo — a definir com o serviço)",
        condicao={"piora_consecutiva": 3},
        papel_responsavel=Papel.NAVEGACAO,
        prazo_resposta_horas=48,
        exemplo=True,
    )
    sessao.add_all([regra_cansaco, regra_piora])
    await sessao.flush()

    usuario_do_paciente: dict[uuid.UUID, Usuario] = {}

    async def paciente(nome: str, linha: str, etapas: list[tuple[str, EstadoEtapa, str | None]]) -> Paciente:
        p = Paciente(
            instituicao_id=inst.id,
            nome_exibicao=nome,
            linha_cuidado=linha,
            medico_responsavel_id=ana.id,
            navegador_responsavel_id=carla.id,
        )
        sessao.add(p)
        await sessao.flush()
        conta = usuario(nome, _login(nome), Papel.PACIENTE)
        conta.paciente_id = p.id
        usuario_do_paciente[p.id] = conta
        sessao.add(PreferenciasComunicacao(paciente_id=p.id))
        for membro, funcao in equipe:
            sessao.add(VinculoEquipe(paciente_id=p.id, usuario_id=membro.id, funcao=funcao))
        for ordem, (titulo, estado, descricao) in enumerate(etapas, start=1):
            sessao.add(
                EtapaJornada(
                    instituicao_id=inst.id,
                    paciente_id=p.id,
                    titulo=titulo,
                    descricao_paciente=descricao,
                    ordem=ordem,
                    estado=estado,
                    concluida_em=agora - timedelta(days=30 - ordem * 5) if estado is E.CONCLUIDA else None,
                )
            )
        await sessao.flush()  # gera os ids (conta do paciente) usados pelos check-ins
        return p

    def checkin(p: Paciente, escala: EscalaBemEstar, ha: timedelta, relatos: dict | None = None) -> Checkin:
        c = Checkin(
            instituicao_id=inst.id,
            paciente_id=p.id,
            registrado_por_usuario_id=usuario_do_paciente[p.id].id,
            canal=CanalCheckin.VISUAL,
            escala=escala,
            relatos=relatos or {},
            enviado_em=agora - ha,
        )
        sessao.add(c)
        return c

    def tarefa(p: Paciente, tipo: TipoTarefa, descricao: str, prazo: timedelta) -> None:
        sessao.add(
            Tarefa(
                instituicao_id=inst.id,
                paciente_id=p.id,
                tipo=tipo,
                descricao=descricao,
                responsavel_usuario_id=carla.id,
                responsavel_papel=Papel.NAVEGACAO,
                prazo=agora + prazo,
            )
        )

    # --- Maria: protagonista da demo -------------------------------------------------------------
    maria = await paciente(
        "Maria",
        "mama",
        [
            ("Diagnóstico registrado", E.CONCLUIDA, "Seu diagnóstico foi registrado pela equipe."),
            ("Consulta oncológica", E.EM_ANDAMENTO, "Conversa com a oncologista sobre as próximas etapas."),
            ("Exames pré-tratamento", E.AGUARDANDO, "Exames pedidos antes de começar o tratamento."),
            ("Início do tratamento", E.FUTURA, "A equipe vai combinar a data com você."),
            ("Acompanhamento", E.FUTURA, "Consultas e check-ins ao longo do tratamento."),
        ],
    )
    await sessao.flush()

    sessao.add(
        Compromisso(
            instituicao_id=inst.id,
            paciente_id=maria.id,
            tipo=TipoCompromisso.CONSULTA,
            titulo="Consulta com especialista",
            inicio=proxima_quinta_10h30(agora),
            local="Ambulatório de Oncologia, 3º andar (fictício)",
            orientacao_id=orientacao_consulta.id,
        )
    )
    consentimentos = {
        f: Consentimento(
            instituicao_id=inst.id, paciente_id=maria.id, finalidade=f, versao_termo=VERSAO_TERMO,
            concedido_em=agora - timedelta(days=1),
        )
        for f in (
            FinalidadeConsentimento.GRAVACAO_AUDIO_CONSULTA,
            FinalidadeConsentimento.TRANSCRICAO_E_IA_CONSULTA,
            FinalidadeConsentimento.CHECKIN,
            FinalidadeConsentimento.ASSISTENTE_VOZ,
        )
    }
    sessao.add_all(consentimentos.values())
    await sessao.flush()

    consulta = Consulta(
        instituicao_id=inst.id,
        paciente_id=maria.id,
        medico_id=ana.id,
        inicio=agora - timedelta(minutes=30),
        consentimento_audio_id=consentimentos[FinalidadeConsentimento.GRAVACAO_AUDIO_CONSULTA].id,
    )
    sessao.add(consulta)
    await sessao.flush()
    transcricao = json.loads((config.fixtures_dir / "transcricoes" / "mama-fertilidade.json").read_text("utf-8"))
    for ordem, seg in enumerate(transcricao["segmentos"], start=1):
        sessao.add(
            SegmentoTranscricao(
                consulta_id=consulta.id,
                codigo=seg["codigo"],
                ordem=ordem,
                interlocutor=Interlocutor(seg["interlocutor"]),
                texto=seg["texto"],
                inicio_ms=seg.get("inicio_ms"),
            )
        )

    checkin(maria, EscalaBemEstar.BEM, timedelta(days=14))
    checkin(maria, EscalaBemEstar.BEM, timedelta(days=7))
    checkin(maria, EscalaBemEstar.MAIS_OU_MENOS, timedelta(days=2))

    # --- Outros pacientes: realismo para o OncoFlow Pro ------------------------------------------
    padrao = [
        ("Diagnóstico registrado", E.CONCLUIDA, None),
        ("Consulta oncológica", E.CONCLUIDA, None),
        ("Exames pré-tratamento", E.EM_ANDAMENTO, None),
        ("Início do tratamento", E.FUTURA, None),
    ]
    joao = await paciente("João P.", "pulmão", padrao)
    tarefa(joao, TipoTarefa.AUTORIZACAO, "Autorização do convênio para tomografia de tórax", -timedelta(days=4))

    helena = await paciente("Helena R.", "mama", padrao)
    tarefa(helena, TipoTarefa.EXAME, "Agendar ressonância das mamas", -timedelta(days=2))

    antonio = await paciente("Antônio S.", "próstata", padrao)
    c = checkin(antonio, EscalaBemEstar.MAL, timedelta(hours=3), {"cansaco": True})
    await sessao.flush()
    sessao.add(
        RevisaoCheckin(
            instituicao_id=inst.id, checkin_id=c.id, regra_id=regra_cansaco.id,
            responsavel_papel=Papel.ENFERMAGEM, prazo_resposta=c.enviado_em + timedelta(hours=24),
        )
    )

    lucia = await paciente("Lúcia M.", "colorretal", padrao)
    c = checkin(lucia, EscalaBemEstar.MUITO_MAL, timedelta(hours=30), {"cansaco": True})
    await sessao.flush()
    sessao.add(
        RevisaoCheckin(
            instituicao_id=inst.id, checkin_id=c.id, regra_id=regra_cansaco.id,
            responsavel_papel=Papel.ENFERMAGEM, prazo_resposta=c.enviado_em + timedelta(hours=24),
        )
    )

    rafael = await paciente("Rafael T.", "linfoma", padrao)
    tarefa(rafael, TipoTarefa.CONSULTA, "Agendar retorno com a hematologia", timedelta(days=5))
    checkin(rafael, EscalaBemEstar.BEM, timedelta(days=1))

    beatriz = await paciente(
        "Beatriz C.",
        "mama",
        [
            ("Diagnóstico registrado", E.CONCLUIDA, None),
            ("Consulta oncológica", E.PROXIMA, None),
            ("Exames pré-tratamento", E.FUTURA, None),
        ],
    )
    tarefa(beatriz, TipoTarefa.ENCAMINHAMENTO, "Agendar primeira consulta oncológica", timedelta(days=2))

    await sessao.flush()
