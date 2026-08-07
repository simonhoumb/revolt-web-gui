import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import { useEffect, useRef, type RefObject } from "react";
import { destinationPoint } from "../lib/geo.js";
import { resolveLightColorToken } from "../lib/chartStyle.js";
import { s52Color, type ChartPalette } from "../lib/s52Colors.js";

const SOURCE_ID = "light-sectors";
const RING_LAYER_ID = "light-sectors-ring";
const OUTLINE_LAYER_ID = "light-sectors-outline";
const BOUNDARY_LAYER_ID = "light-sectors-boundary";
const LIGHTS_LAYER_ID = "lights";

// Local structural types for the sector source's GeoJSON payload; avoids depending on
// @types/geojson's ambient global, which pnpm's isolated node_modules layout doesn't expose to
// this package (same reasoning as useVesselTrackLayer.ts's TrackFeature/TrackFeatureCollection).
interface RingFeature {
	type: "Feature";
	geometry: { type: "Polygon"; coordinates: [number, number][][] };
	properties: { kind: "ring"; color: string; outlineColor: string };
}

interface BoundaryFeature {
	type: "Feature";
	geometry: { type: "LineString"; coordinates: [number, number][] };
	properties: { kind: "boundary"; color: string };
}

type SectorFeature = RingFeature | BoundaryFeature;

interface SectorFeatureCollection {
	type: "FeatureCollection";
	features: SectorFeature[];
}

// Schematic radii in *screen pixels*, not real-world meters and not each light's real VALNMR nominal
// range (4-6.5nm in this chart) -- a fixed-meters ring was tried first and looked right only in a
// narrow zoom band (reads as a solid, boundary-less pie when zoomed in past where the fixed radius
// dwarfs the viewport, and shrinks to an invisible speck when zoomed out), confirmed by screenshotting
// the same real light at zoom 11/13/16. Real ECDIS light-sector graphics are schematic at every chart
// scale for the same reason, so pixel-constant sizing (converted to meters per render via
// metersPerPixel() below, the same way MapLibre's own tile pyramid scales) matches that behavior
// instead of literal geography.
const INNER_RADIUS_PX = 15;
const OUTER_RADIUS_PX = 17;
// Sector-limit boundary lines poke slightly past the ring's outer edge, matching how real ECDIS
// draws the limit line extending past the arc it delineates.
const BOUNDARY_RADIUS_PX = OUTER_RADIUS_PX * 2;

// Degrees between successive arc vertices; small enough that the ring's curved edges don't look
// visibly faceted at the zoom levels lights are shown at (minzoom 9, matching aidsToNavigationLayers).
const ARC_STEP_DEG = 3;

// Standard Web Mercator ground resolution formula (the same relationship that makes 256px tiles line
// up across zoom levels): meters spanned by one screen pixel at a given latitude and zoom.
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
function metersPerPixel(latDeg: number, zoom: number): number {
	return (EARTH_CIRCUMFERENCE_M * Math.cos((latDeg * Math.PI) / 180)) / (256 * 2 ** zoom);
}

function normalizeDeg(deg: number): number {
	return ((deg % 360) + 360) % 360;
}

// Confirmed against OpenCPN's actual rendering source (s52cnsy.cpp's LIGHTS05/06, which comments
// "Sectors are defined from seaward" right before an unconditional +-180 flip) and the S-57 attribute
// definition itself: SECTR1/SECTR2 are bearings as observed FROM SEAWARD LOOKING TOWARD the light --
// i.e. the bearing from an observer's position to the light, not from the light outward to the
// observer. Using the raw attribute value directly as a from-the-light bearing (this file's original
// implementation) draws every sector 180 degrees from where it actually is, reported as sectors
// "looking mirrored". Exported for direct unit testing of this specific fix.
export function toChartBearing(seawardBearing: number): number {
	return normalizeDeg(seawardBearing + 180);
}

// Sweeps clockwise from `start` to `end` at a single fixed radius, generating arc points at
// ARC_STEP_DEG spacing. Exported for direct unit testing of the wraparound/degenerate cases.
export function arcPoints(
	lat: number,
	lon: number,
	start: number,
	end: number,
	radiusM: number,
): [number, number][] {
	const sweep = normalizeDeg(end - start) || 360;
	const steps = Math.max(1, Math.ceil(sweep / ARC_STEP_DEG));
	const points: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const bearing = normalizeDeg(start + (sweep * i) / steps);
		const point = destinationPoint(lat, lon, bearing, radiusM);
		points.push([point.lon, point.lat]);
	}
	return points;
}

