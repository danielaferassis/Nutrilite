from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

# Argon2id com os parâmetros padrão recomendados pela biblioteca (RFC 9106)
_hasher = PasswordHasher()


def hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha_hash: str, senha: str) -> bool:
    try:
        return _hasher.verify(senha_hash, senha)
    except VerificationError:
        return False
