from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from revolt_api.audit import log_action
from revolt_api.models.audit_log import AuditLog


def _mock_db() -> MagicMock:
	"""Return a mock AsyncSession with sync add() and async commit()/refresh()."""
	db = MagicMock()
	db.commit = AsyncMock()
	db.refresh = AsyncMock()
	return db


async def test_log_action_persists_entry() -> None:
	db = _mock_db()

	await log_action(
		db,
		session_id="test-session-abc",
		action="mission.start",
		params={"mission_id": "123"},
		severity="info",
	)

	db.add.assert_called_once()
	added: AuditLog = db.add.call_args[0][0]
	assert isinstance(added, AuditLog)
	assert added.session_id == "test-session-abc"
	assert added.action == "mission.start"
	assert added.params == {"mission_id": "123"}
	assert added.severity == "info"
	assert added.user_id is None
	db.commit.assert_awaited_once()


async def test_log_action_warning_severity() -> None:
	db = _mock_db()

	with patch("revolt_api.audit.logger") as mock_logger:
		await log_action(db, session_id="test-session", action="auth.failed", severity="warning")
		mock_logger.warning.assert_called_once()


async def test_log_action_with_user_id() -> None:
	db = _mock_db()

	await log_action(db, session_id="test-session", action="mission.abort", user_id="user-xyz")

	added: AuditLog = db.add.call_args[0][0]
	assert added.user_id == "user-xyz"


async def test_request_middleware_passes_session_id(client: AsyncClient) -> None:
	response = await client.get("/api/health", headers={"x-session-id": "test-session-123"})
	assert response.status_code == 200


async def test_request_middleware_handles_missing_session_id(client: AsyncClient) -> None:
	response = await client.get("/api/health")
	assert response.status_code == 200


@pytest.mark.parametrize(
	("action", "severity"),
	[
		("mission.start", "info"),
		("auth.failed", "warning"),
		("system.error", "error"),
	],
)
async def test_log_action_severity_variants(action: str, severity: str) -> None:
	db = _mock_db()

	await log_action(db, session_id="s", action=action, severity=severity)

	added: AuditLog = db.add.call_args[0][0]
	assert added.severity == severity
