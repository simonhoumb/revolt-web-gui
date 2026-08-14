"""Unit tests for ros_command_service.py, with a fake bridge and mocked log_action so these run
without a real rosbridge connection or DB (see test_ros_commands_api.py for the router-level
round trip)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from revolt_api.bridge.client import LatestRawMessage, ServiceCallResult
from revolt_api.services import ros_command_service


class FakeBridge:
	def __init__(
		self,
		target: str = "physical",
		service_responses: dict[str, ServiceCallResult] | None = None,
		raw_messages: dict[str, LatestRawMessage] | None = None,
	) -> None:
		self.target = target
		self._service_responses = service_responses or {}
		self._raw_messages = raw_messages or {}
		self.calls: list[tuple[str, str, dict]] = []

	async def call_service(self, service, ros_type, args=None, timeout_s=5.0):  # noqa: ANN001
		self.calls.append((service, ros_type, args or {}))
		return self._service_responses.get(
			service, ServiceCallResult(ok=False, values=None, error="service_call_failed")
		)

	def latest_raw_message(self, topic):  # noqa: ANN001
		return self._raw_messages.get(topic)


def _db() -> MagicMock:
	return MagicMock()


async def _execute(bridge, command_id: str, params: dict[str, str]):  # noqa: ANN001
	with patch.object(ros_command_service, "log_action", new=AsyncMock()) as mock_log:
		result = await ros_command_service.execute_command(
			_db(), bridge, "sess-1", command_id, params
		)
		return result, mock_log


async def test_unknown_command_raises_404() -> None:
	bridge = FakeBridge()
	with pytest.raises(HTTPException) as exc_info:
		await ros_command_service.execute_command(_db(), bridge, "sess-1", "nope", {})
	assert exc_info.value.status_code == 404


async def test_list_topics_calls_the_right_rosapi_service() -> None:
	bridge = FakeBridge(
		service_responses={
			"/rosapi/topics": ServiceCallResult(
				ok=True, values={"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]}, error=None
			)
		}
	)
	result, mock_log = await _execute(bridge, "list_topics", {})
	assert result.ok is True
	assert result.result == {"topics": ["/fix"], "types": ["sensor_msgs/NavSatFix"]}
	assert bridge.calls == [("/rosapi/topics", "rosapi_msgs/Topics", {})]
	mock_log.assert_awaited_once()
	assert mock_log.await_args.kwargs["action"] == "ros_command.list_topics"
	assert mock_log.await_args.kwargs["params"]["ok"] is True


async def test_echo_topic_rejects_topic_not_in_allow_list() -> None:
	bridge = FakeBridge(target="physical")
	with pytest.raises(HTTPException) as exc_info:
		await ros_command_service.execute_command(
			_db(), bridge, "sess-1", "echo_topic", {"topic": "/not/allow/listed"}
		)
	assert exc_info.value.status_code == 400


async def test_echo_topic_returns_no_data_yet_when_uncached() -> None:
	bridge = FakeBridge(target="physical")
	result, _ = await _execute(bridge, "echo_topic", {"topic": "/fix"})
	assert result.ok is False
	assert result.error == "no_data_yet"


async def test_echo_topic_returns_cached_message() -> None:
	bridge = FakeBridge(
		target="physical",
		raw_messages={"/fix": LatestRawMessage(msg={"latitude": 1.0}, timestamp_ms=123)},
	)
	result, _ = await _execute(bridge, "echo_topic", {"topic": "/fix"})
	assert result.ok is True
	assert result.result == {"topic": "/fix", "msg": {"latitude": 1.0}, "received_at_ms": 123}


async def test_echo_topic_missing_required_param_raises_400() -> None:
	bridge = FakeBridge(target="physical")
	with pytest.raises(HTTPException) as exc_info:
		await ros_command_service.execute_command(_db(), bridge, "sess-1", "echo_topic", {})
	assert exc_info.value.status_code == 400


async def test_node_details_rejects_node_not_currently_live() -> None:
	bridge = FakeBridge(
		service_responses={
			"/rosapi/nodes": ServiceCallResult(
				ok=True, values={"nodes": ["/other_node"]}, error=None
			)
		}
	)
	with pytest.raises(HTTPException) as exc_info:
		await ros_command_service.execute_command(
			_db(), bridge, "sess-1", "node_details", {"node": "/missing_node"}
		)
	assert exc_info.value.status_code == 400


async def test_node_details_succeeds_for_a_live_node() -> None:
	bridge = FakeBridge(
		service_responses={
			"/rosapi/nodes": ServiceCallResult(
				ok=True, values={"nodes": ["/waypoint_switcher_node"]}, error=None
			),
			"/rosapi/node_details": ServiceCallResult(
				ok=True,
				values={"subscribing": [], "publishing": ["/waypoint_list"], "services": []},
				error=None,
			),
		}
	)
	result, _ = await _execute(bridge, "node_details", {"node": "/waypoint_switcher_node"})
	assert result.ok is True
	assert result.result == {"subscribing": [], "publishing": ["/waypoint_list"], "services": []}


async def test_node_details_liveness_probe_failure_is_not_a_400() -> None:
	"""A transport failure of the /rosapi/nodes liveness check itself (not connected, timed out)
	is a bridge outcome, not a bad request -- distinguishing this from the "node genuinely
	doesn't exist" 400 case matters so a disconnected bridge doesn't look like a validation
	error to the operator."""
	bridge = FakeBridge(
		service_responses={
			"/rosapi/nodes": ServiceCallResult(ok=False, values=None, error="not_connected")
		}
	)
	result, _ = await _execute(bridge, "node_details", {"node": "/anything"})
	assert result.ok is False
	assert result.error == "not_connected"


async def test_get_param_sends_default_value_and_surfaces_successful_flag() -> None:
	bridge = FakeBridge(
		service_responses={
			"/rosapi/get_param": ServiceCallResult(
				ok=True,
				values={"value": "", "successful": False, "reason": "parameter not set"},
				error=None,
			)
		}
	)
	result, _ = await _execute(bridge, "get_param", {"name": "/some/param"})
	assert result.ok is True
	assert result.result == {"value": "", "successful": False, "reason": "parameter not set"}
	assert bridge.calls == [
		("/rosapi/get_param", "rosapi_msgs/GetParam", {"name": "/some/param", "default_value": ""})
	]


async def test_audit_log_records_failure_outcomes_too() -> None:
	bridge = FakeBridge(target="physical")
	result, mock_log = await _execute(bridge, "echo_topic", {"topic": "/fix"})
	assert result.ok is False
	mock_log.assert_awaited_once()
	assert mock_log.await_args.kwargs["params"]["ok"] is False


async def test_describe_commands_resolves_topic_select_allowed_values_per_target() -> None:
	bridge = FakeBridge(target="physical")
	metas = await ros_command_service.describe_commands(bridge)
	echo = next(m for m in metas if m.command_id == "echo_topic")
	assert echo.params[0].kind == "topic_select"
	assert "/fix" in (echo.params[0].allowed_values or [])
	assert "/revolt/sim/stc/position/hull" not in (echo.params[0].allowed_values or [])


async def test_describe_commands_text_params_have_no_allowed_values() -> None:
	bridge = FakeBridge(target="physical")
	metas = await ros_command_service.describe_commands(bridge)
	node_details = next(m for m in metas if m.command_id == "node_details")
	assert node_details.params[0].kind == "text"
	assert node_details.params[0].allowed_values is None


async def test_describe_commands_resolves_param_select_allowed_values_from_get_param_names() -> (
	None
):
	bridge = FakeBridge(
		service_responses={
			"/rosapi/get_param_names": ServiceCallResult(
				ok=True,
				values={"names": ["/waypoint_switcher_node:default_switch_radius"]},
				error=None,
			)
		}
	)
	metas = await ros_command_service.describe_commands(bridge)
	get_param = next(m for m in metas if m.command_id == "get_param")
	assert get_param.params[0].kind == "param_select"
	assert get_param.params[0].allowed_values == ["/waypoint_switcher_node:default_switch_radius"]
	assert bridge.calls == [("/rosapi/get_param_names", "rosapi_msgs/GetParamNames", {})]


async def test_describe_commands_param_select_allowed_values_empty_on_failed_call() -> None:
	# A disconnected/timed-out bridge shouldn't fail the whole registry fetch -- just resolve to
	# an empty (rather than missing) dropdown for that one param.
	bridge = FakeBridge(
		service_responses={
			"/rosapi/get_param_names": ServiceCallResult(
				ok=False, values=None, error="not_connected"
			)
		}
	)
	metas = await ros_command_service.describe_commands(bridge)
	get_param = next(m for m in metas if m.command_id == "get_param")
	assert get_param.params[0].allowed_values == []


async def test_get_param_names_calls_the_right_rosapi_service() -> None:
	bridge = FakeBridge(
		service_responses={
			"/rosapi/get_param_names": ServiceCallResult(
				ok=True, values={"names": ["/some_node:some_param"]}, error=None
			)
		}
	)
	result, _ = await _execute(bridge, "get_param_names", {})
	assert result.ok is True
	assert result.result == {"names": ["/some_node:some_param"]}
	assert bridge.calls == [("/rosapi/get_param_names", "rosapi_msgs/GetParamNames", {})]
