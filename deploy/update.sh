#!/usr/bin/env bash
# Bringt rechase auf eine Version und rollt bei Fehlschlag zurück.
# Aufruf in /opt/rechase:  ./update.sh [tag]   (ohne Tag: latest; Rollback von Hand: ./update.sh <alter-tag>)
# Die Action setzt vorher GHCR_USER und GHCR_TOKEN; das Token gilt nur während des Workflow-Laufs.
# Fasst nur den Compose-Stack "rechase" an, keine anderen Container, Images oder Netze.
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-latest}"
PREV="$(grep -E '^APP_TAG=' .env | cut -d= -f2- || true)"
set_tag() { sed -i "s/^APP_TAG=.*/APP_TAG=$1/" .env; }

# Registry-Login nur für diesen Lauf, damit kein Token auf dem Server liegen bleibt.
if [ -n "${GHCR_TOKEN:-}" ]; then
  DOCKER_CONFIG="$(mktemp -d)"
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER fehlt}" --password-stdin >/dev/null
fi

set_tag "$TAG"
docker compose pull --quiet app
docker compose up -d --no-build --remove-orphans

echo "Warte, bis rechase $TAG gesund ist ..."
for _ in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Health.Status}}' rechase-app 2>/dev/null || echo fehlt)"
  if [ "$status" = healthy ]; then
    echo "rechase $TAG läuft."
    # Alte Images aufräumen (am Label erkennbar); die der letzten 7 Tage bleiben für Rollbacks.
    docker image prune -af --filter "label=app.rechase.image=true" --filter "until=168h" >/dev/null || true
    exit 0
  fi
  sleep 3
done

echo "rechase $TAG wurde nicht gesund (Status: $status). Letzte Logzeilen:" >&2
docker logs --tail 50 rechase-app >&2 || true
echo "Rollback auf ${PREV:-latest}." >&2
set_tag "${PREV:-latest}"
docker compose up -d --no-build app
exit 1
