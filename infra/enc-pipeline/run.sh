#!/usr/bin/env bash
# Builds and runs the ENC-to-vector-tiles pipeline. See README.md for details.
#
# Usage:
#   ENC_SOURCE_DIR=/path/to/DNV/delivery ./infra/enc-pipeline/run.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${ENC_SOURCE_DIR:-}" ]; then
	echo "ENC_SOURCE_DIR is not set. Point it at the ENC delivery root (the" >&2
	echo "folder containing NO4G0821/, NO5G0821/, etc.) and re-run:" >&2
	echo "  ENC_SOURCE_DIR=/path/to/DNV/delivery $0" >&2
	exit 1
fi

# Pre-create .data as the invoking user -- otherwise Docker creates it (owned
# by root) on first bind mount, and --user below then can't write into it.
mkdir -p "$SCRIPT_DIR/.data"

docker build -t revolt-enc-pipeline "$SCRIPT_DIR"
docker run --rm \
	--user "$(id -u):$(id -g)" \
	-v "$ENC_SOURCE_DIR:/source:ro" \
	-v "$SCRIPT_DIR/.data:/data" \
	revolt-enc-pipeline
