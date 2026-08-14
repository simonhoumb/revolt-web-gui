"""GET /api/health: liveness and bridge-connectivity check."""

from fastapi import APIRouter, Depends

from revolt_api.bridge import RosBridgeClient, get_bridge
from revolt_api.config import settings

router = APIRouter()


@router.get("/api/health")
async def health(bridge: RosBridgeClient = Depends(get_bridge)) -> dict[str, str | bool]:  # noqa: B008
	"""Basic liveness check, plus whether the backend currently has a live rosbridge connection."""
	return {
		"status": "ok",
		"environment": settings.environment,
		"bridge_connected": bridge.connected,
	}
