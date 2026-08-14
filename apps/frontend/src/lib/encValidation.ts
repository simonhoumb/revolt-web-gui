import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from "maplibre-gl";
import type { HazardSummary } from "@revolt/shared-types";
import type { LegPositions } from "./geo.js";

// "lndare" (land area) was missing here from the start; the check only inferred hazard from
// depare/resare/obstrn/uwtroc, so a waypoint on land was never detected. Confirmed by testing an
// unambiguous inland point across zoom 8-14: the pre-fix check reported "safe" every time.
const HAZARD_LAYERS = ["depare", "resare", "obstrn", "uwtroc", "lndare"];

// Chart coverage extent (S-57 M_COVR, CATCOV=1 available / CATCOV=2 no coverage), queried
// separately from the hazard layers above: "no hazard found nearby" and "no chart data exists
// here at all" are very different facts, conflating them would report unsurveyed water as
// confidently "safe". Never painted in the MapLibre style, just present in the tileset so
// queryRenderedFeatures() can see it (a zero-opacity fill layer is still queryable).
const COVERAGE_LAYER = "m_covr";

// Web Mercator meters-per-pixel at zoom 0, latitude 0 (Earth's circumference / 256px tile width);
// the standard constant for converting a real-world distance into an on-screen pixel size that
// scales correctly with zoom (pixel density doubles every zoom level, and shrinks with cos(lat)).
const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;

// Real-world half-width (m) of the safety corridor checked/shown around each leg: a small, fixed
// margin appropriate for a vessel this size, not a mariner-configurable XTD/beam setting (see
// SAFETY_CONTOUR_M's sibling comment in MapWidget.tsx). Exported so MapWidget's corridor
// visualization draws exactly the real-world band this check covers.
export const CORRIDOR_HALF_WIDTH_M = 15;

/**
 * Converts a real-world distance (m) to on-screen pixels at a given zoom/latitude. A fixed pixel
 * padding meant something different at every zoom level; this recomputes it from a real-world
 * distance instead, matching how a real ECDIS XTD corridor behaves.
 */
export function metersToPixels(meters: number, zoom: number, latitude: number): number {
	const metersPerPixel =
		(METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
	return meters / metersPerPixel;
}

interface DepareProperties {
	DRVAL1?: number;
}

interface CoverageProperties {
	CATCOV?: number;
}

function isCoverageFeature(feature: MapGeoJSONFeature): boolean {
	return (
		feature.layer.id === COVERAGE_LAYER &&
		(feature.properties as CoverageProperties | null)?.CATCOV === 1
	);
}

// Checked at each endpoint with its own small box, not the shared bbox spanning both endpoints
// used for the hazard layers below: a box spanning both can overlap the covered endpoint's own
// polygon even when the far endpoint is outside coverage, silently reporting the whole leg
// covered whenever just one end was.
function isCoveredAt(
	map: MapLibreMap,
	point: { x: number; y: number },
	paddingPx: number,
): boolean {
	// If the layer doesn't currently exist in the style (mid theme-transition, see the hazard-layer
	// comment below), skip the check rather than concluding "not covered": a missing layer means
	// "this evaluation finds nothing new", not a false negative.
	if (!map.getLayer(COVERAGE_LAYER)) return true;
	const box: [PointLike, PointLike] = [
		[point.x - paddingPx, point.y - paddingPx],
		[point.x + paddingPx, point.y + paddingPx],
	];
	const features = map.queryRenderedFeatures(box, { layers: [COVERAGE_LAYER] });
	return features.some(isCoverageFeature);
}

function isDepareHazard(feature: MapGeoJSONFeature, safetyContourM: number): string | null {
	const drval1 = (feature.properties as DepareProperties | null)?.DRVAL1;
	if (typeof drval1 === "number" && drval1 < safetyContourM) {
		return `Leg crosses charted depth below the ${String(safetyContourM)} m safety contour (DRVAL1=${String(drval1)} m).`;
	}
	return null;
}

const RESTRICTED_LAYER_DESCRIPTIONS: Record<string, string> = {
	resare: "Leg passes through a charted restricted area.",
	obstrn: "Leg passes near a charted obstruction.",
	uwtroc: "Leg passes near a charted underwater rock.",
	lndare: "Leg crosses charted land.",
};

function evaluateLeg(map: MapLibreMap, leg: LegPositions, safetyContourM: number): HazardSummary {
	const p1 = map.project([leg.from.lon, leg.from.lat]);
	const p2 = map.project([leg.to.lon, leg.to.lat]);
	const avgLat = (leg.from.lat + leg.to.lat) / 2;
	const paddingPx = metersToPixels(CORRIDOR_HALF_WIDTH_M, map.getZoom(), avgLat);
	const bbox: [PointLike, PointLike] = [
		[Math.min(p1.x, p2.x) - paddingPx, Math.min(p1.y, p2.y) - paddingPx],
		[Math.max(p1.x, p2.x) + paddingPx, Math.max(p1.y, p2.y) + paddingPx],
	];

	// queryRenderedFeatures throws (not just "no results") if a named layer doesn't currently exist
	// in the style, which briefly happens mid-transition (setStyle()'s day/dusk swap synchronously
	// clears every layer until "style.load" reloads it). Filtering to layers that actually exist
	// degrades gracefully instead of throwing if a recompute lands in that window.
	const availableHazardLayers = HAZARD_LAYERS.filter((id) => map.getLayer(id));
	const features = map.queryRenderedFeatures(bbox, { layers: availableHazardLayers });

	for (const feature of features) {
		const description = RESTRICTED_LAYER_DESCRIPTIONS[feature.layer.id];
		if (description) {
			return { status: "blocked", description };
		}
	}
	// A bounding-box existence check per endpoint, not the true containment check Phase 2's
	// ST_Covers does server-side; consistent with every other check here being an approximation
	// of what's currently rendered, not authoritative. Still approximate even per-endpoint: a
	// coverage gap in the middle of a long leg with both endpoints covered would slip through;
	// Phase 2 catches that at send time regardless.
	if (!isCoveredAt(map, p1, paddingPx) || !isCoveredAt(map, p2, paddingPx)) {
		return {
			status: "no_data",
			description: "No charted ENC data covers this leg; not verified safe, just unchecked.",
		};
	}
	for (const feature of features) {
		if (feature.layer.id === "depare") {
			const warning = isDepareHazard(feature, safetyContourM);
			if (warning) return { status: "warning", description: warning };
		}
	}
	return { status: "safe", description: "No charted hazards near this leg." };
}

/**
 * Client-side ENC hazard check (Phase 1) against the already-rendered depare/resare/obstrn/uwtroc/
 * lndare vector tile layers, plus m_covr for chart coverage extent. Advisory only: only sees
 * what's currently rendered at the current zoom, with tile-simplified geometry. The authoritative
 * server-side PostGIS check is Phase 2.
 */
export function evaluateEncHazards(
	map: MapLibreMap,
	legs: LegPositions[],
	safetyContourM: number,
): Record<string, HazardSummary> {
	const result: Record<string, HazardSummary> = {};
	for (const leg of legs) {
		result[leg.toId] = evaluateLeg(map, leg, safetyContourM);
	}
	return result;
}
