"""Formato único de erro da API: {"erro": "<codigo>", "mensagem": "<texto em PT-BR>"}."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

CODIGOS_PADRAO = {
    400: ("requisicao_invalida", "Requisição inválida."),
    401: ("nao_autenticado", "Faça login para continuar."),
    403: ("sem_permissao", "Você não tem permissão para esta ação."),
    404: ("nao_encontrado", "Recurso não encontrado."),
    409: ("conflito", "A ação não é permitida no estado atual."),
}


class ErroApi(Exception):
    def __init__(self, status: int, codigo: str, mensagem: str) -> None:
        self.status, self.codigo, self.mensagem = status, codigo, mensagem


def _resposta(status: int, codigo: str, mensagem: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"erro": codigo, "mensagem": mensagem})


def registrar_tratadores(app: FastAPI) -> None:
    @app.exception_handler(ErroApi)
    async def _erro_api(_: Request, exc: ErroApi) -> JSONResponse:
        return _resposta(exc.status, exc.codigo, exc.mensagem)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codigo, mensagem = CODIGOS_PADRAO.get(exc.status_code, ("erro", "Não foi possível concluir a ação."))
        return _resposta(exc.status_code, codigo, mensagem)

    @app.exception_handler(RequestValidationError)
    async def _validacao(_: Request, exc: RequestValidationError) -> JSONResponse:
        campos = ", ".join(".".join(str(p) for p in e["loc"][1:]) for e in exc.errors())
        return _resposta(422, "dados_invalidos", f"Verifique os campos: {campos}.")
