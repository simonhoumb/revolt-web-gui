"""Phase 2 (server-side, authoritative) ENC hazard validation.

Companion to apps/frontend/src/lib/encValidation.ts's Phase 1 client-side check: same five hazard
layers (HAZARD_LAYERS there, _BLOCKED_LAYERS + "depare" here), same safety_contour_m depth
threshold, but queries the enc_* PostGIS tables (infra/enc-pipeline/ingest_postgis.sh) directly
instead of whatever happens to be rendered in the browser's current viewport/zoom -- see
WebApp/CLAUDE.md's ENC validation section for why that distinction matters.

The route geometry checked is the vessel's actual path (straight legs joined by turn-radius arcs,
geo.py's build_route_points), not a naive straight-line-through-every-waypoint polyline, so this
agrees with what MapWidget draws rather than being a cruder approximation of it.
"""

from collections.abc import Sequence
from typing import Literal

from geoalchemy2.shape import to_shape
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from revolt_api.geo import RouteWaypoint, build_route_points
from revolt_api.models.mission import Waypoint

ValidationStatus = Literal["safe", "warning", "blocked"]

# Layers that always block a route outright if the buffered path comes within safety_margin_m --
# matches encValidation.ts's RESTRICTED_LAYER_DESCRIPTIONS exactly (must never disagree with
# Phase 1 about what counts as a hazard).
_BLOCKED_LAYER_DESCRIPTIONS: dict[str, str] = {
	"resare": "Route passes through a charted restricted area.",
	"obstrn": "Route passes near a charted obstruction.",
	"uwtroc": "Route passes near a charted underwater rock.",
	"lndare": "Route crosses charted land.",
}
_DEPTH_LAYER = "depare"


class HazardHit(BaseModel):
	layer: str
	description: str
	count: int


class ValidationResult(BaseModel):
	status: ValidationStatus
	hazards: list[HazardHit]


def _route_linestring_wkt(waypoints: Sequence[Waypoint]) -> str | None:
	route_waypoints: list[RouteWaypoint] = []
	for wp in waypoints:
		point = to_shape(wp.position)
		route_waypoints.append(RouteWaypoint(lat=point.y, lon=point.x, switch_radius=wp.switch_radius))
	points = build_route_points(route_waypoints)
	if len(points) < 2:
		return None
	# WKT is (x y) = (lon lat), the opposite order from how we store/pass lat/lon everywhere else.
	coords = ", ".join(f"{lon} {lat}" for lat, lon in points)
	return f"LINESTRING({coords})"


async def _count_nearby(
	db: AsyncSession,
	table: str,
	route_wkt: str,
	margin_m: float,
	max_depth_m: float | None = None,
) -> int:
	# table is one of the fixed literals in _BLOCKED_LAYER_DESCRIPTIONS/_DEPTH_LAYER above, never
	# user input, so this f-string can't be used for SQL injection despite not being a bind param.
	# Everything that IS a runtime value (margin_m, max_depth_m, route_wkt) goes through a bind
	# parameter regardless of how it's sourced.
	depth_clause = "drval1 < :max_depth_m AND " if max_depth_m is not None else ""
	params: dict[str, object] = {"route_wkt": route_wkt, "margin_m": margin_m}
	if max_depth_m is not None:
		params["max_depth_m"] = max_depth_m
	result = await db.execute(
		text(
			f"SELECT count(*) FROM {table} "
			f"WHERE {depth_clause}"
			"ST_DWithin(geom::geography, ST_GeomFromText(:route_wkt, 4326)::geography, :margin_m)"
		),
		params,
	)
	return result.scalar_one()


async def evaluate_route_hazards(
	db: AsyncSession,
	waypoints: Sequence[Waypoint],
	safety_margin_m: float,
	safety_contour_m: float,
) -> ValidationResult:
	route_wkt = _route_linestring_wkt(waypoints)
	if route_wkt is None:
		return ValidationResult(status="safe", hazards=[])

	hazards: list[HazardHit] = []
	for layer, description in _BLOCKED_LAYER_DESCRIPTIONS.items():
		count = await _count_nearby(db, f"enc_{layer}", route_wkt, safety_margin_m)
		if count > 0:
			hazards.append(HazardHit(layer=layer, description=description, count=count))

	if hazards:
		return ValidationResult(status="blocked", hazards=hazards)

	depth_count = await _count_nearby(
		db,
		f"enc_{_DEPTH_LAYER}",
		route_wkt,
		safety_margin_m,
		max_depth_m=safety_contour_m,
	)
	if depth_count > 0:
		hazards.append(
			HazardHit(
				layer=_DEPTH_LAYER,
				description=(
					f"Route crosses charted depth below the {safety_contour_m} m safety contour."
				),
				count=depth_count,
			)
		)
		return ValidationResult(status="warning", hazards=hazards)

	return ValidationResult(status="safe", hazards=[])
