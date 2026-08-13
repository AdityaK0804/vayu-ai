"""Ingestor + live-stack settings (env-based, no secrets in code)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql://vayu:vayu_dev_change_me@127.0.0.1:5432/vayu",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://127.0.0.1:6379/0", alias="REDIS_URL")

    openaq_api_key: str | None = Field(default=None, alias="OPENAQ_API_KEY")
    openaq_base: str = Field(default="https://api.openaq.org", alias="OPENAQ_BASE")
    nasa_firms_map_key: str | None = Field(default=None, alias="NASA_FIRMS_MAP_KEY")
    open_meteo_base: str = Field(
        default="https://api.open-meteo.com",
        alias="OPEN_METEO_BASE",
    )
    open_meteo_air_quality_base: str = Field(
        default="https://air-quality-api.open-meteo.com",
        alias="OPEN_METEO_AQ_BASE",
    )

    # Chhattisgarh-ish bbox (W,S,E,N)
    bbox_west: float = 80.2
    bbox_south: float = 17.8
    bbox_east: float = 84.5
    bbox_north: float = 24.2

    # schedules (seconds) — overridable for demos
    interval_stations_s: int = 30 * 60
    interval_meteo_s: int = 60 * 60
    interval_fires_s: int = 3 * 60 * 60
    interval_cams_s: int = 24 * 60 * 60

    redis_ttl_snapshot_s: int = 2 * 60 * 60
    http_timeout_s: float = 45.0
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # seed cities for meteo / AQ pulls (id, lat, lon)
    seed_cities: list[tuple[str, float, float]] = [
        ("korba", 22.3595, 82.7501),
        ("raipur", 21.2514, 81.6296),
        ("bhilai", 21.1938, 81.3509),
        ("bilaspur", 22.0796, 82.1391),
        ("jagdalpur", 19.0748, 82.0080),
        ("ambikapur", 23.1200, 83.2000),
        ("durg", 21.1900, 81.2800),
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