// A ring (annulus) segment: the outer arc from start->end, then the SAME angular span traced
// backward at the inner radius, closing the polygon without ever passing through the light's own
// position -- unlike a full pie wedge, this leaves the light's point symbol clear of the sector
// fill, matching real ECDIS. The inner arc must be built from the same (start, end) sweep as the
// outer arc, just reversed -- calling arcPoints(end, start, ...) instead (this function's original,
// buggy implementation) does NOT retrace the same short span backward: arcPoints always sweeps
// forward-clockwise from its own first argument, so swapping start/end computes the *complementary*
// arc (360 minus the intended sweep) rather than its reverse. For a narrow sector that produced a
// ~357-degree "inner arc" sweeping almost all the way around, which both explains a sector rendering
// as a near-full circle covering the light's own position (reported as "a red filled circle inside
// the ring") and was confirmed directly: a point-in-polygon check against the real S-57 sector data
// showed the light's own center point falsely inside every generated ring.
export function ringPolygon(
	lat: number,
	lon: number,
	start: number,
	end: number,
	innerRadiusM: number,
	outerRadiusM: number,
): [number, number][] {
	const outer = arcPoints(lat, lon, start, end, outerRadiusM);
	const inner = arcPoints(lat, lon, start, end, innerRadiusM).reverse();
	const first = outer[0];
	if (!first) return [];
	return [...outer, ...inner, first];
}

