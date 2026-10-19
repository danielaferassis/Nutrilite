"""Comandos administrativos.

    python -m app.cli criar-admin --email admin@exemplo.com --nome "Administrador"

Cria (ou atualiza) o grupo "Administrador" com TODAS as funcionalidades ativas
e coloca o usuário nele. Se o usuário não existe, é criado com a senha digitada.
Rode de novo sempre que uma migration adicionar funcionalidades novas, para o
grupo recebê-las.
"""

import argparse
import getpass
import logging
import sys

from pydantic import ValidationError
from sqlalchemy import select

from app.acesso import encerrar_sessoes
from app.database import SessionLocal
from app.logger import setup_logging
from app.models import Funcionalidade, Grupo, Usuario
from app.schemas import UsuarioCreate
from app.security import hash_senha

log = logging.getLogger(__name__)

GRUPO_ADMIN = "Administrador"


def pedir_senha() -> str:
    senha = getpass.getpass("Senha: ")
    if senha != getpass.getpass("Confirme a senha: "):
        sys.exit("As senhas não conferem")
    return senha


def criar_admin(email: str, nome: str, redefinir_senha: bool) -> None:
    with SessionLocal() as db:
        grupo = db.scalar(select(Grupo).where(Grupo.nome == GRUPO_ADMIN))
        if grupo is None:
            grupo = Grupo(nome=GRUPO_ADMIN, descricao="Acesso total ao sistema")
            db.add(grupo)
        grupo.ativo = True
        grupo.funcionalidades = list(
            db.scalars(select(Funcionalidade).where(Funcionalidade.ativo.is_(True))).all()
        )

        usuario = db.scalar(select(Usuario).where(Usuario.email == email.lower()))
        if usuario is None:
            # Reaproveita as validações da API (formato do e-mail, tamanho da senha)
            dados = UsuarioCreate(nome=nome, email=email, senha=pedir_senha())
            usuario = Usuario(nome=dados.nome, email=dados.email, senha_hash=hash_senha(dados.senha))
            db.add(usuario)
            log.info("Usuário %s criado", dados.email)
        elif redefinir_senha:
            dados = UsuarioCreate(nome=usuario.nome, email=usuario.email, senha=pedir_senha())
            usuario.senha_hash = hash_senha(dados.senha)
            db.flush()
            encerrar_sessoes(db, usuario.id)
            log.info("Senha de %s redefinida", usuario.email)

        usuario.ativo = True
        if grupo not in usuario.grupos:
            usuario.grupos.append(grupo)
        db.commit()
        log.info(
            "%s está no grupo %s com %s funcionalidades",
            usuario.email, GRUPO_ADMIN, len(grupo.funcionalidades),
        )


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="comando", required=True)

    admin = sub.add_parser("criar-admin", help="cria ou atualiza um usuário administrador")
    admin.add_argument("--email", required=True)
    admin.add_argument("--nome", default="Administrador", help="usado só se o usuário for criado")
    admin.add_argument(
        "--redefinir-senha", action="store_true", help="pede uma senha nova se o usuário já existe"
    )

    args = parser.parse_args()
    try:
        if args.comando == "criar-admin":
            criar_admin(args.email, args.nome, args.redefinir_senha)
    except ValidationError as erro:
        detalhes = "; ".join(f"{e['loc'][0]}: {e['msg']}" for e in erro.errors())
        sys.exit(f"Dados inválidos: {detalhes}")


if __name__ == "__main__":
    main()
