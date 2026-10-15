import logging
import sys

from app.config import settings

# Ex.: 2026-10-15 12:29:11 - nutrilite-backend : [INFO ] mensagem
LOG_FORMAT = f"%(asctime)s - {settings.app_name} : [%(levelname)-5s] %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging() -> None:
    """Aplica o padrão de log em toda a aplicação, inclusive nos logs do uvicorn.

    Uso nos módulos:
        log = logging.getLogger(__name__)
        log.info("..."), log.debug("..."), log.warning("..."), log.error("...")
        log.log(logging.INFO, "...")  # nível escolhido na chamada
    """
    logging.addLevelName(logging.WARNING, "WARN")

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    handler.setLevel(settings.log_level)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)

    # O uvicorn tem handlers próprios; removemos para que use o nosso formato
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
