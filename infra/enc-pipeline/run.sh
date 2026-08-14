#!/usr/bin/env bash
#
# Builds and runs the ENC-to-vector-tiles pipeline.
#
# This script builds the Docker image for the pipeline and runs it against
# an ENC delivery. The input directory must contain the extracted ENC delivery
# root (for example, the directory containing NO4G0821/, NO5G0821/, etc.).
#
# A local `.data` directory is created to store pipeline outputs. The directory
# is created before starting the container so that it is owned by the invoking
# user instead of root.
#
# Environment:
#   ENC_SOURCE_DIR: Path to the extracted ENC delivery root.
#
# Usage:
#   ENC_SOURCE_DIR=/path/to/DNV/delivery ./infra/enc-pipeline/run.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${ENC_SOURCE_DIR:-}" ]]; then
  echo "ENC_SOURCE_DIR is not set." >&2
  echo "Set it to the ENC delivery root (the directory containing" >&2
  echo "NO4G0821/, NO5G0821/, etc.) and run the script again:" >&2
  echo "  ENC_SOURCE_DIR=/path/to/DNV/delivery $0" >&2
  exit 1
fi

# Create the output directory before mounting it into the container. Otherwise,
# Docker creates it as root on the first bind mount, preventing the container
# (running as the invoking user) from writing to it.
mkdir -p "${SCRIPT_DIR}/.data"

docker build -t revolt-enc-pipeline "${SCRIPT_DIR}"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${ENC_SOURCE_DIR}:/source:ro" \
  -v "${SCRIPT_DIR}/.data:/data" \
  revolt-enc-pipeline