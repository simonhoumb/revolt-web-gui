from fastapi import APIRouter

from revolt_api.config import settings

router = APIRouter()


@router.get("/api/health")
async def health() -> dict[str, str]:
	return {"status": "ok", "environment": settings.environment}
