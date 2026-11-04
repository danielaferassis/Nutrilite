"""Mensagens de erro da API em português, prontas para mostrar ao usuário.

O FastAPI/Pydantic devolvem os erros de validação (422) e os erros padrão
(404 de rota, 405...) em inglês e com termos técnicos. Os handlers daqui
reescrevem essas mensagens; o formato de `detail` (texto ou lista de
{loc, msg, type}) continua o mesmo.
"""

import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

# Nome do campo como aparece na tela
ROTULOS = {
    "arquivo": "Arquivo",
    "ate": "Data final",
    "ativo": "Ativo",
    "codigo": "Código",
    "de": "Data inicial",
    "demanda_id": "Demanda",
    "descricao": "Descrição",
    "description": "Descrição",
    "desidratado_por_moido": "Rendimento desidratado por moído",
    "dia": "Dia",
    "dias_operacao": "Dias de operação",
    "data_chegada": "Data de chegada",
    "data_prevista": "Data prevista",
    "data_recebimento": "Data de recebimento",
    "email": "E-mail",
    "erva": "Erva",
    "erva_id": "Erva",
    "espera_maxima_dias": "Espera máxima (dias)",
    "estagio": "Estágio",
    "estagio_meta": "Estágio da meta",
    "fim": "Fim",
    "forcar": "Forçar",
    "fresco_por_desidratado": "Rendimento fresco por desidratado",
    "funcionalidade_ids": "Permissões",
    "grupo_ids": "Grupos",
    "hoje": "Data de referência",
    "horas_por_carga": "Horas por carga",
    "horas_secagem": "Horas de secagem",
    "horas_setup": "Horas de setup",
    "inicio": "Início",
    "kg": "Quantidade (kg)",
    "kg_fresco": "Quantidade de fresco (kg)",
    "kg_fresco_por_hora": "Capacidade (kg de fresco por hora)",
    "kg_meta": "Meta (kg)",
    "kg_por_carga": "Kg por carga",
    "kg_previsto": "Quantidade prevista (kg)",
    "kg_recebido": "Quantidade recebida (kg)",
    "limite": "Limite",
    "lote_id": "Lote",
    "modo": "Modo",
    "motivo": "Motivo",
    "name": "Nome",
    "nome": "Nome",
    "nova_senha": "Nova senha",
    "observacao": "Observação",
    "offset": "Deslocamento",
    "origem": "Origem",
    "plano_id": "Plano",
    "prazo": "Prazo",
    "previsao_id": "Previsão",
    "prioridade": "Prioridade",
    "regime_horas_dia": "Regime (horas por dia)",
    "reserva_kg": "Reserva (kg)",
    "secador": "Secador",
    "secador_id": "Secador",
    "senha": "Senha",
    "senha_atual": "Senha atual",
    "setup_diario_h": "Setup diário (h)",
    "setup_dentro_do_regime": "Setup dentro do regime",
    "setup_final_h": "Setup final (h)",
    "setup_inicial_h": "Setup inicial (h)",
    "situacao": "Situação",
    "status": "Status",
    "tipo": "Tipo",
    "versao": "Versão",
}

# Partes do `loc` que não são nome de campo
_ORIGENS = {"body", "query", "path", "header", "cookie"}

MSG_EMAIL = "Informe um e-mail válido, como nome@empresa.com.br."
MSG_FORMATO = "Os dados enviados não estão no formato esperado. Revise o formulário e tente de novo."

# Erros padrão do framework (rota inexistente, método errado...) que chegam em inglês
MENSAGENS_HTTP = {
    400: "Requisição inválida.",
    401: "Você precisa entrar no sistema.",
    403: "Você não tem permissão para esta ação.",
    404: "Recurso não encontrado.",
    405: "Operação não permitida.",
    413: "O arquivo enviado é grande demais.",
    415: "Tipo de arquivo não suportado.",
    429: "Muitas tentativas. Tente novamente em alguns minutos.",
    500: "Erro interno no servidor. Tente novamente em instantes.",
}


def _maiuscula(texto: str) -> str:
    return texto[:1].upper() + texto[1:]


def rotulo(loc: tuple | list) -> str | None:
    """Nome amigável do campo a partir do `loc` do Pydantic (None = erro do formulário inteiro)."""
    partes = [p for p in loc if p not in _ORIGENS]
    nomes = [p for p in partes if isinstance(p, str)]
    if not nomes:
        return None
    nome = nomes[-1]
    texto = ROTULOS.get(nome, _maiuscula(nome.replace("_", " ")))
    # Campo dentro de lista (ex.: alocacoes.0.kg): diz em qual linha
    indices = [p for p in partes if isinstance(p, int)]
    if indices:
        texto += f" (linha {indices[-1] + 1})"
    return texto


