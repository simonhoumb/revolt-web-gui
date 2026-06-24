from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from revolt_api.config import settings
from revolt_api.database import engine
from revolt_api.logging_config import configure_logging
from revolt_api.middleware import RequestLoggingMiddleware
from revolt_api.routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
	configure_logging(settings.log_level)
	yield
	await engine.dispose()


app = FastAPI(title="ReVolt API", lifespan=lifespan)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:5173", "http://tailscale:8000"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

app.include_router(health_router)
