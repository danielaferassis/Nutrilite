"""Datas no fuso da fazenda.

O servidor roda em UTC: depois das 21h em Ubajara, a data UTC já é amanhã.
Tudo que depende de "hoje" (recebimento no futuro, chegada atrasada, dados
fictícios) usa esta função.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.config import settings


def hoje() -> date:
    return datetime.now(ZoneInfo(settings.fuso_fazenda)).date()