def traduzir(erro: dict) -> str:
    """Uma mensagem de validação do Pydantic em português, citando o campo."""
    tipo = erro.get("type", "")
    ctx = erro.get("ctx") or {}
    campo = rotulo(erro.get("loc", ()))
    nome = campo or "O valor"

    if tipo == "missing":
        return f"Preencha o campo {campo}." if campo else MSG_FORMATO
    if tipo in ("json_invalid", "model_type", "model_attributes_type", "dict_type"):
        return MSG_FORMATO
    if tipo == "value_error" and "reason" in ctx:
        # EmailStr: o motivo vem do email-validator, em inglês
        return MSG_EMAIL
    if tipo in ("value_error", "assertion_error"):
        # Validadores do próprio sistema: a mensagem já está em português
        texto = str(ctx.get("error") or erro.get("msg", ""))
        for prefixo in ("Value error, ", "Assertion failed, "):
            texto = texto.removeprefix(prefixo)
        return f"{campo}: {texto}" if campo else _maiuscula(texto)

    if tipo == "string_too_short":
        minimo = ctx.get("min_length", 1)
        if minimo <= 1:
            return f"Preencha o campo {campo}." if campo else "Preencha os campos obrigatórios."
        return f"{nome} deve ter pelo menos {minimo} caracteres."
    if tipo == "string_too_long":
        return f"{nome} deve ter no máximo {ctx.get('max_length')} caracteres."
    if tipo == "too_short":
        return f"{nome} deve ter pelo menos {ctx.get('min_length')} item(ns)."
    if tipo == "too_long":
        return f"{nome} deve ter no máximo {ctx.get('max_length')} item(ns)."
    if tipo in ("string_type", "string_unicode"):
        return f"{nome} deve ser um texto."
    if tipo in ("int_parsing", "int_type", "int_from_float"):
        return f"{nome} deve ser um número inteiro."
    if tipo in ("float_parsing", "float_type", "decimal_parsing", "decimal_type", "finite_number"):
        return f"{nome} deve ser um número."
    if tipo == "decimal_max_places":
        return f"{nome} aceita no máximo {ctx.get('decimal_places')} casas decimais."
    if tipo in ("decimal_max_digits", "decimal_whole_digits"):
        return f"{nome} tem dígitos demais."
    if tipo == "greater_than":
        return f"{nome} deve ser maior que {ctx.get('gt')}."
    if tipo == "greater_than_equal":
        return f"{nome} deve ser maior ou igual a {ctx.get('ge')}."
    if tipo == "less_than":
        return f"{nome} deve ser menor que {ctx.get('lt')}."
    if tipo == "less_than_equal":
        return f"{nome} deve ser menor ou igual a {ctx.get('le')}."
    if tipo == "multiple_of":
        return f"{nome} deve ser múltiplo de {ctx.get('multiple_of')}."
    if tipo in ("bool_parsing", "bool_type"):
        return f"{nome} deve ser sim ou não."
    # datetime_* antes de date_* (date_from_datetime_* é erro de campo de data)
    if tipo.startswith(("datetime", "time")):
        return f"{nome} deve ser uma data e hora válida."
    if tipo.startswith("date"):
        return f"{nome} deve ser uma data válida."
    if tipo in ("enum", "literal_error"):
        return f"Escolha uma opção válida em {campo}." if campo else "Escolha uma opção válida."
    if tipo in ("list_type", "set_type", "tuple_type"):
        return f"{nome} deve ser uma lista."
    if tipo == "extra_forbidden":
        return f"{nome} não é aceito aqui."
    if tipo == "url_parsing" or tipo.startswith("url"):
        return f"{nome} deve ser um endereço (URL) válido."

    log.warning("Erro de validação sem tradução: %s", tipo)
    return f"{nome} tem um valor inválido." if campo else "Há valores inválidos no formulário."


async def _validacao(request: Request, exc: RequestValidationError) -> JSONResponse:
    detalhes = [
        {"loc": list(e.get("loc", ())), "msg": traduzir(e), "type": e.get("type")}
        for e in exc.errors()
    ]
    log.info("Validação recusou %s %s: %s", request.method, request.url.path,
             [d["type"] for d in detalhes])
    return JSONResponse(status_code=422, content=jsonable_encoder({"detail": detalhes}))


async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail
    # Só troca a frase padrão do framework ("Not Found"...); textos do sistema ficam como estão
    try:
        padrao = HTTPStatus(exc.status_code).phrase
    except ValueError:
        padrao = None
    if detail == padrao:
        detail = MENSAGENS_HTTP.get(exc.status_code, f"Erro {exc.status_code}.")
    return JSONResponse(
        status_code=exc.status_code, content={"detail": detail}, headers=exc.headers
    )


def registrar_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validacao)
    app.add_exception_handler(StarletteHTTPException, _http)
