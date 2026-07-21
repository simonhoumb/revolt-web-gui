import logging
import sys

import structlog


def configure_logging(log_level: str = "INFO") -> None:
	"""Configure structlog with JSON output and stdlib integration.

	Binds structlog to the stdlib logging system so uvicorn and SQLAlchemy
	logs flow through the same JSON pipeline.
	"""
	structlog.configure(
		processors=[
			structlog.stdlib.filter_by_level,
			structlog.stdlib.add_logger_name,
			structlog.stdlib.add_log_level,
			structlog.processors.TimeStamper(fmt="iso", utc=True),
			structlog.processors.StackInfoRenderer(),
			structlog.processors.ExceptionRenderer(),
			structlog.processors.JSONRenderer(),
		],
		wrapper_class=structlog.stdlib.BoundLogger,
		context_class=dict,
		logger_factory=structlog.stdlib.LoggerFactory(),
		cache_logger_on_first_use=True,
	)

	logging.basicConfig(
		format="%(message)s",
		stream=sys.stdout,
		level=log_level.upper(),
	)
