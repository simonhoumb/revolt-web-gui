from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from revolt_api.bridge.client import RosBridgeClient
from revolt_api.main import app


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
	# health.py and other endpoints depend on get_bridge(), which reads app.state.bridge
	# set in the lifespan. The test client bypasses the lifespan, so inject a minimal mock.
	app.state.bridge = MagicMock(spec=RosBridgeClient)
	app.state.bridge.connected = False
	async with AsyncClient(
		transport=ASGITransport(app=app),
		base_url="http://test",
	) as ac:
		yield ac