function parseColourCodes(raw: unknown): unknown {
	if (typeof raw !== "string") return raw;
	try {
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

// Builds one ring polygon plus two dashed boundary lines (at each sector limit bearing) per LIGHTS
// feature that carries sector data. Lights with no SECTR1/SECTR2 (roughly half of this chart's
// lights -- omnidirectional lights, which have no sector concept) are left alone; they keep showing
// only their existing point symbol. Boundary lines are deduped by position+bearing so two adjacent
// sectors sharing a limit don't draw the same dashed line twice.
function buildSectorFeatures(
	features: MapGeoJSONFeature[],
	palette: ChartPalette,
	zoom: number,
): SectorFeatureCollection {
	const seenLights = new Set<string>();
	const seenBoundaries = new Set<string>();
	const result: SectorFeature[] = [];
	const outlineColor = s52Color(palette, "chblk");

	for (const feature of features) {
		// MapGeoJSONFeature's own .geometry/.properties getters are typed via the ambient GeoJSON
		// namespace, which isn't resolvable in this package's isolated node_modules layout and
		// resolves to `any` -- cast once at this boundary to a known local shape. Queried features
		// aren't guaranteed to actually be well-formed Points (e.g. a caller-supplied
		// queryRenderedFeatures stub in a test, or a future layer sharing this same query), so this
		// stays defensive rather than assuming geometry is always present.
		const geometry = feature.geometry as
			| { type?: string; coordinates?: [number, number] }
			| undefined;
		if (geometry?.type !== "Point" || !geometry.coordinates) continue;
		const props = feature.properties as Record<string, unknown>;
		const rawSectr1 = props.SECTR1;
		const rawSectr2 = props.SECTR2;
		if (typeof rawSectr1 !== "number" || typeof rawSectr2 !== "number") continue;

		// LNAM uniquely identifies the S-57 feature; querying rendered features can return the same
		// light more than once (tile edge overlap, or a re-query before the previous set is cleared),
		// so dedupe on it rather than risk stacking identical rings on top of each other.
		const lnam = typeof props.LNAM === "string" ? props.LNAM : null;
		if (lnam) {
			if (seenLights.has(lnam)) continue;
			seenLights.add(lnam);
		}

		const [lon, lat] = geometry.coordinates;
		const start = toChartBearing(rawSectr1);
		const end = toChartBearing(rawSectr2);
		const colourToken = resolveLightColorToken(parseColourCodes(props.COLOUR));

		// Resolved per-feature (not once for the whole call) since metersPerPixel depends on the
		// feature's own latitude, not just the shared zoom -- negligible over this chart's small
		// operational area, but correct is free here.
		const mpp = metersPerPixel(lat, zoom);
		const innerRadiusM = INNER_RADIUS_PX * mpp;
		const outerRadiusM = OUTER_RADIUS_PX * mpp;
		const boundaryRadiusM = BOUNDARY_RADIUS_PX * mpp;

		const ring = ringPolygon(lat, lon, start, end, innerRadiusM, outerRadiusM);
		if (ring.length >= 4) {
			result.push({
				type: "Feature",
				geometry: { type: "Polygon", coordinates: [ring] },
				properties: { kind: "ring", color: s52Color(palette, colourToken), outlineColor },
			});
		}

		for (const bearing of [start, end]) {
			const key = `${lon.toFixed(5)},${lat.toFixed(5)},${bearing.toFixed(1)}`;
			if (seenBoundaries.has(key)) continue;
			seenBoundaries.add(key);
			const outer = destinationPoint(lat, lon, bearing, boundaryRadiusM);
			result.push({
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: [
						[lon, lat],
						[outer.lon, outer.lat],
					],
				},
				properties: { kind: "boundary", color: outlineColor },
			});
		}
	}
	return { type: "FeatureCollection", features: result };
}

/**
 * Renders real S-52 light sectors: a colored ring band radiating from each directional light's
 * position (one per charted SECTR1/SECTR2/COLOUR combination) with a black outline, plus dashed
 * boundary lines at each sector limit bearing -- matching how real ECDIS shows a mariner which
 * bearing ranges see red/green/white from a given light, and exactly where the color changes.
 * MapLibre has no declarative way to turn a point + a bearing pair into ring/arc geometry, so unlike
 * the rest of the chart style (pure vector-tile-driven expressions in chartStyle.ts) this hook
 * queries the already-rendered "lights" symbol layer and computes the geometry client-side, following
 * the same imperative source/layer pattern as useVesselTrackLayer.ts. Must be called after
 * useMapLibreInstance in the same component so mapRef.current and the "lights" layer it depends on
 * already exist.
 */
export function useLightSectors(
	mapRef: RefObject<MapLibreMap | null>,
	palette: ChartPalette,
): void {
	const paletteRef = useRef<ChartPalette>(palette);
	// GeoJSON source.setData() makes MapLibre reprocess/re-tile that source, which itself produces
	// another render pass and can re-fire "idle" once that settles -- calling setData() unconditionally
	// from an "idle" handler is therefore a self-sustaining loop (idle -> recompute -> setData -> idle
	// -> ...), confirmed live: it pegs the renderer at high CPU indefinitely. Skipping setData() when
	// the computed sector set hasn't actually changed since last time breaks the cycle once the map
	// settles, without needing to guess at a debounce delay.
	const lastKeyRef = useRef<string | null>(null);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const recompute = () => {
			if (!map.getLayer(LIGHTS_LAYER_ID)) return;
			const features = map.queryRenderedFeatures(undefined, { layers: [LIGHTS_LAYER_ID] });
			const collection = buildSectorFeatures(features, paletteRef.current, map.getZoom());
			const key = JSON.stringify(collection);
			if (key === lastKeyRef.current) return;
			lastKeyRef.current = key;
			const source = map.getSource<GeoJSONSource>(SOURCE_ID);
			source?.setData(collection);
		};

		const addSectorLayer = () => {
			lastKeyRef.current = null;
			map.addSource(SOURCE_ID, {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			});
			// Added in this order, all before the light's own point symbol, so the stacking (bottom to
			// top) reads: ring fill, ring outline, dashed sector-limit lines, light icon on top of all.
			map.addLayer(
				{
					id: RING_LAYER_ID,
					type: "fill",
					source: SOURCE_ID,
					filter: ["==", ["get", "kind"], "ring"],
					minzoom: 9,
					paint: { "fill-color": ["get", "color"], "fill-opacity": 1 },
				},
				LIGHTS_LAYER_ID,
			);
			map.addLayer(
				{
					id: OUTLINE_LAYER_ID,
					type: "line",
					source: SOURCE_ID,
					filter: ["==", ["get", "kind"], "ring"],
					minzoom: 9,
					paint: { "line-color": ["get", "outlineColor"], "line-width": 1 },
				},
				LIGHTS_LAYER_ID,
			);
			map.addLayer(
				{
					id: BOUNDARY_LAYER_ID,
					type: "line",
					source: SOURCE_ID,
					filter: ["==", ["get", "kind"], "boundary"],
					minzoom: 9,
					paint: {
						"line-color": ["get", "color"],
						"line-width": 1,
						"line-dasharray": [1, 2],
					},
				},
				LIGHTS_LAYER_ID,
			);
			recompute();
		};
		map.on("style.load", addSectorLayer);
		map.on("idle", recompute);

		return () => {
			map.off("style.load", addSectorLayer);
			map.off("idle", recompute);
		};
	}, [mapRef]);

	// A palette change makes useMapLibreInstance call setStyle(), which always re-fires "style.load"
	// (wiping and re-adding this hook's own source/layer) -- so, like useVesselTrackLayer.ts, updating
	// the ref here is enough; addSectorLayer's own recompute() picks up the new value on that re-fire
	// without a second, separately-timed recompute racing the setStyle() transition.
	useEffect(() => {
		paletteRef.current = palette;
	}, [palette]);
}
