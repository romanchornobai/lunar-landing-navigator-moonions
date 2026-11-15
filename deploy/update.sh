#!/bin/sh
# Pull the latest main from GitHub and rebuild / restart the containers.
set -e
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
