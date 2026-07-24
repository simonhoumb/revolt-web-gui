"""Re-exports RosBridgeClient and the FastAPI dependency used to access it from a request."""

from starlette.requests import HTTPConnection

from revolt_api.bridge.client import RosBridgeClient


def get_bridge(conn: HTTPConnection) -> RosBridgeClient:
	"""FastAPI dependency returning the app-lifetime RosBridgeClient singleton."""
	return conn.app.state.bridge


__all__ = ["RosBridgeClient", "get_bridge"]
