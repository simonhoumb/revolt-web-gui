import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from "maplibre-gl";
import type { LegPositions } from "./geo.js";
import type { HazardSummary } from "../context/MissionContext.js";

// "lndare" (land area) was missing here from the start -- the check only ever inferred hazard
// from depare (water depth)/resare/obstrn/uwtroc presence, so a waypoint placed on land was never
// actually detected as such directly. Confirmed by direct testing (disabled camera lock, queried
// an unambiguous inland point across zoom 8-14): the pre-fix check reported "safe" at every zoom
// level, with zero exceptions -- not intermittent, just never checking land at all.
const HAZARD_LAYERS = ["depare", "resare", "obstrn", "uwtroc", "lndare"];

// Web Mercator meters-per-pixel at zoom 0, latitude 0 (Earth's circumference / 256px tile width) --
// the standard constant for converting a real-world distance into an on-screen pixel size that
// scales correctly with zoom (pixel density doubles every zoom level, and shrinks with cos(lat)).
const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;

// Real-world half-width (m) of the safety corridor checked/shown around each leg -- a small, fixed
// margin appropriate for a vessel this size, not a mariner-configurable XTD/beam setting (see
// SAFETY_CONTOUR_M's sibling comment in MapWidget.tsx for why that's out of scope for now).
// Exported so MapWidget's corridor visualization draws exactly the real-world band this check
// covers, rather than an unrelated fixed pixel width that would mean something different at every
// zoom level.
export const CORRIDOR_HALF_WIDTH_M = 15;

// Converts a real-world distance (m) to on-screen pixels at a given zoom/latitude. A fixed pixel
// padding meant something different at every zoom level (the actual area checked/shown shrank as
// you zoomed in) -- this recomputes it from a real-world distance instead, matching how a real
// ECDIS XTD corridor behaves.
export function metersToPixels(meters: number, zoom: number, latitude: number): number {
	const metersPerPixel =
		(METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
	return meters / metersPerPixel;
}

interface DepareProperties {
	DRVAL1?: number;
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
	// in the style -- which briefly happens mid-transition, since setStyle() (the day/dusk theme
	// swap) synchronously clears every style-defined layer, including these ENC ones, until
	// "style.load" finishes reloading the new style document. Filtering to layers that actually
	// exist right now degrades gracefully (this one evaluation just finds nothing new) instead of
	// throwing if a drag/hazard recompute happens to land in that window.
	const availableLayers = HAZARD_LAYERS.filter((id) => map.getLayer(id));
	const features = map.queryRenderedFeatures(bbox, { layers: availableLayers });

	for (const feature of features) {
		const description = RESTRICTED_LAYER_DESCRIPTIONS[feature.layer.id];
		if (description) {
			return { status: "blocked", description };
		}
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
 * lndare vector tile layers. Advisory only -- only sees what's currently rendered at the current
 * zoom, with tile-simplified geometry. The authoritative server-side PostGIS check is Phase 2.
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
