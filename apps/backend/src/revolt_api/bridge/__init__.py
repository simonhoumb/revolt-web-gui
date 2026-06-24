from starlette.requests import HTTPConnection

from revolt_api.bridge.client import RosBridgeClient


def get_bridge(conn: HTTPConnection) -> RosBridgeClient:
	return conn.app.state.bridge


__all__ = ["RosBridgeClient", "get_bridge"]
