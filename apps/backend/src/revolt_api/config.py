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

	@property
	def is_dev(self) -> bool:
		return self.environment == "development"

	@property
	def ros2_bridge_url(self) -> str:
		return f"ws://{self.vessel_host}:{self.ros2_bridge_port}"


settings = Settings()
