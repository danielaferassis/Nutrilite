import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Argon2id com os parâmetros padrão recomendados pela biblioteca (RFC 9106)
_hasher = PasswordHasher()

# Usado no login quando o e-mail não existe, para a resposta levar o mesmo tempo
# e não revelar quais e-mails estão cadastrados
HASH_FALSO = _hasher.hash(secrets.token_urlsafe(16))


def hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha_hash: str, senha: str) -> bool:
    try:
        return _hasher.verify(senha_hash, senha)
    except (VerificationError, InvalidHashError):
        return False


def precisa_rehash(senha_hash: str) -> bool:
    """True quando o hash foi gerado com parâmetros mais fracos que os atuais."""
    return _hasher.check_needs_rehash(senha_hash)


def gerar_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    # O token já é aleatório e longo: SHA-256 basta (não precisa de Argon2)
    return hashlib.sha256(token.encode()).hexdigest()
