-- Project Vayu / AirSight — TimescaleDB bootstrap (Phase 4.1)
-- Mounted at first container init: /docker-entrypoint-initdb.d/01_init.sql
--
-- Design
--   • station_readings  — sparse official / OpenAQ point observations (raw, 90d)
--   • hex_forecasts     — multi-horizon PM2.5 forecasts keyed by H3 + issue time
--   • fire_events       — FIRMS (and future) hotspots with FRP
--   • Continuous aggregate: hourly mean PM2.5 per station (keeps dashboards cheap)
--   • Compression after 7d; retention 90d on raw hypertables

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ---------------------------------------------------------------------------
-- station_readings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS station_readings (
    ts              TIMESTAMPTZ       NOT NULL,
    station_id      TEXT              NOT NULL,
    city_id         TEXT,
    source          TEXT              NOT NULL DEFAULT 'unknown', -- openaq | cpcb | iot | virtual
    pm25            DOUBLE PRECISION,
    pm10            DOUBLE PRECISION,
    no2             DOUBLE PRECISION,
    so2             DOUBLE PRECISION,
    o3              DOUBLE PRECISION,
    co              DOUBLE PRECISION,
    aqi             DOUBLE PRECISION,
    aqi_basis       TEXT,             -- cpcb | us | model
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    quality_flag    SMALLINT          NOT NULL DEFAULT 0, -- 0=ok, 1=suspect, 2=invalid
    ingested_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ts, station_id, source)
);

SELECT create_hypertable(
    'station_readings',
    by_range('ts'),
    if_not_exists => TRUE,
    migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS ix_station_readings_station_ts
    ON station_readings (station_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_station_readings_city_ts
    ON station_readings (city_id, ts DESC)
    WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_station_readings_source_ts
    ON station_readings (source, ts DESC);

ALTER TABLE station_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'station_id, source',
    timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('station_readings', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('station_readings', INTERVAL '90 days', if_not_exists => TRUE);

-- Hourly rollups for fast dashboards / drift jobs
CREATE MATERIALIZED VIEW IF NOT EXISTS station_readings_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 hour', ts) AS bucket,
    station_id,
    city_id,
    source,
    AVG(pm25)  AS pm25_avg,
    MIN(pm25)  AS pm25_min,
    MAX(pm25)  AS pm25_max,
    AVG(pm10)  AS pm10_avg,
    AVG(aqi)   AS aqi_avg,
    COUNT(*)   AS n_obs
FROM station_readings
WHERE quality_flag = 0
GROUP BY 1, 2, 3, 4
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'station_readings_hourly',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes',
    if_not_exists   => TRUE
);

-- Keep hourly aggs longer than raw (1 year)
SELECT add_retention_policy(
    'station_readings_hourly',
    INTERVAL '365 days',
    if_not_exists => TRUE
);

-- ---------------------------------------------------------------------------
-- hex_forecasts  (issued_at = model run time; horizon_h = lead time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hex_forecasts (
    issued_at       TIMESTAMPTZ       NOT NULL,
    valid_at        TIMESTAMPTZ       NOT NULL, -- issued_at + horizon
    horizon_h       INTEGER           NOT NULL CHECK (horizon_h >= 0 AND horizon_h <= 168),
    h3_cell         TEXT              NOT NULL,
    city_id         TEXT,
    model_version   TEXT              NOT NULL DEFAULT 'unknown',
    pm25_pred       DOUBLE PRECISION  NOT NULL,
    pm25_lo         DOUBLE PRECISION, -- conformal / quantile lower
    pm25_hi         DOUBLE PRECISION,
    residual_bias   DOUBLE PRECISION, -- live calibration offset applied
    ensemble_w_stgnn DOUBLE PRECISION,
    ensemble_w_boost DOUBLE PRECISION,
    meta            JSONB,
    PRIMARY KEY (issued_at, h3_cell, horizon_h, model_version)
);

SELECT create_hypertable(
    'hex_forecasts',
    by_range('issued_at'),
    if_not_exists => TRUE,
    migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS ix_hex_forecasts_cell_valid
    ON hex_forecasts (h3_cell, valid_at DESC);
CREATE INDEX IF NOT EXISTS ix_hex_forecasts_city_issued
    ON hex_forecasts (city_id, issued_at DESC)
    WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_hex_forecasts_model
    ON hex_forecasts (model_version, issued_at DESC);

ALTER TABLE hex_forecasts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'h3_cell, model_version',
    timescaledb.compress_orderby = 'issued_at DESC'
);

SELECT add_compression_policy('hex_forecasts', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('hex_forecasts', INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------------
-- fire_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fire_events (
    ts              TIMESTAMPTZ       NOT NULL,
    lat             DOUBLE PRECISION  NOT NULL,
    lon             DOUBLE PRECISION  NOT NULL,
    frp             DOUBLE PRECISION,
    confidence      DOUBLE PRECISION,
    bright_ti4      DOUBLE PRECISION,
    source          TEXT              NOT NULL DEFAULT 'firms',
    h3_cell         TEXT,
    city_id         TEXT,
    raw             JSONB,
    PRIMARY KEY (ts, lat, lon, source)
);

SELECT create_hypertable(
    'fire_events',
    by_range('ts'),
    if_not_exists => TRUE,
    migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS ix_fire_events_h3_ts
    ON fire_events (h3_cell, ts DESC)
    WHERE h3_cell IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fire_events_city_ts
    ON fire_events (city_id, ts DESC)
    WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fire_events_frp
    ON fire_events (ts DESC, frp DESC NULLS LAST);

ALTER TABLE fire_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source',
    timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('fire_events', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('fire_events', INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------------
-- ingest_runs (ops / observability for the future ingestor service)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_runs (
    id              BIGSERIAL PRIMARY KEY,
    source          TEXT              NOT NULL,
    started_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    status          TEXT              NOT NULL DEFAULT 'running', -- running|ok|degraded|error
    rows_written    INTEGER           NOT NULL DEFAULT 0,
    detail          TEXT,
    meta            JSONB
);

CREATE INDEX IF NOT EXISTS ix_ingest_runs_source_started
    ON ingest_runs (source, started_at DESC);

-- ---------------------------------------------------------------------------
-- Convenience view: latest reading per station (not a continuous agg)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW station_latest AS
SELECT DISTINCT ON (station_id, source)
    ts, station_id, city_id, source, pm25, pm10, no2, aqi, aqi_basis, lat, lon, quality_flag
FROM station_readings
WHERE quality_flag = 0
ORDER BY station_id, source, ts DESC;

COMMENT ON TABLE station_readings IS 'Live/historical station observations (OpenAQ, CPCB, IoT, virtual)';
COMMENT ON TABLE hex_forecasts IS 'Multi-horizon H3 PM2.5 forecasts with optional conformal bands';
COMMENT ON TABLE fire_events IS 'FIRMS and related fire hotspot detections';
COMMENT ON MATERIALIZED VIEW station_readings_hourly IS 'Hourly continuous aggregate of station PM/AQI';

-- ---------------------------------------------------------------------------
-- alert_events (Phase 5.4 threshold pipeline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_events (
    id              BIGSERIAL PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    city_id         TEXT,
    district        TEXT,
    station_id      TEXT,
    aqi             DOUBLE PRECISION,
    pm25            DOUBLE PRECISION,
    severity        TEXT NOT NULL DEFAULT 'warning',
    title           TEXT NOT NULL,
    detail          TEXT,
    source          TEXT NOT NULL DEFAULT 'watcher',
    meta            JSONB
);
CREATE INDEX IF NOT EXISTS ix_alert_events_ts ON alert_events (ts DESC);
