from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações lidas de variáveis de ambiente ou do arquivo .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "nutrilite-backend"
    log_level: Literal["DEBUG", "INFO", "WARN", "ERROR"] = "INFO"
    database_url: str = "mysql+pymysql://app:app@localhost:3306/app"


settings = Settings()
