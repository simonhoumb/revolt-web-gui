"""Router-level round trip for /api/ros-commands against a real Postgres/PostGIS database (the
audit log write in ros_command_service.execute_command needs a real DB, unlike the pure unit
tests in test_ros_command_service.py).

Requires: docker compose up -d db && alembic upgrade head. Excluded from the default `pytest`
run (see pyproject.toml addopts) -- run with `PYTHONPATH="" uv run pytest -m integration`.
"""

import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from revolt_api.bridge.client import LatestRawMessage, RosBridgeClient, ServiceCallResult
from revolt_api.database import get_db
from revolt_api.main import app
from revolt_api.models.audit_log import AuditLog

pytestmark = pytest.mark.integration

TEST_DATABASE_URL = os.environ.get(
	"TEST_DATABASE_URL", "postgresql+asyncpg://revolt:changeme@localhost:5432/revolt_dev"
)


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
	bridge = app.state.bridge = MagicMock(spec=RosBridgeClient)
	bridge.target = "physical"
	bridge.call_service = AsyncMock(
		return_value=ServiceCallResult(
			ok=True, values={"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]}, error=None
		)
	)
	bridge.latest_raw_message = MagicMock(
		return_value=LatestRawMessage(msg={"latitude": 1.0}, timestamp_ms=123)
	)

	engine = create_async_engine(TEST_DATABASE_URL)
	session_factory = async_sessionmaker(engine, expire_on_commit=False)

	async def override_get_db() -> AsyncGenerator:
		async with session_factory() as session:
			yield session

	app.dependency_overrides[get_db] = override_get_db
	try:
		async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
			yield ac
	finally:
		app.dependency_overrides.pop(get_db, None)
		await engine.dispose()


async def test_list_ros_commands_returns_the_full_registry(client: AsyncClient) -> None:
	resp = await client.get("/api/ros-commands")
	assert resp.status_code == 200
	commands = {c["command_id"] for c in resp.json()}
	assert commands == {
		"list_topics",
		"list_nodes",
		"list_services",
		"node_details",
		"get_param",
		"echo_topic",
	}


async def test_list_ros_commands_resolves_echo_topic_allowed_values(client: AsyncClient) -> None:
	resp = await client.get("/api/ros-commands")
	echo = next(c for c in resp.json() if c["command_id"] == "echo_topic")
	assert "/fix" in echo["params"][0]["allowed_values"]


async def test_execute_unknown_command_returns_404(client: AsyncClient) -> None:
	resp = await client.post("/api/ros-commands/nope", json={"params": {}})
	assert resp.status_code == 404


async def test_execute_echo_topic_disallowed_topic_returns_400(client: AsyncClient) -> None:
	resp = await client.post(
		"/api/ros-commands/echo_topic", json={"params": {"topic": "/not/allowed"}}
	)
	assert resp.status_code == 400


async def test_execute_list_topics_writes_an_audit_log_row(client: AsyncClient) -> None:
	resp = await client.post(
		"/api/ros-commands/list_topics", json={"params": {}}, headers={"X-Session-ID": "test-sess"}
	)
	assert resp.status_code == 200
	body = resp.json()
	assert body["ok"] is True
	assert body["result"] == {"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]}

	engine = create_async_engine(TEST_DATABASE_URL)
	session_factory = async_sessionmaker(engine, expire_on_commit=False)
	async with session_factory() as session:
		result = await session.execute(
			select(AuditLog)
			.where(AuditLog.action == "ros_command.list_topics", AuditLog.session_id == "test-sess")
			.order_by(AuditLog.timestamp.desc())
			.limit(1)
		)
		entry = result.scalar_one()
		assert entry.params is not None
		assert entry.params["command_id"] == "list_topics"
		assert entry.params["ok"] is True
	await engine.dispose()


async def test_execute_echo_topic_returns_cached_message(client: AsyncClient) -> None:
	resp = await client.post("/api/ros-commands/echo_topic", json={"params": {"topic": "/fix"}})
	assert resp.status_code == 200
	body = resp.json()
	assert body["ok"] is True
	assert body["result"]["topic"] == "/fix"
	assert body["result"]["msg"] == {"latitude": 1.0}
