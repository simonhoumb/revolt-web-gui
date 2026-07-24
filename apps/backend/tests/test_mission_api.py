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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from revolt_api.bridge.client import RosBridgeClient
from revolt_api.database import get_db
from revolt_api.main import app
from revolt_api.models.audit_log import AuditLog

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
	bridge = app.state.bridge = MagicMock(spec=RosBridgeClient)
	bridge.connected = False
	bridge.latlon_to_cartesian.side_effect = _latlon_to_cartesian
	# Real dict, not a MagicMock's auto-generated dunder methods -- resume_cache needs actual
	# get/pop/item-assignment semantics across calls within a test, which a spec'd MagicMock's
	# independent per-call magic methods don't provide. The accessor methods below are wired with
	# real side effects (rather than left as auto-mocked stubs returning MagicMock()) so
	# routers/mission.py's calls through RosBridgeClient's public resume-cache API actually
	# observe and mutate this dict, matching the real implementation in bridge/client.py.
	bridge.resume_cache = {}
	bridge.get_resume_point.side_effect = bridge.resume_cache.get
	bridge.set_resume_point.side_effect = bridge.resume_cache.__setitem__
	bridge.pop_resume_point.side_effect = lambda mission_id: bridge.resume_cache.pop(
		mission_id, None
	)
	bridge.has_resume_points.side_effect = lambda: bool(bridge.resume_cache)

	def _clear_resume_cache() -> list[str]:
		invalidated = list(bridge.resume_cache)
		bridge.resume_cache.clear()
		return invalidated

	bridge.clear_resume_cache.side_effect = _clear_resume_cache
	app.state.bridge.latest_waypoint_list = None
	app.state.bridge.target = "physical"
	# None (nothing tracked) is the correct default -- individual tests that need to simulate a
	# genuinely in-flight mission set these explicitly.
	app.state.bridge.tracked_mission_id = None
	app.state.bridge.tracked_state = "active"

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


async def test_editing_waypoints_clears_last_sent_at_when_not_active_or_paused(
	client: AsyncClient,
) -> None:
	# Draft (sent but never started) is exactly the case this exists for: edit the plan after
	# sending it but before starting, and the stale "loaded" status must be invalidated so a
	# fresh Start is forced to require a new Send.
	mission_id = await _create_mission(client, name="Edit after send test")
	try:
		wp_resp = await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={"sequence_number": 0, "latitude": 59.92, "longitude": 10.76, "target_speed": 4.0},
		)
		waypoint_id = wp_resp.json()["id"]

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"
		send_resp = await client.post(f"/api/missions/{mission_id}/send")
		assert send_resp.status_code == 200
		assert (await client.get(f"/api/missions/{mission_id}")).json()["last_sent_at"] is not None

		await client.patch(
			f"/api/missions/{mission_id}/waypoints/{waypoint_id}", json={"target_speed": 5.0}
		)

		mission = (await client.get(f"/api/missions/{mission_id}")).json()
		assert mission["last_sent_at"] is None
		assert mission["last_send_status"] is None
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_editing_waypoints_does_not_clear_last_sent_at_when_active(
	client: AsyncClient,
) -> None:
	# The vessel's guidance stack keeps its own independent copy of the waypoints once published
	# -- it keeps executing the pre-edit route regardless of what the planner now shows, so
	# invalidating "loaded" here would make Mission Control falsely claim nothing is loaded while
	# the vessel is still physically executing the old plan.
	mission_id = await _create_mission(client, name="Edit while active test")
	try:
		wp_resp = await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={"sequence_number": 0, "latitude": 59.92, "longitude": 10.76, "target_speed": 4.0},
		)
		waypoint_id = wp_resp.json()["id"]

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"
		await client.post(f"/api/missions/{mission_id}/send")
		start_resp = await client.post(f"/api/missions/{mission_id}/start")
		assert start_resp.status_code == 200
		assert (await client.get(f"/api/missions/{mission_id}")).json()["status"] == "active"

		await client.patch(
			f"/api/missions/{mission_id}/waypoints/{waypoint_id}", json={"target_speed": 5.0}
		)

		mission = (await client.get(f"/api/missions/{mission_id}")).json()
		assert mission["last_sent_at"] is not None
		assert mission["status"] == "active"
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


