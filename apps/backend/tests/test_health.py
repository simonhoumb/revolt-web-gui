from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
	response = await client.get("/api/health")
	assert response.status_code == 200
	data = response.json()
	assert data["status"] == "ok"
	assert "environment" in data
