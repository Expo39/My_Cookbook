#!/bin/sh
# Runs the recipe checklist in the dev container. Pass recipe files or folders; none checks everything.
set -eu
cd "$(dirname "$0")/../../../.."
exec docker compose run --rm -T dev cargo run --quiet -p cookbook-cli -- check "$@"
