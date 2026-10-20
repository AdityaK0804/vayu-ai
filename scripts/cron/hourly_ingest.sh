#!/usr/bin/env sh
# Cron-ready hourly refresh (alternative to the docker-compose "ingest" worker).
#   7 * * * * cd /srv/vayu && ./scripts/cron/hourly_ingest.sh >> /var/log/vayu-ingest.log 2>&1
# Uses DATABASE_URL (Postgres) when set, else SQLite at VAYU_DB_PATH.
set -eu
cd "$(dirname "$0")/../.."
export PYTHONPATH="$PWD:$PWD/src${PYTHONPATH:+:$PYTHONPATH}"
exec "${PYTHON:-python}" -m airsight.live.jobs once "$@"
