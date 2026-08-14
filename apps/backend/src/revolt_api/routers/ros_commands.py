"""GET/POST /api/ros-commands: the ROS2 command console's registry and execution endpoints."""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from revolt_api.bridge import RosBridgeClient, get_bridge
from revolt_api.database import get_db
from revolt_api.schemas.ros_commands import RosCommandMeta, RosCommandRequest, RosCommandResult
from revolt_api.services import ros_command_service

router = APIRouter(prefix="/api")


async def _session_id(x_session_id: str | None = Header(default=None)) -> str:
	return x_session_id or "unknown"


@router.get("/ros-commands", response_model=list[RosCommandMeta])
async def list_ros_commands(
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> list[RosCommandMeta]:
	"""The allow-listed introspection command registry.

	topic_select/param_select params' allowed values are resolved against the live bridge; see
	ros_command_service.describe_commands for the full rationale.
	"""
	return await ros_command_service.describe_commands(bridge)


@router.post("/ros-commands/{command_id}", response_model=RosCommandResult)
async def execute_ros_command(
	command_id: str,
	body: RosCommandRequest,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> RosCommandResult:
	"""Execute one allow-listed introspection command.

	See ros_command_service.execute_command for the full rationale.
	"""
	return await ros_command_service.execute_command(
		db, bridge, session_id, command_id, body.params
	)
