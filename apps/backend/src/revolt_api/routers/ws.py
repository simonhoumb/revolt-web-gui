import asyncio
import json
import time

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from revolt_api.bridge import RosBridgeClient, get_bridge
from revolt_api.bridge.contracts import PingMsg

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.websocket("/api/ws")
async def vessel_ws(
	websocket: WebSocket,
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> None:
	await websocket.accept()
	# Headers: apiFetch sets X-Session-ID, but native WebSocket doesn't allow custom headers.
	# The frontend hook sends it as ?session_id= query param instead.
	session_id = websocket.query_params.get("session_id") or websocket.headers.get(
		"x-session-id", "unknown"
	)
	logger.info("ws_client_connected", session_id=session_id)

	q = bridge.subscribe()
	try:
		while True:
			# If no bridge message arrives within 30 s, send a ping so the browser
			# can (a) keep the connection alive through proxies and (b) compute latency
			# by comparing server_ms to Date.now() on receipt.
			try:
				msg = await asyncio.wait_for(q.get(), timeout=30.0)
				await websocket.send_text(json.dumps(msg))
			except TimeoutError:
				ping: PingMsg = {"v": "1", "type": "ping", "server_ms": int(time.time() * 1000)}
				await websocket.send_text(json.dumps(ping))
	except WebSocketDisconnect:
		logger.info("ws_client_disconnected", session_id=session_id)
	except Exception:
		logger.exception("ws_client_error", session_id=session_id)
	finally:
		bridge.unsubscribe(q)
