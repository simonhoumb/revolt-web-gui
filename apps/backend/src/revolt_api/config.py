from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf-8",
		case_sensitive=False,
	)

	# Database
	database_url: str = "postgresql+asyncpg://revolt:changeme@db:5432/revolt_dev"
	secret_key: str = "dev-insecure-change-in-prod"
	environment: str = "development"

	# Logging
	log_level: str = "INFO"

	# Vessel connection — resolved via Tailscale sidecar in Docker
	vessel_host: str = "revolt-onboard"
	ros2_bridge_port: int = 9090

	# "physical" = hardware topics from the real vessel; "simulation" = pygemini/STC topics
	bridge_target: Literal["physical", "simulation"] = "physical"

	# Reference origin for converting sim local Cartesian (m) to WGS84 for map display.
	# X=East, Y=North convention. Set to the scenario's real-world anchor point.
	sim_gnss_origin_lat: float = 59.9083  # degrees, default: Bekkelaget, Oslo Fjord
	sim_gnss_origin_lon: float = 10.7512  # degrees

	@property
	def is_dev(self) -> bool:
		return self.environment == "development"

	@property
	def ros2_bridge_url(self) -> str:
		return f"ws://{self.vessel_host}:{self.ros2_bridge_port}"


settings = Settings()
