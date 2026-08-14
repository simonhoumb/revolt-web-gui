"""ROS2 introspection command orchestration.

Extracted into its own service module rather than folded into mission_service.py: a different
command family (introspection over the ROS graph, not mission/waypoint orchestration) with its
own allow-list (bridge/commands.py's COMMANDS) and no shared state with missions. Follows the
same routers-stay-thin pattern: routers/ros_commands.py just delegates here.

v1 is introspection-only; nothing in COMMANDS can move the vessel, so there's no 409
conflict/state-machine check here the way mission_service.py's send/start/pause/terminate have.
The only rejections are 404 (unknown command) and 400 (invalid/disallowed param).
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from revolt_api.audit import log_action
from revolt_api.bridge import RosBridgeClient
from revolt_api.bridge.commands import COMMANDS, CommandKind, CommandSpec
from revolt_api.bridge.protocol import get_subscribe_topics
from revolt_api.schemas.ros_commands import RosCommandMeta, RosCommandParamMeta, RosCommandResult


@dataclass
class _Outcome:
	"""Result of executing one command, before wrapping into the RosCommandResult response."""

	ok: bool
	error: str | None
	result: dict[str, Any] | None


async def describe_commands(bridge: RosBridgeClient) -> list[RosCommandMeta]:
	"""Resolve each command's dynamic param allowed_values against the live bridge.

	topic_select values come from bridge/protocol.py's topic allow-list; param_select values
	from a live /rosapi/get_param_names call. Neither is cached client-side. A failed
	get_param_names call resolves to an empty list rather than failing the whole endpoint; the
	registry should still load with an empty/disabled parameter dropdown, not a 500, when the
	bridge is down.
	"""
	allowed_topics = [spec.topic for spec in get_subscribe_topics(bridge.target)]

	known_param_names: list[str] = []
	if any(param.kind == "param_select" for spec in COMMANDS.values() for param in spec.params):
		param_names_result = await bridge.call_service(
			"/rosapi/get_param_names", "rosapi_msgs/GetParamNames", {}
		)
		if param_names_result.ok:
			known_param_names = (param_names_result.values or {}).get("names", [])

	metas: list[RosCommandMeta] = []
	for spec in COMMANDS.values():
		params = [
			RosCommandParamMeta(
				name=param.name,
				label=param.label,
				kind=param.kind,
				required=param.required,
				allowed_values=(
					allowed_topics
					if param.kind == "topic_select"
					else known_param_names
					if param.kind == "param_select"
					else None
				),
			)
			for param in spec.params
		]
		metas.append(
			RosCommandMeta(
				command_id=spec.command_id,
				label=spec.label,
				description=spec.description,
				params=params,
			)
		)
	return metas


def _validate_static_params(
	spec: CommandSpec, params: dict[str, str], target: str
) -> dict[str, str]:
	"""Checks that don't require a live bridge round trip.

	Required-ness, and (for topic_select params) membership in bridge/protocol.py's existing
	topic allow-list, so allow-lists are curated in one place, not two. node_details' dynamic
	node-liveness check is handled separately in _execute_node_details, since a failure there is
	a bridge/transport outcome, not a plain bad request.
	"""
	validated: dict[str, str] = {}
	for param in spec.params:
		value = params.get(param.name)
		if not value:
			if param.required:
				raise HTTPException(400, detail=f"Missing required param: {param.name}")
			continue
		if param.kind == "topic_select":
			allowed = {t.topic for t in get_subscribe_topics(target)}
			if value not in allowed:
				raise HTTPException(
					400, detail=f"Topic is not allow-listed for target '{target}': {value}"
				)
		validated[param.name] = value
	return validated


def _execute_echo(bridge: RosBridgeClient, topic: str) -> _Outcome:
	cached = bridge.latest_raw_message(topic)
	if cached is None:
		return _Outcome(ok=False, error="no_data_yet", result=None)
	return _Outcome(
		ok=True,
		error=None,
		result={"topic": topic, "msg": cached.msg, "received_at_ms": cached.timestamp_ms},
	)


async def _execute_service_call(
	bridge: RosBridgeClient, spec: CommandSpec, validated: dict[str, str]
) -> _Outcome:
	args: dict[str, str] = dict(validated)
	if spec.command_id == "get_param":
		# rosapi_msgs/GetParam requires default_value in the request even when the caller has no
		# default in mind: an empty string, distinguishable from a real value via the response's
		# own "successful" field.
		args.setdefault("default_value", "")
	assert spec.rosapi_service is not None
	assert spec.rosapi_type is not None
	call_result = await bridge.call_service(
		spec.rosapi_service, spec.rosapi_type, args, timeout_s=spec.timeout_s
	)
	return _Outcome(ok=call_result.ok, error=call_result.error, result=call_result.values)


async def _execute_node_details(bridge: RosBridgeClient, node: str, timeout_s: float) -> _Outcome:
	"""node_details' target can't be statically allow-listed like a topic (nodes are dynamic).

	Re-queries /rosapi/nodes live and rejects (400) if the name isn't currently in the graph,
	same "must come from live enumeration, not free text" posture as the static topic case. A
	failure of the liveness probe itself (not connected, timed out) is a bridge outcome, not a
	bad request: it returns as a normal failed _Outcome, still audit-logged, not raised as 400.
	"""
	live = await bridge.call_service("/rosapi/nodes", "rosapi_msgs/Nodes", timeout_s=timeout_s)
	if not live.ok:
		return _Outcome(ok=False, error=live.error, result=None)
	live_nodes = (live.values or {}).get("nodes", [])
	if node not in live_nodes:
		raise HTTPException(400, detail=f"Node is not currently live: {node}")
	return await _execute_service_call(bridge, COMMANDS["node_details"], {"node": node})


async def execute_command(
	db: AsyncSession,
	bridge: RosBridgeClient,
	session_id: str,
	command_id: str,
	params: dict[str, str],
) -> RosCommandResult:
	"""Look up, validate, dispatch, and audit-log one command execution."""
	spec = COMMANDS.get(command_id)
	if spec is None:
		raise HTTPException(404, detail=f"Unknown command: {command_id}")

	validated = _validate_static_params(spec, params, bridge.target)

	if spec.kind is CommandKind.TOPIC_ECHO:
		outcome = _execute_echo(bridge, validated["topic"])
	elif command_id == "node_details":
		outcome = await _execute_node_details(bridge, validated["node"], spec.timeout_s)
	else:
		outcome = await _execute_service_call(bridge, spec, validated)

	executed_at = datetime.now(UTC)
	# Every execution logged, success or failure, per the backlog's "log all executions" line.
	# severity="info" uniformly: nothing in COMMANDS is destructive, unlike e.g.
	# mission_service.terminate_mission's "warning"; there is nothing here to warn about.
	await log_action(
		db,
		session_id=session_id,
		action=f"ros_command.{command_id}",
		params={"command_id": command_id, "params": params, "ok": outcome.ok},
	)
	return RosCommandResult(
		command_id=command_id,
		ok=outcome.ok,
		error=outcome.error,
		result=outcome.result,
		executed_at=executed_at,
	)
