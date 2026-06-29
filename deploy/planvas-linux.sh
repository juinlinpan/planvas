#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE="${PLANVAS_IMAGE:-ghcr.io/juinlinpan/planvas:latest}"
BIND="${PLANVAS_BIND:-0.0.0.0}"
PORT="${PLANVAS_PORT:-18000}"
DATA_DIR="${PLANVAS_DATA_DIR:-/var/lib/planvas}"
RUNTIME_DIR="${PLANVAS_RUNTIME_DIR:-/var/log/planvas}"
INSTALL_DIR="${PLANVAS_INSTALL_DIR:-/opt/planvas}"
CONTAINER_NAME="${PLANVAS_CONTAINER_NAME:-planvas}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root, for example: curl -fsSL <url> | sudo bash" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine and rerun this script." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose is required. Install the Docker Compose plugin and rerun this script." >&2
  exit 1
fi

if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
fi

mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${RUNTIME_DIR}"

cat >"${INSTALL_DIR}/.env" <<EOF
PLANVAS_IMAGE=${IMAGE}
PLANVAS_BIND=${BIND}
PLANVAS_PORT=${PORT}
PLANVAS_DATA_DIR=${DATA_DIR}
PLANVAS_RUNTIME_DIR=${RUNTIME_DIR}
PLANVAS_CONTAINER_NAME=${CONTAINER_NAME}
EOF

cat >"${INSTALL_DIR}/docker-compose.yml" <<'EOF'
services:
  planvas:
    image: ${PLANVAS_IMAGE}
    container_name: ${PLANVAS_CONTAINER_NAME}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      WHITEBOARD_PLANVAS_ROOT: /data/planvas
      WHITEBOARD_BACKEND_ROOT: /data/runtime
      WHITEBOARD_FRONTEND_DIST: /app/frontend/dist
    ports:
      - "${PLANVAS_BIND}:${PLANVAS_PORT}:18000"
    volumes:
      - "${PLANVAS_DATA_DIR}:/data/planvas"
      - "${PLANVAS_RUNTIME_DIR}:/data/runtime"
EOF

(
  cd "${INSTALL_DIR}"
  "${COMPOSE[@]}" pull
  "${COMPOSE[@]}" up -d
)

for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
  if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
    if [[ "${BIND}" == "0.0.0.0" ]]; then
      echo "Planvas is running on port ${PORT}"
    else
      echo "Planvas is running at http://${BIND}:${PORT}"
    fi
    echo "Data directory: ${DATA_DIR}"
    exit 0
  fi
  sleep 2
done

echo "Planvas did not become healthy in time. Recent logs:" >&2
docker logs --tail 80 "${CONTAINER_NAME}" >&2 || true
exit 1
