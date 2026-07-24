#!/usr/bin/env bash
#
# Runs the project's test suites.
#
# By default, this script runs the frontend test suite and the backend unit
# tests. Backend integration tests are excluded because they require a running
# PostgreSQL/PostGIS database, which is not available in CI by default.
#
# Coverage reporting can be enabled for either or both test suites.
#
# Usage:
#   ./test.sh
#   ./test.sh --frontend
#   ./test.sh --backend
#   ./test.sh --coverage
#   ./test.sh --integration
#
# Flags:
#   --frontend      Run only frontend tests.
#   --backend       Run only backend tests.
#   --coverage      Enable coverage reporting.
#   --integration   Run backend integration tests. Requires a running database
#                   and an initialized schema (for example:
#                   `docker compose up -d db && alembic upgrade head`).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE_DIR="${ROOT}/apps/frontend"
BE_DIR="${ROOT}/apps/backend"

RUN_FE=true
RUN_BE=true
COV=false
RUN_INTEGRATION=false

for arg in "$@"; do
  case "${arg}" in
    --frontend)    RUN_BE=false ;;
    --backend)     RUN_FE=false ;;
    --coverage)    COV=true ;;
    --integration) RUN_INTEGRATION=true ;;
    *)
      echo "Unknown argument: ${arg}"
      echo "Usage: $0 [--frontend] [--backend] [--coverage] [--integration]"
      exit 1
      ;;
  esac
done

PASS=0
FAIL=0

# Runs the frontend Vitest test suite.
run_frontend() {
  echo ""
  echo "=== Frontend (vitest) ==="

  local args="run"
  if ${COV}; then
    args="run --coverage"
  fi

  if (cd "${FE_DIR}" && pnpm vitest ${args}); then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

# Runs the backend unit test suite.
run_backend() {
  echo ""
  echo "=== Backend (pytest) ==="

  local args="--tb=short"
  if ${COV}; then
    args="--tb=short --cov=revolt_api --cov-report=term-missing"
  fi

  if (cd "${BE_DIR}" && PYTHONPATH="" uv run pytest ${args}); then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

# Runs the backend integration test suite.
run_backend_integration() {
  echo ""
  echo "=== Backend integration (pytest -m integration) ==="

  local args="--tb=short -m integration"
  if ${COV}; then
    args="--tb=short -m integration --cov=revolt_api --cov-report=term-missing"
  fi

  if (cd "${BE_DIR}" && PYTHONPATH="" uv run pytest ${args}); then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

${RUN_FE} && run_frontend
${RUN_BE} && run_backend
${RUN_BE} && ${RUN_INTEGRATION} && run_backend_integration

echo ""

if [[ "${FAIL}" -eq 0 ]]; then
  echo "All suites passed (${PASS}/$((PASS + FAIL)))"
else
  echo "${FAIL} suite(s) failed"
  exit 1
fi