from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from revolt_api.bridge import RosBridgeClient
from revolt_api.config import settings
from revolt_api.database import engine
from revolt_api.logging_config import configure_logging
from revolt_api.middleware import RequestLoggingMiddleware
from revolt_api.routers.health import router as health_router
from revolt_api.routers.ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
	configure_logging(settings.log_level)
	bridge = RosBridgeClient(
		settings.ros2_bridge_url,
		settings.bridge_target,
		gnss_origin_lat=settings.sim_gnss_origin_lat,
		gnss_origin_lon=settings.sim_gnss_origin_lon,
	)
	app.state.bridge = bridge
	await bridge.start()
	yield
	await bridge.stop()
	await engine.dispose()


app = FastAPI(title="ReVolt API", lifespan=lifespan)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
	CORSMiddleware,
	allow_origins=settings.allowed_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(ws_router)
