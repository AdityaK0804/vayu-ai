# Vayu API + ingest worker (same image, different command).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app:/app/src
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-backend.txt .
RUN pip install -r requirements-backend.txt

COPY api ./api
COPY src ./src
COPY config ./config
COPY services ./services
COPY scripts/features_v2.py ./scripts/features_v2.py
# Trained model artefacts and static grids used at inference time.
COPY outputs ./outputs
COPY data/grid ./data/grid
COPY data/boundaries ./data/boundaries
COPY data/sources ./data/sources

RUN useradd --create-home --uid 10001 vayu && chown -R vayu /app
USER vayu

EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
