import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type RefObject } from "react";

const LIGHT_STYLE_URL = "/map-styles/oslo-fjord-light.json";
const DARK_STYLE_URL = "/map-styles/oslo-fjord-dark.json";

// Centre of the DNV ENC delivery's actual coverage area (outer/southern
// Oslofjord around Horten, Tonsberg, Moss and Asgardstrand), not central
// Oslo city; see infra/enc-pipeline/README.md for the coverage caveat.
export const OSLO_FJORD_CENTER: [number, number] = [10.55, 59.38];
const DEFAULT_ZOOM = 11;

function styleUrlForTheme(): string {
	// TopNav toggles data-obc-theme between "day" and "dusk" (see TopNav.tsx's
	// dimming button); "day" is the light theme, anything else (currently
	// just "dusk", the default) gets the dark chart style.
	const isDay = document.documentElement.getAttribute("data-obc-theme") === "day";
	return isDay ? LIGHT_STYLE_URL : DARK_STYLE_URL;
}

// Rough NM-per-screen approximation from zoom level, matching OpenBridge's own
// ECDIS demo (Ocean-Industries-Concept-Lab/openbridge-webcomponents,
// packages/vue-demo/src/views/ECDIS.vue). Not a navigationally precise chart
// scale; that also depends on viewport size and latitude; just the same
// display convention the reference demo uses for the range stepper.
export function scaleNmForZoom(zoom: number): number {
	return Math.pow(2, 14 - zoom);
}

export interface UseMapLibreInstanceResult {
	mapRef: RefObject<MapLibreMap | null>;
	zoom: number;
}

/**
 * Creates and owns a MapLibre map instance bound to containerRef: creation, day/dusk theme
 * switching (MapLibre styles can't reference OBC's CSS custom properties, unlike canvas-drawing
 * widgets, so this swaps between two static style documents instead), container-resize handling
 * (the widget tile is resizable via react-grid-layout; MapLibre doesn't observe its container),
 * live zoom level, and teardown. Callers needing to add sources/layers/markers to the map do so
 * themselves against the returned mapRef, registering their own "style.load" handler if their
 * layers need to survive a theme-driven setStyle() call (which wipes all style-bound
 * sources/layers). Those callers must be invoked after this hook in the same component so
 * mapRef.current is already set by the time their own mount effects run (hook effects in the
 * same component run in call order within a commit).
 */
export function useMapLibreInstance(
	containerRef: RefObject<HTMLDivElement | null>,
): UseMapLibreInstanceResult {
	const mapRef = useRef<MapLibreMap | null>(null);
	const [zoom, setZoom] = useState(DEFAULT_ZOOM);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const map: MapLibreMap = new maplibregl.Map({
			container,
			style: styleUrlForTheme(),
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

		const themeObserver = new MutationObserver(() => {
			map.setStyle(styleUrlForTheme());
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-obc-theme"],
		});

		const resizeObserver = new ResizeObserver(() => {
			map.resize();
		});
		resizeObserver.observe(container);

		return () => {
			map.off("zoomend", handleZoomEnd);
			themeObserver.disconnect();
			resizeObserver.disconnect();
			map.remove();
			mapRef.current = null;
		};
	}, [containerRef]);

	return { mapRef, zoom };
}
