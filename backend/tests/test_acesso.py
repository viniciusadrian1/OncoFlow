from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app import db
from app.acesso.models import Papel, Usuario
from app.acesso.seguranca import hash_senha
from app.auditoria.models import EventoAuditoria
from app.demo.seed import proxima_quinta_10h30
from app.dominio.instituicoes.models import Instituicao
from app.dominio.pacientes.models import Paciente, VinculoEquipe
from tests.conftest import DOMINIO, SENHA, entrar


async def test_login_com_senha_errada_nao_revela_se_o_email_existe(cliente: AsyncClient) -> None:
    errada = await cliente.post("/api/auth/entrar", json={"email": f"ana@{DOMINIO}", "senha": "x"})
    inexistente = await cliente.post("/api/auth/entrar", json={"email": f"ninguem@{DOMINIO}", "senha": SENHA})
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json() == inexistente.json()


async def test_sem_token_responde_401_no_formato_padrao(cliente: AsyncClient) -> None:
    resposta = await cliente.get("/api/pro/pacientes")
    assert resposta.status_code == 401
    assert resposta.json()["erro"] == "nao_autenticado"


@pytest.mark.parametrize(
    ("login", "rota", "esperado"),
    [
        ("maria", "/api/paciente/inicio", 200),
        ("maria", "/api/pro/pacientes", 403),
        ("ana", "/api/pro/pacientes", 200),
        ("bruno", "/api/pro/pacientes", 200),
        ("carla", "/api/pro/pacientes", 200),
        ("ana", "/api/paciente/inicio", 403),
        # Gestão vê indicadores agregados, não a lista de pacientes
        ("diego", "/api/pro/pacientes", 403),
        ("diego", "/api/paciente/inicio", 403),
    ],
)
async def test_matriz_de_permissoes(cliente: AsyncClient, login: str, rota: str, esperado: int) -> None:
    assert (await cliente.get(rota, headers=await entrar(cliente, login))).status_code == esperado


async def test_paciente_vem_do_token_e_nao_da_url(cliente: AsyncClient) -> None:
    async with db.fabrica_sessao()() as sessao:
        joao = await sessao.scalar(select(Paciente).where(Paciente.nome_exibicao == "João P."))
    resposta = await cliente.get(
        "/api/paciente/inicio", params={"paciente_id": str(joao.id)}, headers=await entrar(cliente, "maria")
    )
    assert resposta.json()["nome_exibicao"] == "Maria"


async def test_inicio_da_maria(cliente: AsyncClient) -> None:
    inicio = (await cliente.get("/api/paciente/inicio", headers=await entrar(cliente, "maria"))).json()
    assert inicio["jornada"] | {"etapas": None} == {
        "concluidas": 1, "cadastradas": 5, "percentual": 20, "etapas": None,
    }
    proximo = inicio["proximo_compromisso"]
    assert proximo["titulo"] == "Consulta com especialista"
    assert datetime.fromisoformat(proximo["inicio"]) == proxima_quinta_10h30(datetime.now(UTC))
    assert proximo["preparo_texto"].startswith("Leve seus exames anteriores")
    assert inicio["assistente_nome"] == "Lia"


async def test_visao_geral_deriva_vencidas_e_revisoes_atrasadas(cliente: AsyncClient) -> None:
    visao = (await cliente.get("/api/pro/pacientes", headers=await entrar(cliente, "carla"))).json()
    por_nome = {p["nome_exibicao"]: p for p in visao["pacientes"]}
    assert len(por_nome) == 7 and visao["dados_ficticios"] is True
    assert (por_nome["João P."]["tarefas_abertas"], por_nome["João P."]["tarefas_vencidas"]) == (1, 1)
    assert (por_nome["Rafael T."]["tarefas_abertas"], por_nome["Rafael T."]["tarefas_vencidas"]) == (1, 0)
    assert (por_nome["Antônio S."]["revisoes_aguardando"], por_nome["Antônio S."]["revisoes_atrasadas"]) == (1, 0)
    assert (por_nome["Lúcia M."]["revisoes_aguardando"], por_nome["Lúcia M."]["revisoes_atrasadas"]) == (1, 1)
    assert por_nome["Maria"]["etapa_atual"] == "Consulta oncológica"
    assert por_nome["Maria"]["ultimo_checkin"]["escala"] == "mais_ou_menos"


async def test_profissional_de_outra_instituicao_nao_ve_pacientes(cliente: AsyncClient) -> None:
    """Mesmo com vínculo indevido, o filtro por instituição barra o acesso."""
    async with db.fabrica_sessao()() as sessao, sessao.begin():
        outra = Instituicao(nome="Outra instituição (fictícia)", config={})
        sessao.add(outra)
        await sessao.flush()
        intruso = Usuario(
            instituicao_id=outra.id, nome="Dr. Externo", email=f"externo-{uuid.uuid4().hex[:6]}@{DOMINIO}",
            senha_hash=hash_senha(SENHA), papel=Papel.MEDICO,
        )
        sessao.add(intruso)
        await sessao.flush()
        maria = await sessao.scalar(select(Paciente).where(Paciente.nome_exibicao == "Maria"))
        sessao.add(VinculoEquipe(paciente_id=maria.id, usuario_id=intruso.id, funcao="medico"))
        email = intruso.email

    resposta = await cliente.post("/api/auth/entrar", json={"email": email, "senha": SENHA})
    headers = {"Authorization": f"Bearer {resposta.json()['token']}"}
    assert (await cliente.get("/api/pro/pacientes", headers=headers)).json()["pacientes"] == []


async def test_leitura_da_visao_geral_fica_auditada(cliente: AsyncClient) -> None:
    await cliente.get("/api/pro/pacientes", headers=await entrar(cliente, "bruno"))
    async with db.fabrica_sessao()() as sessao:
        evento = await sessao.scalar(select(EventoAuditoria).where(EventoAuditoria.recurso == "visao_geral_pacientes"))
    assert evento is not None and evento.ator_papel == "enfermagem" and evento.acao == "ler"


@pytest.mark.parametrize("comando", ["UPDATE evento_auditoria SET motivo = 'x'", "DELETE FROM evento_auditoria"])
async def test_auditoria_e_somente_insercao(cliente: AsyncClient, comando: str) -> None:
    await cliente.get("/api/pro/pacientes", headers=await entrar(cliente, "ana"))
    async with db.fabrica_sessao()() as sessao:
        with pytest.raises(DBAPIError, match="somente inserção"):
            async with sessao.begin():
                await sessao.execute(text(comando))


async def test_truncate_da_auditoria_so_no_reset(cliente: AsyncClient) -> None:
    async with db.fabrica_sessao()() as sessao:
        with pytest.raises(DBAPIError, match="somente inserção"):
            async with sessao.begin():
                await sessao.execute(text("TRUNCATE evento_auditoria"))
