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
			"battery", "current", "temperature", "humidity",
			"emergency_stop", "linear_actuator", "control_mode", "bridge_status",
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
