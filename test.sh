#!/usr/bin/env bash
# Run the full test suite from the WebApp/ root.
#
# Usage:
#   ./test.sh                       # all tests (backend integration tests excluded, see below)
#   ./test.sh --coverage            # all tests with coverage
#   ./test.sh --frontend            # frontend only
#   ./test.sh --frontend --coverage # frontend only, with coverage
#   ./test.sh --backend             # backend only
#   ./test.sh --backend --coverage  # backend only, with coverage
#   ./test.sh --integration         # also run backend tests marked "integration" (real
#                                    # Postgres/PostGIS round-trips) -- excluded from the plain
#                                    # runs above because CI has no Postgres service. Requires
#                                    # `docker compose up -d db && alembic upgrade head` first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE_DIR="$ROOT/apps/frontend"
BE_DIR="$ROOT/apps/backend"

RUN_FE=true
RUN_BE=true
COV=false
RUN_INTEGRATION=false

for arg in "$@"; do
	case "$arg" in
		--frontend)    RUN_BE=false ;;
		--backend)     RUN_FE=false ;;
		--coverage)    COV=true ;;
		--integration) RUN_INTEGRATION=true ;;
		*)
			echo "Unknown argument: $arg"
			echo "Usage: $0 [--frontend] [--backend] [--coverage] [--integration]"
			exit 1
			;;
	esac
done

PASS=0
FAIL=0

run_frontend() {
	echo ""
	echo "=== Frontend (vitest) ==="
	local args="run"
	if $COV; then
		args="run --coverage"
	fi
	if (cd "$FE_DIR" && pnpm vitest $args); then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
	fi
}

run_backend() {
	echo ""
	echo "=== Backend (pytest) ==="
	local args="--tb=short"
	if $COV; then
		args="--tb=short --cov=revolt_api --cov-report=term-missing"
	fi
	if (cd "$BE_DIR" && PYTHONPATH="" uv run pytest $args); then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
	fi
}

run_backend_integration() {
	echo ""
	echo "=== Backend integration (pytest -m integration) ==="
	local args="--tb=short -m integration"
	if $COV; then
		args="--tb=short -m integration --cov=revolt_api --cov-report=term-missing"
	fi
	if (cd "$BE_DIR" && PYTHONPATH="" uv run pytest $args); then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
	fi
}

$RUN_FE && run_frontend
$RUN_BE && run_backend
$RUN_BE && $RUN_INTEGRATION && run_backend_integration

echo ""
if [ "$FAIL" -eq 0 ]; then
	echo "All suites passed ($PASS/$((PASS + FAIL)))"
else
	echo "$FAIL suite(s) failed"
	exit 1
fi
