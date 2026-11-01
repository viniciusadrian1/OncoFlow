from __future__ import annotations

from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app import db
from app.config import obter_config
from app.dominio.jornada.models import EtapaJornada
from app.dominio.pacientes.models import Paciente
from app.main import create_app
from tests.conftest import entrar


async def _contagens() -> dict[str, int]:
    async with db.fabrica_sessao()() as sessao:
        return {
            "pacientes": await sessao.scalar(select(func.count()).select_from(Paciente)),
            "etapas": await sessao.scalar(select(func.count()).select_from(EtapaJornada)),
        }


async def test_reset_e_idempotente(cliente: AsyncClient) -> None:
    antes = await _contagens()
    resposta = await cliente.post("/api/demo/reset")
    assert resposta.json() == {"ok": True, "pacientes": 7}
    assert await _contagens() == antes


async def test_maria_comeca_sem_etapa_de_fertilidade(cliente: AsyncClient) -> None:
    """A etapa de fertilidade nasce da aprovação ao vivo na demo: não pode vir pronta no seed."""
    inicio = (await cliente.get("/api/paciente/inicio", headers=await entrar(cliente, "maria"))).json()
    titulos = [e["titulo"] for e in inicio["jornada"]["etapas"]]
    assert titulos == [
        "Diagnóstico registrado",
        "Consulta oncológica",
        "Exames pré-tratamento",
        "Início do tratamento",
        "Acompanhamento",
    ]
    assert not any("fertilidade" in t.lower() for t in titulos)


async def test_barra_demo_lista_equipe_e_so_a_protagonista(cliente: AsyncClient) -> None:
    usuarios = (await cliente.get("/api/demo/usuarios")).json()
    pacientes = [u["nome"] for u in usuarios if u["app"] == "paciente"]
    assert pacientes == ["Maria"]
    # Ordem do roteiro: a demo começa pela médica
    assert [u["papel"] for u in usuarios if u["app"] == "pro"] == ["medico", "navegacao", "enfermagem", "gestao"]


async def test_entrar_como_usuario_da_demo(cliente: AsyncClient) -> None:
    maria = next(u for u in (await cliente.get("/api/demo/usuarios")).json() if u["nome"] == "Maria")
    token = (await cliente.post(f"/api/demo/entrar/{maria['id']}")).json()["token"]
    eu = await cliente.get("/api/auth/eu", headers={"Authorization": f"Bearer {token}"})
    assert eu.json() == {"nome": "Maria", "papel": "paciente"}


async def test_rotas_de_demo_nao_existem_fora_do_modo_demo() -> None:
    config = obter_config().model_copy(update={"demo_mode": False})
    app = create_app(config)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://teste") as c:
        for metodo, rota in [("POST", "/api/demo/reset"), ("GET", "/api/demo/usuarios")]:
            assert (await c.request(metodo, rota)).status_code == 404
        assert (await c.get("/api/saude")).json() == {"status": "ok", "demo": False}
