import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type RefObject } from "react";
import { buildOsloFjordStyle, type SymbolStyle } from "../lib/chartStyle.js";
import type { ChartPalette } from "../lib/s52Colors.js";

// Centre of the DNV ENC delivery's actual coverage area (outer/southern
// Oslofjord around Horten, Tonsberg, Moss and Asgardstrand), not central
// Oslo city; see infra/enc-pipeline/README.md for the coverage caveat.
export const OSLO_FJORD_CENTER: [number, number] = [10.55, 59.38];
const DEFAULT_ZOOM = 11;

// Rough NM-per-screen approximation from zoom level, matching OpenBridge's own
// ECDIS demo (Ocean-Industries-Concept-Lab/openbridge-webcomponents,
// packages/vue-demo/src/views/ECDIS.vue). Not a navigationally precise chart
// scale; that also depends on viewport size and latitude; just the same
// display convention the reference demo uses for the range stepper.
export function scaleNmForZoom(zoom: number): number {
	return Math.pow(2, 14 - zoom);
}

export interface UseMapLibreInstanceOptions {
	palette: ChartPalette;
	symbolStyle: SymbolStyle;
	safetyContourM: number;
}

export interface UseMapLibreInstanceResult {
	mapRef: RefObject<MapLibreMap | null>;
	zoom: number;
}

/**
 * Creates and owns a MapLibre map instance bound to containerRef: creation, chart-style rebuilding
 * whenever palette/symbolStyle/safetyContourM change (buildOsloFjordStyle() computes a full style
 * object from these, passed straight to setStyle() rather than a URL, since MapLibre styles can't
 * reference OBC's CSS custom properties the way canvas-drawing widgets can), container-resize
 * handling (the widget tile is resizable via react-grid-layout; MapLibre doesn't observe its
 * container), live zoom level, and teardown. Callers needing to add sources/layers/markers to the
 * map do so themselves against the returned mapRef, registering their own "style.load" handler if
 * their layers need to survive a setStyle() call (which wipes all style-bound sources/layers).
 * Those callers must be invoked after this hook in the same component so mapRef.current is already
 * set by the time their own mount effects run (hook effects in the same component run in call order
 * within a commit).
 */
export function useMapLibreInstance(
	containerRef: RefObject<HTMLDivElement | null>,
	{ palette, symbolStyle, safetyContourM }: UseMapLibreInstanceOptions,
): UseMapLibreInstanceResult {
	const mapRef = useRef<MapLibreMap | null>(null);
	const [zoom, setZoom] = useState(DEFAULT_ZOOM);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const map: MapLibreMap = new maplibregl.Map({
			container,
			style: buildOsloFjordStyle(palette, symbolStyle, safetyContourM),
			center: OSLO_FJORD_CENTER,
			zoom: DEFAULT_ZOOM,
			// Chart bearing is driven by the H/N/C control in MapWidget, not free
			// rotation gestures; matches the OpenBridge ECDIS demo.
			dragRotate: false,
			// The style's carto-basemap source is CARTO's free-tier raster basemap, which per
			// CARTO's own terms requires attribution; disabled here as a deliberate, accepted
			// gap for now (not an oversight), since MapLibre's compact attribution control kept
			// starting in an expanded-looking state on load regardless of the compact option.
			// Revisit before this is customer-facing or public.
			attributionControl: false,
		});
		mapRef.current = map;
		map.touchZoomRotate.disableRotation();

		const handleZoomEnd = () => {
			setZoom(map.getZoom());
		};
		map.on("zoomend", handleZoomEnd);

		const resizeObserver = new ResizeObserver(() => {
			map.resize();
		});
		resizeObserver.observe(container);

		return () => {
			map.off("zoomend", handleZoomEnd);
			resizeObserver.disconnect();
			map.remove();
			mapRef.current = null;
		};
		// The map is created once per mount with whatever palette/symbolStyle/safetyContourM are
		// current at that moment; later changes are applied by the effect below via setStyle()
		// rather than recreating the map, so those three are deliberately not dependencies here.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [containerRef]);

	// isInitialRender skips this effect's first run: the mount effect above already builds the
	// style from the current values, so re-applying the identical style immediately after creation
	// would be redundant and risks an extra "style.load" firing before the sibling hooks
	// (useOwnShipMarker etc.) have registered their own listener for it.
	const isInitialRender = useRef(true);
	useEffect(() => {
		if (isInitialRender.current) {
			isInitialRender.current = false;
			return;
		}
		mapRef.current?.setStyle(buildOsloFjordStyle(palette, symbolStyle, safetyContourM));
	}, [palette, symbolStyle, safetyContourM]);

	return { mapRef, zoom };
}
