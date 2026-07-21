"""Integration test: in-process mock rosbridge server → RosBridgeClient → queue.

Spins up a real asyncio WebSocket server that emits one message per subscribed
topic, then verifies the bridge client connects, subscribes, and delivers a
transformed contract message to a subscriber queue.
"""

import asyncio
import json

import pytest
from websockets.asyncio.server import serve

from revolt_api.bridge.client import RosBridgeClient

DEAD_URL = "ws://127.0.0.1:19999"  # nothing listening here


async def _mock_server(websocket) -> None:
	"""Minimal rosbridge mock: subscribe → emit one message → wait for client to disconnect."""
	subscribed: list[str] = []
	async for raw in websocket:
		frame = json.loads(raw)
		if frame.get("op") == "subscribe":
			topic = frame["topic"]
			subscribed.append(topic)
			# Emit one realistic message per subscribed topic
			msgs: dict[str, dict] = {
				"/arduino/stern/battery_voltage": {"data": 24.1},
				"/arduino/stern/port/current": {"data": 300},
				"/arduino/stern/star/current": {"data": 310},
				"/arduino/bow/current": {"data": 290},
				"/arduino/stern/DHT22/temperature": {"data": 21.5},
				"/arduino/stern/DHT22/humidity": {"data": 62.0},
				"/arduino/bow/DHT22/temperature": {"data": 20.0},
				"/arduino/bow/DHT22/humidity": {"data": 58.0},
				"/arduino/stern/emergency_stop_status": {"data": 0},
				"/arduino/bow/linear_actuator_retract_state": {"data": 1},
				"/control_mode": {"data": 2},
			}
			if topic in msgs:
				await websocket.send(
					json.dumps({"op": "publish", "topic": topic, "msg": msgs[topic]})
				)
		elif frame.get("op") == "publish" and frame.get("topic") == "/update_waypoint_list":
			# Mirrors infra/rosbridge_mock/server.py's echo behavior: adopt whatever was
			# published as the new active list and echo it back on /waypoint_list.
			await websocket.send(
				json.dumps({"op": "publish", "topic": "/waypoint_list", "msg": frame["msg"]})
			)
		elif frame.get("op") == "call_service":
			service = frame.get("service")
			call_id = frame.get("id")
			if service == "/rosapi/topics":
				await websocket.send(
					json.dumps(
						{
							"op": "service_response",
							"id": call_id,
							"service": service,
							"values": {"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]},
							"result": True,
						}
					)
				)
			elif service == "/rosapi/get_param_slow":
				# Deliberately never responds, so callers awaiting this service time out.
				pass
			elif service == "/rosapi/fails":
				await websocket.send(
					json.dumps(
						{
							"op": "service_response",
							"id": call_id,
							"service": service,
							"values": None,
							"result": False,
						}
					)
				)


@pytest.fixture
async def mock_bridge_url():
	"""Start a local mock rosbridge server on a random port and return its URL."""
	# Port 0 lets the OS pick a free port
	async with serve(_mock_server, "127.0.0.1", 0) as server:
		port = server.sockets[0].getsockname()[1]
		yield f"ws://127.0.0.1:{port}"


async def test_client_receives_battery_message(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	q = client.subscribe()
	await client.start()

	try:
		msg = await asyncio.wait_for(q.get(), timeout=5.0)
		assert msg["v"] == "1"
		assert msg["type"] in {
			"battery",
			"current",
			"temperature",
			"humidity",
			"emergency_stop",
			"linear_actuator",
			"control_mode",
			"bridge_status",
		}
	finally:
		await client.stop()


async def test_client_receives_bridge_status_on_connect(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	q = client.subscribe()
	await client.start()

	try:
		# The first message is always bridge_status with connected=True
		msg = await asyncio.wait_for(q.get(), timeout=5.0)
		# May be bridge_status or first topic message depending on timing;
		# drain until we see bridge_status connected=true
		found = False
		for _ in range(20):
			if msg.get("type") == "bridge_status" and msg.get("connected") is True:
				found = True
				break
			try:
				msg = await asyncio.wait_for(q.get(), timeout=2.0)
			except TimeoutError:
				break
		assert found, "Never received bridge_status with connected=True"
	finally:
		await client.stop()


async def test_client_broadcasts_to_multiple_subscribers(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	q1 = client.subscribe()
	q2 = client.subscribe()
	await client.start()

	try:
		msg1 = await asyncio.wait_for(q1.get(), timeout=5.0)
		msg2 = await asyncio.wait_for(q2.get(), timeout=5.0)
		assert msg1["v"] == "1"
		assert msg2["v"] == "1"
	finally:
		await client.stop()
		client.unsubscribe(q1)
		client.unsubscribe(q2)


async def test_client_unsubscribe_removes_queue(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	q = client.subscribe()
	assert len(client._subscribers) == 1
	client.unsubscribe(q)
	assert len(client._subscribers) == 0
	await client.start()
	await client.stop()


async def test_exponential_backoff_on_failed_connection() -> None:
	"""_backoff_s doubles after each failed connection attempt.

	Connection refused on localhost is near-instant, so after one failed attempt
	the client should have doubled the delay from 1 s to 2 s before sleeping to
	retry. The 0.3 s wait gives the attempt time to fail without waiting for the
	full retry sleep.
	"""
	client = RosBridgeClient(DEAD_URL, "physical")
	assert client._backoff_s == 1.0

	await client.start()
	try:
		await asyncio.sleep(0.3)
		assert client._backoff_s == 2.0, (
			f"Expected 2.0 after first failure, got {client._backoff_s}"
		)
	finally:
		await client.stop()


async def test_backoff_resets_on_successful_connection(mock_bridge_url: str) -> None:
	"""_backoff_s resets to 1.0 when the connection succeeds."""
	client = RosBridgeClient(mock_bridge_url, "physical")
	q = client.subscribe()
	await client.start()

	try:
		# Drain until we see a successful bridge_status or any telemetry message.
		msg = await asyncio.wait_for(q.get(), timeout=5.0)
		assert msg["v"] == "1"
		assert client._backoff_s == 1.0, f"Expected backoff reset to 1.0, got {client._backoff_s}"
	finally:
		await client.stop()


async def test_frontend_throttle_drops_within_window() -> None:
	"""Two dispatches of a high-freq topic within the throttle window produce one queue entry.

	The IMU topic has frontend_throttle_ms=100. Two _dispatch() calls in the same
	event loop turn have near-zero elapsed time between them, so the second is dropped.
	"""
	client = RosBridgeClient(DEAD_URL, "physical")
	q = client.subscribe()
	q.get_nowait()  # drain initial BridgeStatusMsg pushed by subscribe()

	imu_msg = json.dumps(
		{
			"op": "publish",
			"topic": "/revolt/sim/stc/imu/data",
			"msg": {
				"linear": {"x": 0.1, "y": 0.0, "z": 0.0},
				"angular": {"x": 0.0, "y": 0.0, "z": 0.0},
			},
		}
	)

	client._dispatch(imu_msg)
	client._dispatch(imu_msg)  # within throttle window — should be dropped

	assert q.qsize() == 1, "Second dispatch within throttle window should be dropped"
	client.unsubscribe(q)


async def test_publish_and_await_ack_resolves_acknowledged_on_matching_echo(
	mock_bridge_url: str,
) -> None:
	client = RosBridgeClient(mock_bridge_url, "simulation")
	await client.start()
	try:
		# Wait for the connection to actually establish before publishing.
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		waypoint_msg = {
			"waypoints": [
				{
					"id": 0,
					"pose": {
						"pose": {"position": {"x": 1.0, "y": 2.0, "z": 0.0}},
					},
					"switch_radius": 5.0,
					"desired_speed": 2.5,
					"heading_mode": 0,
					"heading": 0.0,
				}
			]
		}
		status = await client.publish_and_await_ack(
			"/update_waypoint_list",
			"custom_msgs/WaypointList",
			waypoint_msg,
			expected=[(0, 1.0, 2.0)],
			timeout_s=5.0,
		)
		assert status == "acknowledged"
	finally:
		await client.stop()


async def test_publish_and_await_ack_resolves_mismatched_on_different_echo(
	mock_bridge_url: str,
) -> None:
	client = RosBridgeClient(mock_bridge_url, "simulation")
	await client.start()
	try:
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		waypoint_msg = {
			"waypoints": [
				{
					"id": 0,
					"pose": {"pose": {"position": {"x": 1.0, "y": 2.0, "z": 0.0}}},
					"switch_radius": 5.0,
					"desired_speed": 2.5,
					"heading_mode": 0,
					"heading": 0.0,
				}
			]
		}
		# expected doesn't match what the mock will echo back (same payload we send).
		status = await client.publish_and_await_ack(
			"/update_waypoint_list",
			"custom_msgs/WaypointList",
			waypoint_msg,
			expected=[(0, 999.0, 999.0)],
			timeout_s=5.0,
		)
		assert status == "mismatched"
	finally:
		await client.stop()


async def test_publish_and_await_ack_times_out_with_no_echo(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "simulation")
	await client.start()
	try:
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		# Publishing to a topic the mock never echoes back leaves nothing to resolve the wait.
		status = await client.publish_and_await_ack(
			"/add_waypoint", "custom_msgs/Waypoint", {}, expected=[(0, 0.0, 0.0)], timeout_s=0.3
		)
		assert status == "timed_out"
	finally:
		await client.stop()


async def test_publish_and_await_ack_returns_not_connected_when_disconnected() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	status = await client.publish_and_await_ack(
		"/update_waypoint_list", "custom_msgs/WaypointList", {}, expected=[]
	)
	assert status == "not_connected"


async def test_call_service_resolves_ok_with_values(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	await client.start()
	try:
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		result = await client.call_service("/rosapi/topics", "rosapi_msgs/Topics", timeout_s=5.0)
		assert result.ok is True
		assert result.error is None
		assert result.values == {"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]}
	finally:
		await client.stop()


async def test_call_service_resolves_not_ok_on_result_false(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	await client.start()
	try:
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		result = await client.call_service("/rosapi/fails", "rosapi_msgs/GetParam", timeout_s=5.0)
		assert result.ok is False
		assert result.error == "service_call_failed"
		assert result.values is None
	finally:
		await client.stop()


async def test_call_service_times_out_with_no_response(mock_bridge_url: str) -> None:
	client = RosBridgeClient(mock_bridge_url, "physical")
	await client.start()
	try:
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		result = await client.call_service(
			"/rosapi/get_param_slow", "rosapi_msgs/GetParam", timeout_s=0.3
		)
		assert result.ok is False
		assert result.error == "timed_out"
		# The abandoned call must not linger in the pending-calls table forever.
		assert len(client._pending_service_calls) == 0
	finally:
		await client.stop()


async def test_call_service_returns_not_connected_when_disconnected() -> None:
	client = RosBridgeClient(DEAD_URL, "physical")
	result = await client.call_service("/rosapi/topics", "rosapi_msgs/Topics")
	assert result.ok is False
	assert result.error == "not_connected"


async def test_call_service_concurrent_calls_resolve_independently(mock_bridge_url: str) -> None:
	"""Two calls in flight at once must not clobber each other -- unlike publish_and_await_ack's
	single-slot PendingAck, call_service correlates by id, so this must not be single-flight."""
	client = RosBridgeClient(mock_bridge_url, "physical")
	await client.start()
	try:
		for _ in range(50):
			if client.connected:
				break
			await asyncio.sleep(0.05)
		assert client.connected

		results = await asyncio.gather(
			client.call_service("/rosapi/topics", "rosapi_msgs/Topics"),
			client.call_service("/rosapi/topics", "rosapi_msgs/Topics"),
		)
		assert all(r.ok for r in results)
		assert all(
			r.values == {"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]} for r in results
		)
	finally:
		await client.stop()


def test_latest_raw_message_returns_none_before_any_publish() -> None:
	client = RosBridgeClient(DEAD_URL, "physical")
	assert client.latest_raw_message("/fix") is None


def test_latest_raw_message_reflects_latest_dispatch() -> None:
	client = RosBridgeClient(DEAD_URL, "physical")
	client._dispatch(
		json.dumps({"op": "publish", "topic": "/fix", "msg": {"latitude": 1.0, "longitude": 2.0}})
	)
	client._dispatch(
		json.dumps({"op": "publish", "topic": "/fix", "msg": {"latitude": 3.0, "longitude": 4.0}})
	)
	latest = client.latest_raw_message("/fix")
	assert latest is not None
	assert latest.msg == {"latitude": 3.0, "longitude": 4.0}


def test_latest_raw_message_only_covers_dispatched_topics() -> None:
	client = RosBridgeClient(DEAD_URL, "physical")
	client._dispatch(
		json.dumps({"op": "publish", "topic": "/fix", "msg": {"latitude": 1.0, "longitude": 2.0}})
	)
	assert client.latest_raw_message("/heading") is None


def test_latlon_to_cartesian_is_inverse_of_cartesian_to_latlon() -> None:
	client = RosBridgeClient(
		"ws://unused:9090", "simulation", gnss_origin_lat=59.9083, gnss_origin_lon=10.7512
	)
	lat, lon = 59.92, 10.76
	x, y = client.latlon_to_cartesian(lat, lon)
	round_trip_lat, round_trip_lon = client._cartesian_to_latlon(x, y)
	assert round_trip_lat == pytest.approx(lat, abs=1e-9)
	assert round_trip_lon == pytest.approx(lon, abs=1e-9)


async def test_unthrottled_topic_passes_every_dispatch() -> None:
	"""Topics with no frontend_throttle_ms=0 let every message through."""
	client = RosBridgeClient(DEAD_URL, "physical")
	q = client.subscribe()
	q.get_nowait()  # drain initial BridgeStatusMsg pushed by subscribe()

	battery_msg = json.dumps(
		{
			"op": "publish",
			"topic": "/arduino/stern/battery_voltage",
			"msg": {"data": 24.1},
		}
	)

	client._dispatch(battery_msg)
	client._dispatch(battery_msg)

	assert q.qsize() == 2, "Battery topic has no throttle — both dispatches should reach the queue"
	client.unsubscribe(q)


def _waypoint_list_frame(entries: list[tuple[int, float, float]]) -> str:
	return json.dumps(
		{
			"op": "publish",
			"topic": "/waypoint_list",
			"msg": {
				"waypoints": [
					{
						"id": wp_id,
						"pose": {"pose": {"position": {"x": x, "y": y, "z": 0.0}}},
						"switch_radius": 5.0,
						"desired_speed": 1.5,
						"heading_mode": 0,
						"heading": 0.0,
					}
					for wp_id, x, y in entries
				]
			},
		}
	)


def test_track_mission_sets_starting_state_and_total_count() -> None:
	# "starting", not "active": track_mission is called before the ack lands (see start_mission),
	# so the tracked state must not claim active until broadcast_tracked_status confirms it.
	client = RosBridgeClient(DEAD_URL, "simulation")
	client.track_mission("mission-1", 3)
	assert client._mission_tracker.tracked_mission_id == "mission-1"
	assert client._mission_tracker.tracked_total_count == 3
	assert client._mission_tracker.tracked_state == "starting"


def test_tracked_mission_id_and_state_public_properties_reflect_current_tracking() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	assert client.tracked_mission_id is None

	client.track_mission("mission-1", 3)
	assert client.tracked_mission_id == "mission-1"
	assert client.tracked_state == "starting"

	client.broadcast_tracked_status("mission-1", "active", None, 0)
	assert client.tracked_state == "active"

	client.untrack_mission()
	assert client.tracked_mission_id is None


def test_untrack_mission_clears_tracking() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	client.track_mission("mission-1", 3)
	client.untrack_mission()
	assert client._mission_tracker.tracked_mission_id is None
	assert client._mission_tracker.tracked_total_count == 0


def test_waypoint_list_echo_broadcasts_execution_status_when_tracked() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	q = client.subscribe()
	q.get_nowait()  # drain initial BridgeStatusMsg pushed by subscribe()
	client.track_mission("mission-1", 3)

	client._dispatch(_waypoint_list_frame([(2, 10.0, 20.0), (3, 30.0, 40.0)]))

	# Two messages land: the sim_waypoint_list itself, then the execution status broadcast.
	msgs = [q.get_nowait() for _ in range(2)]
	exec_msgs = [m for m in msgs if m["type"] == "mission_execution_status"]
	assert len(exec_msgs) == 1
	status = exec_msgs[0]
	assert status["mission_id"] == "mission-1"
	assert status["state"] == "starting"  # track_mission's default, unless promoted since
	assert status["current_waypoint_seq"] == 2
	assert status["remaining_count"] == 2
	assert status["total_count"] == 3
	client.unsubscribe(q)


def test_waypoint_list_echo_reports_no_current_waypoint_when_empty() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	q = client.subscribe()
	q.get_nowait()
	client.track_mission("mission-1", 3)

	client._dispatch(_waypoint_list_frame([]))

	msgs = [q.get_nowait() for _ in range(2)]
	exec_msgs = [m for m in msgs if m["type"] == "mission_execution_status"]
	assert len(exec_msgs) == 1
	assert exec_msgs[0]["current_waypoint_seq"] is None
	assert exec_msgs[0]["remaining_count"] == 0
	client.unsubscribe(q)


def test_waypoint_list_echo_does_not_broadcast_execution_status_when_untracked() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	q = client.subscribe()
	q.get_nowait()

	client._dispatch(_waypoint_list_frame([(1, 1.0, 2.0)]))

	msgs = [q.get_nowait()]
	assert all(m["type"] != "mission_execution_status" for m in msgs)
	client.unsubscribe(q)


def test_broadcast_tracked_status_ignores_wrong_mission_id() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	q = client.subscribe()
	q.get_nowait()
	client.track_mission("mission-1", 3)

	client.broadcast_tracked_status("mission-2", "paused", None, 0)

	assert q.qsize() == 0, "Broadcasting for a mission id that isn't currently tracked is a no-op"
	client.unsubscribe(q)


def test_broadcast_tracked_status_updates_state_for_matching_mission() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	q = client.subscribe()
	q.get_nowait()
	client.track_mission("mission-1", 3)

	client.broadcast_tracked_status("mission-1", "paused", None, 2)

	msg = q.get_nowait()
	assert msg["type"] == "mission_execution_status"
	assert msg["state"] == "paused"
	assert msg["total_count"] == 3
	assert client._mission_tracker.tracked_state == "paused"
	client.unsubscribe(q)


def test_subscribe_pushes_no_mission_execution_status_when_nothing_tracked() -> None:
	client = RosBridgeClient(DEAD_URL, "simulation")
	q = client.subscribe()
	msgs = [q.get_nowait() for _ in range(q.qsize())]
	assert all(m["type"] != "mission_execution_status" for m in msgs)
	client.unsubscribe(q)


def test_subscribe_pushes_current_mission_execution_status_when_tracked() -> None:
	# A client that connects (or reconnects, e.g. on page refresh) after a mission was already
	# started must learn its live state immediately -- not only on the next echo/broadcast.
	client = RosBridgeClient(DEAD_URL, "simulation")
	client.track_mission("mission-1", 3)
	client._dispatch(_waypoint_list_frame([(1, 10.0, 20.0), (2, 30.0, 40.0)]))

	q = client.subscribe()
	msgs = [q.get_nowait() for _ in range(q.qsize())]
	exec_msgs = [m for m in msgs if m["type"] == "mission_execution_status"]
	assert len(exec_msgs) == 1
	status = exec_msgs[0]
	assert status["mission_id"] == "mission-1"
	assert status["current_waypoint_seq"] == 1
	assert status["remaining_count"] == 2
	assert status["total_count"] == 3
	client.unsubscribe(q)


def test_subscribe_pushes_total_count_as_remaining_when_no_echo_yet() -> None:
	# track_mission() is called before publish_and_await_ack (see start_mission) -- a client
	# connecting in that brief pre-ack window should see "nothing consumed yet", not a bogus 0.
	client = RosBridgeClient(DEAD_URL, "simulation")
	client.track_mission("mission-1", 3)

	q = client.subscribe()
	msgs = [q.get_nowait() for _ in range(q.qsize())]
	exec_msgs = [m for m in msgs if m["type"] == "mission_execution_status"]
	assert len(exec_msgs) == 1
	assert exec_msgs[0]["current_waypoint_seq"] is None
	assert exec_msgs[0]["remaining_count"] == 3
	client.unsubscribe(q)
