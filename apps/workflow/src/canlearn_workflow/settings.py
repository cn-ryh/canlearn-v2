from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "canlearn-workflows"
    api_internal_url: str = "http://localhost:3001/v1"
    mineru_base_url: str = "http://localhost:8000"


settings = Settings()
