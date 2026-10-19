from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações lidas de variáveis de ambiente ou do arquivo .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "nutrilite-backend"
    log_level: Literal["DEBUG", "INFO", "WARN", "ERROR"] = "INFO"
    database_url: str = "mysql+pymysql://app:app@localhost:3306/app"

    # Sessão de login (cookie HttpOnly). A sessão cai após ficar ociosa ou ao
    # atingir a duração máxima, o que vier primeiro.
    sessao_cookie: str = "sessao"
    sessao_ociosa_minutos: int = 8 * 60
    sessao_maxima_dias: int = 7
    # Só envia o cookie por HTTPS. Desligue apenas em dev com http://.
    cookie_secure: bool = True


settings = Settings()