async def test_get_loaded_mission_does_not_return_a_mission_that_was_never_sent(
	client: AsyncClient,
) -> None:
	# Not asserting a global 404 here: these integration tests run against the same database as
	# manual/docker-compose testing (conftest.py's client fixture doesn't override get_db), so
	# some other mission may legitimately already be "loaded" from outside this test run. The
	# real guarantee to check is scoped to this test's own mission.
	mission_id = await _create_mission(client, name="Never sent")
	try:
		resp = await client.get("/api/missions/loaded")
		if resp.status_code == 200:
			assert resp.json()["id"] != mission_id
		else:
			assert resp.status_code == 404
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_get_loaded_mission_returns_the_most_recently_sent_mission(
	client: AsyncClient,
) -> None:
	bridge = app.state.bridge
	bridge.connected = True
	bridge.publish_and_await_ack.return_value = "acknowledged"

	mission_a = await _create_mission(client, name="Sent first")
	mission_b = await _create_mission(client, name="Sent most recently")
	try:
		await _add_waypoint(client, mission_a, 59.92, 10.76)
		await _add_waypoint(client, mission_b, 59.93, 10.77)

		await client.post(f"/api/missions/{mission_a}/send")
		await client.post(f"/api/missions/{mission_b}/send")

		resp = await client.get("/api/missions/loaded")
		assert resp.status_code == 200
		body = resp.json()
		assert body["id"] == mission_b
		assert body["name"] == "Sent most recently"
	finally:
		await client.delete(f"/api/missions/{mission_a}")
		await client.delete(f"/api/missions/{mission_b}")


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


async def _add_waypoint(client: AsyncClient, mission_id: str, lat: float, lon: float) -> None:
	resp = await client.post(
		f"/api/missions/{mission_id}/waypoints",
		json={"sequence_number": 0, "latitude": lat, "longitude": lon, "target_speed": 4.0},
	)
	assert resp.status_code == 201


async def _last_audit_severity(mission_id: str, action: str) -> str | None:
	engine = create_async_engine(TEST_DATABASE_URL)
	try:
		session_factory = async_sessionmaker(engine, expire_on_commit=False)
		async with session_factory() as session:
			result = await session.execute(
				select(AuditLog)
				.where(AuditLog.action == action)
				.where(AuditLog.params["mission_id"].astext == mission_id)
				.order_by(AuditLog.timestamp.desc())
				.limit(1)
			)
			entry = result.scalar_one_or_none()
			return entry.severity if entry is not None else None
	finally:
		await engine.dispose()


