"""log_action(): the single write path for the audit_log table, used by every command endpoint."""

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from revolt_api.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)

_VALID_SEVERITIES = frozenset({"info", "warning", "error"})


async def log_action(
	db: AsyncSession,
	*,
	session_id: str,
	action: str,
	params: dict[str, Any] | None = None,
	vessel_snapshot: dict[str, Any] | None = None,
	user_id: str | None = None,
	severity: str = "info",
) -> AuditLog:
	"""Write an audit event to the database and emit a structured log line.

	Call this from every endpoint that issues a command or takes a significant
	action. session_id comes from the X-Session-ID request header; user_id is
	null until identity provider integration lands.
	"""
	entry = AuditLog(
		session_id=session_id,
		user_id=user_id,
		action=action,
		severity=severity,
		params=params,
		vessel_snapshot=vessel_snapshot,
	)
	db.add(entry)
	await db.commit()
	await db.refresh(entry)

	log_level = severity if severity in _VALID_SEVERITIES else "info"
	getattr(logger, log_level)(
		"audit",
		action=action,
		session_id=session_id,
		user_id=user_id,
		severity=severity,
		params=params,
	)

	return entry
