import asyncio
import json

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from revolt_api.bridge import RosBridgeClient, get_bridge

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.websocket("/api/ws")
async def vessel_ws(
	websocket: WebSocket,
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> None:
	await websocket.accept()
	session_id = websocket.headers.get("x-session-id", "unknown")
	logger.info("ws_client_connected", session_id=session_id)

	q = bridge.subscribe()
	try:
		while True:
			# Wait for the next bridge message; timeout keeps the task alive
			# between messages without blocking cancellation indefinitely.
			# Feature 7 replaces this with a proper ping/pong keepalive.
			try:
				msg = await asyncio.wait_for(q.get(), timeout=30.0)
				await websocket.send_text(json.dumps(msg))
			except TimeoutError:
				continue
	except WebSocketDisconnect:
		logger.info("ws_client_disconnected", session_id=session_id)
	except Exception:
		logger.exception("ws_client_error", session_id=session_id)
	finally:
		bridge.unsubscribe(q)
