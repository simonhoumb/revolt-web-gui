from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RosCommandParamMeta(BaseModel):
	name: str
	label: str
	kind: Literal["topic_select", "text"]
	required: bool
	# Populated only for kind="topic_select", resolved server-side per the live bridge target
	# (see ros_command_service.describe_commands) so the frontend never keeps its own copy of
	# bridge/protocol.py's topic allow-lists.
	allowed_values: list[str] | None = None


class RosCommandMeta(BaseModel):
	command_id: str
	label: str
	description: str
	params: list[RosCommandParamMeta]


class RosCommandRequest(BaseModel):
	params: dict[str, str] = Field(default_factory=dict)


class RosCommandResult(BaseModel):
	command_id: str
	ok: bool
	# "not_connected" | "timed_out" | "service_call_failed" | "no_data_yet" | None
	error: str | None
	result: dict[str, Any] | None
	executed_at: datetime
