"""Mission/waypoint CRUD tests against a real Postgres/PostGIS database.

Requires: docker compose up -d db && alembic upgrade head. Excluded from the default
`pytest` run (see pyproject.toml addopts) since CI has no Postgres service — run with
`PYTHONPATH="" uv run pytest -m integration`. Set DATABASE_URL to point at the running
db container if not using the default docker-compose port mapping (localhost:5432).
"""

import math
import os
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from revolt_api.bridge.client import RosBridgeClient
from revolt_api.database import get_db
from revolt_api.main import app

_ORIGIN_LAT = 59.9083
_ORIGIN_LON = 10.7512

pytestmark = pytest.mark.integration

TEST_DATABASE_URL = os.environ.get(
	"TEST_DATABASE_URL", "postgresql+asyncpg://revolt:changeme@localhost:5432/revolt_dev"
)


def _latlon_to_cartesian(lat: float, lon: float) -> tuple[float, float]:
	x = (lon - _ORIGIN_LON) * 111320.0 * math.cos(math.radians(_ORIGIN_LAT))
	y = (lat - _ORIGIN_LAT) * 111320.0
	return x, y


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
	app.state.bridge = MagicMock(spec=RosBridgeClient)
	app.state.bridge.connected = False
	app.state.bridge.latlon_to_cartesian.side_effect = _latlon_to_cartesian

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


async def _create_mission(client: AsyncClient, name: str = "Oslo Fjord transit") -> str:
	resp = await client.post("/api/missions", json={"name": name})
	assert resp.status_code == 201
	return resp.json()["id"]


async def test_mission_and_waypoint_crud_round_trip(client: AsyncClient) -> None:
	mission_id = await _create_mission(client)
	try:
		wp_resp = await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={
				"sequence_number": 0,
				"latitude": 59.3783,
				"longitude": 10.5930,
				"target_speed": 4.5,
			},
			headers={"X-Session-ID": "test-session"},
		)
		assert wp_resp.status_code == 201
		wp = wp_resp.json()
		# Highest-risk item: lat/lon must round-trip through the PostGIS WKT-in/WKB-out
		# conversion without drift or getting swapped.
		assert wp["position"]["latitude"] == pytest.approx(59.3783, abs=1e-6)
		assert wp["position"]["longitude"] == pytest.approx(10.5930, abs=1e-6)
		assert wp["sequence_number"] == 0
		assert wp["switch_radius"] == 5.0
		assert wp["heading_mode"] == 0
		assert wp["heading_deg"] is None
		waypoint_id = wp["id"]

		get_resp = await client.get(f"/api/missions/{mission_id}")
		assert get_resp.status_code == 200
		assert len(get_resp.json()["waypoints"]) == 1

		update_resp = await client.patch(
			f"/api/missions/{mission_id}/waypoints/{waypoint_id}",
			json={"latitude": 59.4, "longitude": 10.6, "target_speed": 6.0, "heading_deg": 90.0},
		)
		assert update_resp.status_code == 200
		updated = update_resp.json()
		assert updated["position"]["latitude"] == pytest.approx(59.4, abs=1e-6)
		assert updated["position"]["longitude"] == pytest.approx(10.6, abs=1e-6)
		assert updated["target_speed"] == 6.0
		assert updated["heading_deg"] == pytest.approx(90.0, abs=1e-4)

		lat_only_resp = await client.patch(
			f"/api/missions/{mission_id}/waypoints/{waypoint_id}", json={"latitude": 59.5}
		)
		assert lat_only_resp.status_code == 400

		replace_resp = await client.put(
			f"/api/missions/{mission_id}/waypoints",
			json=[
				{"latitude": 59.1, "longitude": 10.1, "target_speed": 3.0},
				{"latitude": 59.2, "longitude": 10.2, "target_speed": 3.5},
			],
		)
		assert replace_resp.status_code == 200
		replaced = replace_resp.json()
		assert [w["sequence_number"] for w in replaced] == [0, 1]
		assert replaced[1]["position"]["latitude"] == pytest.approx(59.2, abs=1e-6)

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		assert len(mission_resp.json()["waypoints"]) == 2

		rename_resp = await client.patch(f"/api/missions/{mission_id}", json={"name": "Renamed"})
		assert rename_resp.status_code == 200
		assert rename_resp.json()["name"] == "Renamed"

		list_resp = await client.get("/api/missions")
		assert list_resp.status_code == 200
		assert any(m["id"] == mission_id for m in list_resp.json())
	finally:
		await client.delete(f"/api/missions/{mission_id}")

	assert (await client.get(f"/api/missions/{mission_id}")).status_code == 404


async def test_waypoint_delete_renumbers_sequence(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Renumber test")
	try:
		ids = []
		for i in range(3):
			resp = await client.post(
				f"/api/missions/{mission_id}/waypoints",
				json={
					"sequence_number": i,
					"latitude": 59.0 + i * 0.01,
					"longitude": 10.0,
					"target_speed": 3.0,
				},
			)
			assert resp.status_code == 201
			ids.append(resp.json()["id"])

		del_resp = await client.delete(f"/api/missions/{mission_id}/waypoints/{ids[0]}")
		assert del_resp.status_code == 204

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		remaining = mission_resp.json()["waypoints"]
		assert [w["sequence_number"] for w in remaining] == [0, 1]
		assert [w["id"] for w in remaining] == [ids[1], ids[2]]
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_mission_not_found_returns_404(client: AsyncClient) -> None:
	missing_id = "00000000-0000-0000-0000-000000000000"
	assert (await client.get(f"/api/missions/{missing_id}")).status_code == 404
	assert (
		await client.patch(f"/api/missions/{missing_id}", json={"name": "x"})
	).status_code == 404
	assert (await client.delete(f"/api/missions/{missing_id}")).status_code == 404
	assert (
		await client.post(
			f"/api/missions/{missing_id}/waypoints",
			json={"sequence_number": 0, "latitude": 0, "longitude": 0, "target_speed": 1},
		)
	).status_code == 404


async def test_send_mission_acknowledged_updates_mission_and_returns_result(
	client: AsyncClient,
) -> None:
	mission_id = await _create_mission(client, name="Send test")
	try:
		await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={"sequence_number": 0, "latitude": 59.92, "longitude": 10.76, "target_speed": 4.0},
		)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "acknowledged"
		assert body["waypoint_count"] == 1

		bridge.publish_and_await_ack.assert_awaited_once()
		call_args = bridge.publish_and_await_ack.await_args
		assert call_args.args[0] == "/update_waypoint_list"
		expected = call_args.args[3]
		assert expected[0][0] == 0  # sequence_number

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		mission = mission_resp.json()
		assert mission["last_send_status"] == "acknowledged"
		assert mission["last_sent_at"] is not None
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_not_connected(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Send disconnected test")
	try:
		bridge = app.state.bridge
		bridge.connected = False
		bridge.publish_and_await_ack.return_value = "not_connected"

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 200
		assert resp.json()["status"] == "not_connected"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_not_found_returns_404(client: AsyncClient) -> None:
	missing_id = "00000000-0000-0000-0000-000000000000"
	assert (await client.post(f"/api/missions/{missing_id}/send")).status_code == 404
