"""Pydantic request/response schemas for the ROS2 command console."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RosCommandParamMeta(BaseModel):
	"""Describes one parameter a command accepts, resolved for the current registry response."""

	name: str
	label: str
	kind: Literal["topic_select", "param_select", "text"]
	required: bool
	# Populated for kind="topic_select" (bridge/protocol.py's topic allow-list for the live
	# target) and kind="param_select" (a live /rosapi/get_param_names call), both resolved
	# server-side (see ros_command_service.describe_commands) so the frontend never keeps its own
	# copy of either list.
	allowed_values: list[str] | None = None


class RosCommandMeta(BaseModel):
	"""Response body entry for GET /api/ros-commands: one command's UI metadata."""

	command_id: str
	label: str
	description: str
	params: list[RosCommandParamMeta]


class RosCommandRequest(BaseModel):
	"""Request body for POST /api/ros-commands/{command_id}."""

	params: dict[str, str] = Field(default_factory=dict)


class RosCommandResult(BaseModel):
	"""Response body for a command execution."""

	command_id: str
	ok: bool
	# "not_connected" | "timed_out" | "service_call_failed" | "no_data_yet" | None
	error: str | None
	result: dict[str, Any] | None
	executed_at: datetime