async def test_validate_mission_blocked_on_real_charted_land(client: AsyncClient) -> None:
	# Straddles a real lndare polygon centroid from the ingested Oslo Fjord chart data (~200 m
	# leg, land roughly in the middle) -- confirmed directly against enc_lndare via psql before
	# writing this test, not just assumed from the coordinates.
	mission_id = await _create_mission(client, name="Validate blocked test")
	try:
		await _add_waypoint(client, mission_id, 59.379916, 10.527813401271281)
		await _add_waypoint(client, mission_id, 59.377916, 10.527813401271281)

		resp = await client.post(f"/api/missions/{mission_id}/validate")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "blocked"
		assert any(h["layer"] == "lndare" for h in body["hazards"])

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		mission = mission_resp.json()
		assert mission["last_validation_status"] == "blocked"
		assert mission["last_validated_at"] is not None
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_validate_mission_warning_on_real_shallow_water(client: AsyncClient) -> None:
	# Straddles a real enc_depare polygon (DRVAL1=0.5 m) centroid, confirmed clear of every
	# blocked layer at this margin via psql before writing this test.
	mission_id = await _create_mission(client, name="Validate warning test")
	try:
		await _add_waypoint(client, mission_id, 59.389597, 10.525664883346424)
		await _add_waypoint(client, mission_id, 59.387597, 10.525664883346424)

		resp = await client.post(f"/api/missions/{mission_id}/validate")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "warning"
		assert body["hazards"][0]["layer"] == "depare"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_validate_mission_safe_within_covered_hazard_free_water(client: AsyncClient) -> None:
	# A point deep inside a real enc_m_covr CATCOV=1 polygon (confirmed via psql before writing
	# this test: covered, and clear of every hazard/depth layer at this margin), so this exercises
	# "safe" specifically -- covered AND hazard-free -- not just "no hazard layer happened to hit".
	mission_id = await _create_mission(client, name="Validate safe test")
	try:
		await _add_waypoint(client, mission_id, 59.366128, 10.625)
		await _add_waypoint(client, mission_id, 59.367128, 10.626)

		resp = await client.post(f"/api/missions/{mission_id}/validate")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "safe"
		assert body["hazards"] == []
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_validate_mission_no_data_outside_charted_coverage(client: AsyncClient) -> None:
	# Central Oslo -- confirmed via psql to fall outside every enc_m_covr CATCOV=1 polygon in this
	# delivery (README.md already documents this delivery covers the outer/southern Oslofjord, not
	# central Oslo city). Must not read as "safe": no hazard layer has any data there either.
	mission_id = await _create_mission(client, name="Validate no_data test")
	try:
		await _add_waypoint(client, mission_id, 59.9139, 10.7522)
		await _add_waypoint(client, mission_id, 59.9159, 10.7542)

		resp = await client.post(f"/api/missions/{mission_id}/validate")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "no_data"
		assert body["hazards"][0]["layer"] == "m_covr"

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		assert mission_resp.json()["last_validation_status"] == "no_data"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_not_blocked_by_no_data(client: AsyncClient) -> None:
	# The vessel is tested in areas outside this delivery's ENC coverage -- sending must stay
	# possible there. Only "blocked" refuses; "no_data" (like "warning") does not.
	mission_id = await _create_mission(client, name="Send no_data test")
	try:
		await _add_waypoint(client, mission_id, 59.9139, 10.7522)
		await _add_waypoint(client, mission_id, 59.9159, 10.7542)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "acknowledged"
		assert body["validation_status"] == "no_data"
		bridge.publish_and_await_ack.assert_awaited_once()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_blocked_by_validation_refuses_to_publish(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Send blocked test")
	try:
		await _add_waypoint(client, mission_id, 59.379916, 10.527813401271281)
		await _add_waypoint(client, mission_id, 59.377916, 10.527813401271281)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 409
		assert "hazards" in resp.json()["detail"]
		# Must not have attempted to publish at all -- a blocked route never reaches the vessel.
		bridge.publish_and_await_ack.assert_not_awaited()

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		mission = mission_resp.json()
		assert mission["last_validation_status"] == "blocked"
		assert mission["last_send_status"] is None
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_response_surfaces_a_warning_result(client: AsyncClient) -> None:
	# The send still succeeds for a "warning" (shallow water, not blocked) -- but the response
	# itself must carry the warning, or it's silently persisted to last_validation_status with
	# nothing anywhere ever telling the operator about it.
	mission_id = await _create_mission(client, name="Send warning test")
	try:
		await _add_waypoint(client, mission_id, 59.389597, 10.525664883346424)
		await _add_waypoint(client, mission_id, 59.387597, 10.525664883346424)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "acknowledged"
		assert body["validation_status"] == "warning"
		assert body["hazards"][0]["layer"] == "depare"
		bridge.publish_and_await_ack.assert_awaited_once()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_clears_resume_cache_for_all_missions(client: AsyncClient) -> None:
	# Any publish to /update_waypoint_list replaces the vessel's entire queue -- any previously
	# paused mission's remembered "remaining queue" no longer reflects reality once that happens,
	# regardless of which mission the new send is for.
	mission_id = await _create_mission(client, name="Send invalidates resume test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"
		bridge.resume_cache["some-other-mission-id"] = [
			{
				"id": 0,
				"pos_x": 1.0,
				"pos_y": 2.0,
				"pos_z": 0.0,
				"switch_radius": 5.0,
				"desired_speed": 2.0,
				"heading_mode": 0,
				"heading_rad": 0.0,
			}
		]

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 200
		assert bridge.resume_cache == {}
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_send_mission_blocked_while_a_different_mission_is_actively_tracked(
	client: AsyncClient,
) -> None:
	mission_a = await _create_mission(client, name="Active mission A")
	mission_b = await _create_mission(client, name="Would-be sent mission B")
	try:
		await _add_waypoint(client, mission_a, 59.92, 10.76)
		await _add_waypoint(client, mission_b, 59.93, 10.77)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.tracked_mission_id = mission_a
		bridge.tracked_state = "active"

		resp = await client.post(f"/api/missions/{mission_b}/send")
		assert resp.status_code == 409
		assert resp.json()["detail"]["reason"] == "another_mission_active"
		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_a}")
		await client.delete(f"/api/missions/{mission_b}")


async def test_send_mission_allows_resending_the_same_active_mission(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Resend same active mission")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"
		bridge.tracked_mission_id = mission_id
		bridge.tracked_state = "active"

		resp = await client.post(f"/api/missions/{mission_id}/send")
		assert resp.status_code == 200
		bridge.publish_and_await_ack.assert_awaited_once()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


_RESUME_WAYPOINT = {
	"id": 2,
	"pos_x": 5.0,
	"pos_y": 6.0,
	"pos_z": 0.0,
	"switch_radius": 5.0,
	"desired_speed": 2.0,
	"heading_mode": 0,
	"heading_rad": 0.0,
}


async def test_start_mission_acknowledged_sets_active_and_started_at(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Start test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.target = "physical"
		bridge.publish_and_await_ack.return_value = "acknowledged"

		# A fresh start now requires the mission to already be "loaded" (sent) -- mirrors real
		# ECDIS/autopilot: upload the route, then engage the autopilot as a separate step.
		send_resp = await client.post(f"/api/missions/{mission_id}/send")
		assert send_resp.status_code == 200

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "acknowledged"
		assert body["state"] == "active"
		assert body["autonomy_engaged"] is False
		assert body["autonomy_note"] is not None

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		mission = mission_resp.json()
		assert mission["status"] == "active"
		assert mission["started_at"] is not None

		# Fresh start publishes nothing itself -- Send already did. Only one total
		# publish_and_await_ack call across the whole send+start flow.
		bridge.publish_and_await_ack.assert_awaited_once()
		# The physical vessel's autonomy engage is RC-hardware owned -- must never be published to.
		bridge.publish.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_start_mission_simulation_engages_autonomy(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Start sim test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.target = "simulation"
		bridge.publish_and_await_ack.return_value = "acknowledged"

		send_resp = await client.post(f"/api/missions/{mission_id}/send")
		assert send_resp.status_code == 200

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 200
		body = resp.json()
		assert body["autonomy_engaged"] is True
		assert body["autonomy_note"] is None

		bridge.publish_and_await_ack.assert_awaited_once()
		bridge.publish.assert_awaited_once_with(
			"/arduino/is_autonomous", "std_msgs/Bool", {"data": True}
		)
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_start_mission_without_prior_send_returns_412(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Never sent test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 412
		assert resp.json()["detail"]["reason"] == "not_loaded"
		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_start_mission_blocked_when_a_different_mission_was_sent_more_recently(
	client: AsyncClient,
) -> None:
	bridge = app.state.bridge
	bridge.connected = True
	bridge.publish_and_await_ack.return_value = "acknowledged"

	mission_a = await _create_mission(client, name="Sent mission A")
	mission_b = await _create_mission(client, name="Never sent mission B")
	try:
		await _add_waypoint(client, mission_a, 59.92, 10.76)
		await _add_waypoint(client, mission_b, 59.93, 10.77)

		send_resp = await client.post(f"/api/missions/{mission_a}/send")
		assert send_resp.status_code == 200

		resp = await client.post(f"/api/missions/{mission_b}/start")
		assert resp.status_code == 412
		assert resp.json()["detail"]["reason"] == "not_loaded"
	finally:
		await client.delete(f"/api/missions/{mission_a}")
		await client.delete(f"/api/missions/{mission_b}")


async def test_start_mission_rejects_an_already_active_mission(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Already active test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")
		bridge.publish_and_await_ack.reset_mock()

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 409
		assert resp.json()["detail"]["reason"] == "invalid_transition"
		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_start_mission_resume_path_rejects_a_non_paused_mission(client: AsyncClient) -> None:
	# A resume_cache entry with no matching "paused" status shouldn't happen in practice (pause
	# is what populates it), but the resume branch must not trust the cache blindly.
	mission_id = await _create_mission(client, name="Stale resume cache test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.resume_cache[str(mission_id)] = [_RESUME_WAYPOINT]

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 409
		assert resp.json()["detail"]["reason"] == "invalid_transition"
		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_start_mission_blocked_by_validation_refuses_to_publish(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Start blocked test")
	try:
		await _add_waypoint(client, mission_id, 59.379916, 10.527813401271281)
		await _add_waypoint(client, mission_id, 59.377916, 10.527813401271281)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 409
		bridge.publish_and_await_ack.assert_not_awaited()

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		assert mission_resp.json()["status"] == "draft"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_start_resume_not_acknowledged_does_not_claim_active(client: AsyncClient) -> None:
	# Fresh starts no longer publish/wait for an ack at all (see
	# test_start_mission_without_prior_send_returns_412) -- an ack can only fail on the *resume*
	# path, which still self-publishes the cached remainder.
	mission_id = await _create_mission(client, name="Resume timeout test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"
		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")
		bridge.latest_waypoint_list = [_RESUME_WAYPOINT]
		await client.post(f"/api/missions/{mission_id}/pause")

		bridge.publish_and_await_ack.return_value = "timed_out"
		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 200
		body = resp.json()
		assert body["status"] == "timed_out"
		assert body["state"] == "starting"

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		mission = mission_resp.json()
		assert mission["status"] == "paused"  # unchanged -- the resume attempt didn't take
		# The resume snapshot must survive a failed attempt so a retry is still possible.
		assert mission_id in bridge.resume_cache
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_pause_mission_snapshots_resume_cache_and_publishes_empty_list(
	client: AsyncClient,
) -> None:
	mission_id = await _create_mission(client, name="Pause test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.target = "simulation"
		bridge.publish_and_await_ack.return_value = "acknowledged"
		bridge.latest_waypoint_list = [_RESUME_WAYPOINT]

		# Pause is only valid from an active mission -- get it there first, then reset the mocks
		# so the assert_awaited_once_with calls below only see pause's own.
		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")
		bridge.publish_and_await_ack.reset_mock()
		bridge.publish.reset_mock()

		resp = await client.post(f"/api/missions/{mission_id}/pause")
		assert resp.status_code == 200
		body = resp.json()
		assert body["state"] == "paused"
		assert body["waypoint_count"] == 1

		# The published payload must be empty -- clearing the list is what stops the vessel.
		call_args = bridge.publish_and_await_ack.await_args
		assert call_args.args[2] == {"waypoints": []}

		bridge.publish.assert_awaited_once_with(
			"/arduino/is_autonomous", "std_msgs/Bool", {"data": False}
		)
		assert bridge.resume_cache[mission_id] == [_RESUME_WAYPOINT]

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		assert mission_resp.json()["status"] == "paused"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_pause_mission_without_echo_logs_warning_and_skips_cache(
	client: AsyncClient,
) -> None:
	mission_id = await _create_mission(client, name="Pause no echo test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "not_connected"
		bridge.latest_waypoint_list = None

		# Pause is only valid from an active mission.
		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")

		resp = await client.post(f"/api/missions/{mission_id}/pause")
		assert resp.status_code == 200
		# Regression: no /waypoint_list echo ever received (e.g. testing against a rosbag replay
		# that doesn't include this topic) must not be reported the same as a confirmed-empty
		# queue -- that previously collapsed to waypoint_count=0, reading as "100% complete" in
		# the frontend instead of "nothing known to be reached yet."
		assert resp.json()["waypoint_count"] == 1
		assert mission_id not in bridge.resume_cache

		severity = await _last_audit_severity(mission_id, "mission.pause.no_resume_point")
		assert severity == "warning"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_pause_and_terminate_reject_when_a_different_mission_is_tracked(
	client: AsyncClient,
) -> None:
	mission_a = await _create_mission(client, name="Tracked mission A")
	mission_b = await _create_mission(client, name="Stale request mission B")
	try:
		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		# pause/terminate are only valid from an active mission -- get mission_b there first,
		# then reset the mock so the no-op-on-reject assertion below is unaffected by this setup.
		await _add_waypoint(client, mission_b, 59.92, 10.76)
		await client.post(f"/api/missions/{mission_b}/send")
		await client.post(f"/api/missions/{mission_b}/start")
		bridge.publish_and_await_ack.reset_mock()

		bridge.tracked_mission_id = mission_a
		bridge.tracked_state = "active"

		pause_resp = await client.post(f"/api/missions/{mission_b}/pause")
		assert pause_resp.status_code == 409
		assert pause_resp.json()["detail"]["reason"] == "stale_mission"

		terminate_resp = await client.post(f"/api/missions/{mission_b}/terminate")
		assert terminate_resp.status_code == 409
		assert terminate_resp.json()["detail"]["reason"] == "stale_mission"

		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_a}")
		await client.delete(f"/api/missions/{mission_b}")


async def test_pause_rejects_a_mission_that_was_never_started(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Pause draft test")
	try:
		bridge = app.state.bridge
		bridge.connected = True

		resp = await client.post(f"/api/missions/{mission_id}/pause")
		assert resp.status_code == 409
		assert resp.json()["detail"]["reason"] == "invalid_transition"
		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_pause_rejects_an_aborted_mission(client: AsyncClient) -> None:
	# The concrete bug this guards against: pausing an already-terminated mission must not
	# silently relabel it "paused" again.
	mission_id = await _create_mission(client, name="Pause aborted test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")
		await client.post(f"/api/missions/{mission_id}/terminate")
		bridge.publish_and_await_ack.reset_mock()

		resp = await client.post(f"/api/missions/{mission_id}/pause")
		assert resp.status_code == 409
		assert resp.json()["detail"]["reason"] == "invalid_transition"
		bridge.publish_and_await_ack.assert_not_awaited()

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		assert mission_resp.json()["status"] == "aborted"  # unchanged
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_terminate_rejects_a_mission_that_was_never_started(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Terminate draft test")
	try:
		bridge = app.state.bridge
		bridge.connected = True

		resp = await client.post(f"/api/missions/{mission_id}/terminate")
		assert resp.status_code == 409
		assert resp.json()["detail"]["reason"] == "invalid_transition"
		bridge.publish_and_await_ack.assert_not_awaited()
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_pause_and_terminate_allow_when_nothing_tracked(client: AsyncClient) -> None:
	# Fail-open when tracked_mission_id is None (e.g. after a backend restart, in-memory tracking
	# state is lost) -- a genuinely stuck mission must still be pausable/terminable.
	mission_id = await _create_mission(client, name="Nothing tracked test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"
		bridge.tracked_mission_id = None

		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")

		pause_resp = await client.post(f"/api/missions/{mission_id}/pause")
		assert pause_resp.status_code == 200
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_resume_after_pause_sends_cached_remaining_list_not_full_mission(
	client: AsyncClient,
) -> None:
	mission_id = await _create_mission(client, name="Resume test")
	try:
		# Three original waypoints, but the vessel's actual queue (captured at pause time) has
		# already popped the first two -- resuming must not re-run those completed legs.
		await _add_waypoint(client, mission_id, 59.90, 10.70)
		await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={"sequence_number": 1, "latitude": 59.91, "longitude": 10.71, "target_speed": 4.0},
		)
		await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={"sequence_number": 2, "latitude": 59.92, "longitude": 10.72, "target_speed": 4.0},
		)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.target = "physical"
		bridge.publish_and_await_ack.return_value = "acknowledged"
		bridge.resume_cache[mission_id] = [_RESUME_WAYPOINT]

		# Resuming is only valid from a paused mission.
		await client.patch(f"/api/missions/{mission_id}", json={"status": "paused"})

		resp = await client.post(f"/api/missions/{mission_id}/start")
		assert resp.status_code == 200
		body = resp.json()
		assert body["waypoint_count"] == 1  # not the original 3

		call_args = bridge.publish_and_await_ack.await_args
		sent = call_args.args[2]
		assert len(sent["waypoints"]) == 1
		assert sent["waypoints"][0]["id"] == 2
		assert sent["waypoints"][0]["pose"]["pose"]["position"]["x"] == 5.0

		# The cache entry is consumed on a successful resume, not left stale for next time.
		assert mission_id not in bridge.resume_cache
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_terminate_mission_sets_aborted_and_completed_at_and_logs_warning_severity(
	client: AsyncClient,
) -> None:
	mission_id = await _create_mission(client, name="Terminate test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.target = "simulation"
		bridge.publish_and_await_ack.return_value = "acknowledged"

		# Terminate is only valid from an active (or paused) mission -- get it there first, then
		# reset the mocks so the assert_awaited_once_with calls below only see terminate's own.
		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")
		bridge.publish_and_await_ack.reset_mock()
		bridge.publish.reset_mock()

		resp = await client.post(f"/api/missions/{mission_id}/terminate")
		assert resp.status_code == 200
		body = resp.json()
		assert body["state"] == "aborted"

		call_args = bridge.publish_and_await_ack.await_args
		assert call_args.args[2] == {"waypoints": []}
		bridge.publish.assert_awaited_once_with(
			"/arduino/is_autonomous", "std_msgs/Bool", {"data": False}
		)

		mission_resp = await client.get(f"/api/missions/{mission_id}")
		mission = mission_resp.json()
		assert mission["status"] == "aborted"
		assert mission["completed_at"] is not None

		severity = await _last_audit_severity(mission_id, "mission.terminate")
		assert severity == "warning"
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_terminate_mission_without_echo_reports_mission_waypoint_count(
	client: AsyncClient,
) -> None:
	# Regression: terminating a mission with no /waypoint_list echo ever received (e.g. testing
	# against a rosbag replay that doesn't include this topic, so bridge.latest_waypoint_list is
	# None and there's no resume-cache snapshot either, since this mission was never paused) must
	# not report waypoint_count=0 -- that reads as "100% complete" in the frontend instead of
	# "nothing known to be reached yet."
	mission_id = await _create_mission(client, name="Terminate no echo test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)
		await client.post(
			f"/api/missions/{mission_id}/waypoints",
			json={"sequence_number": 1, "latitude": 59.93, "longitude": 10.77, "target_speed": 4.0},
		)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.target = "simulation"
		bridge.publish_and_await_ack.return_value = "acknowledged"

		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")

		resp = await client.post(f"/api/missions/{mission_id}/terminate")
		assert resp.status_code == 200
		assert resp.json()["waypoint_count"] == 2
	finally:
		await client.delete(f"/api/missions/{mission_id}")


async def test_terminate_clears_resume_cache(client: AsyncClient) -> None:
	mission_id = await _create_mission(client, name="Terminate clears cache test")
	try:
		await _add_waypoint(client, mission_id, 59.92, 10.76)

		bridge = app.state.bridge
		bridge.connected = True
		bridge.publish_and_await_ack.return_value = "acknowledged"

		# Terminate is only valid from an active (or paused) mission -- get it there first (a
		# fresh start, since resume_cache is still empty at this point). Only afterwards simulate
		# an existing resume snapshot (as a prior pause would have left), to check terminate clears it.
		await client.post(f"/api/missions/{mission_id}/send")
		await client.post(f"/api/missions/{mission_id}/start")
		bridge.resume_cache[mission_id] = [_RESUME_WAYPOINT]

		resp = await client.post(f"/api/missions/{mission_id}/terminate")
		assert resp.status_code == 200
		assert mission_id not in bridge.resume_cache

		# Terminate leaves nothing "loaded" -- a bare Start (no resume_cache) now requires an
		# explicit Send first, which must be a fresh full send, not a stale partial resume.
		send_resp = await client.post(f"/api/missions/{mission_id}/send")
		assert send_resp.status_code == 200
		call_args = bridge.publish_and_await_ack.await_args
		assert len(call_args.args[2]["waypoints"]) == 1

		start_resp = await client.post(f"/api/missions/{mission_id}/start")
		assert start_resp.status_code == 200
	finally:
		await client.delete(f"/api/missions/{mission_id}")
