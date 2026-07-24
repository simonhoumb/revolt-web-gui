"""RequestLoggingMiddleware: logs every HTTP request with method, path, status, and duration."""

import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
	"""Logs every request's method, path, status, duration, and session_id."""

	async def dispatch(self, request: Request, call_next: object) -> Response:
		"""Time the request and log the result after call_next() completes it."""
		start = time.perf_counter()
		response: Response = await call_next(request)
		duration_ms = round((time.perf_counter() - start) * 1000, 1)

		logger.info(
			"http_request",
			method=request.method,
			path=request.url.path,
			status_code=response.status_code,
			duration_ms=duration_ms,
			session_id=request.headers.get("x-session-id"),
		)

		return response
