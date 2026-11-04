"""Mensagens de erro da API em português (app/erros.py)."""

import pytest

from app.erros import MSG_EMAIL, MSG_FORMATO, traduzir


def mensagens(resposta):
    return [d["msg"] for d in resposta.json()["detail"]]


def test_email_sem_ponto_no_dominio_vira_mensagem_amigavel(cliente):
    resposta = cliente.post("/api/auth/login", json={"email": "devs@hotmail", "senha": "123"})

    assert resposta.status_code == 422
    assert mensagens(resposta) == [MSG_EMAIL]
    # Mantém o formato de lista com o campo, como o FastAPI
    assert resposta.json()["detail"][0]["loc"] == ["body", "email"]


def test_campo_faltando_cita_o_rotulo(cliente):
    resposta = cliente.post("/api/auth/login", json={"email": "nome@empresa.com.br"})
    assert mensagens(resposta) == ["Preencha o campo Senha."]


def test_limite_de_tamanho(cliente):
    resposta = cliente.post(
        "/api/auth/login", json={"email": "nome@empresa.com.br", "senha": "x" * 129}
    )
    assert mensagens(resposta) == ["Senha deve ter no máximo 128 caracteres."]


def test_json_quebrado(cliente):
    resposta = cliente.post(
        "/api/auth/login", content="{email:", headers={"content-type": "application/json"}
    )
    assert resposta.status_code == 422
    assert mensagens(resposta) == [MSG_FORMATO]


def test_rota_inexistente_em_portugues(cliente):
    resposta = cliente.get("/api/nao-existe")
    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Recurso não encontrado."


def test_detalhe_do_sistema_nao_e_trocado(cliente):
    # 404 com texto próprio do router continua com o texto dele
    cliente.logar(1)
    resposta = cliente.patch("/api/bloqueios/999", json={"motivo": "x"})
    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Bloqueio não encontrado"


@pytest.mark.parametrize(
    ("erro", "esperado"),
    [
        ({"type": "string_too_short", "loc": ("body", "nome"), "ctx": {"min_length": 1}},
         "Preencha o campo Nome."),
        ({"type": "string_too_short", "loc": ("body", "nova_senha"), "ctx": {"min_length": 8}},
         "Nova senha deve ter pelo menos 8 caracteres."),
        ({"type": "greater_than_equal", "loc": ("query", "limite"), "ctx": {"ge": 1}},
         "Limite deve ser maior ou igual a 1."),
        ({"type": "decimal_parsing", "loc": ("body", "alocacoes", 2, "kg")},
         "Quantidade (kg) (linha 3) deve ser um número."),
        ({"type": "date_from_datetime_parsing", "loc": ("body", "prazo")},
         "Prazo deve ser uma data válida."),
        ({"type": "enum", "loc": ("body", "origem"), "ctx": {"expected": "'a' or 'b'"}},
         "Escolha uma opção válida em Origem."),
        ({"type": "value_error", "loc": ("body", "codigo"),
          "msg": "Value error, não pode ser vazio", "ctx": {"error": "não pode ser vazio"}},
         "Código: não pode ser vazio"),
        # Validador do formulário inteiro (ex.: período), sem campo
        ({"type": "value_error", "loc": ("body",),
          "msg": "Value error, fim não pode ser anterior ao início",
          "ctx": {"error": "fim não pode ser anterior ao início"}},
         "Fim não pode ser anterior ao início"),
        ({"type": "tipo_desconhecido", "loc": ("body", "campo_novo")},
         "Campo novo tem um valor inválido."),
    ],
)
def test_traduz_tipos_de_erro(erro, esperado):
    assert traduzir(erro) == esperado
