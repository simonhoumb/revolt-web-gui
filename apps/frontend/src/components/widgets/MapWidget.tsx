import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import styles from "./MapWidget.module.css";

const LIGHT_STYLE_URL = "/map-styles/oslo-fjord-light.json";
const DARK_STYLE_URL = "/map-styles/oslo-fjord-dark.json";

// Centre of the DNV ENC delivery's actual coverage area (outer/southern
// Oslofjord around Horten, Tonsberg, Moss and Asgardstrand), not central
// Oslo city -- see infra/enc-pipeline/README.md for the coverage caveat.
const OSLO_FJORD_CENTER: [number, number] = [10.55, 59.38];
const DEFAULT_ZOOM = 11;

function styleUrlForTheme(): string {
	// TopNav toggles data-obc-theme between "day" and "dusk" (see TopNav.tsx's
	// dimming button) -- "day" is the light theme, anything else (currently
	// just "dusk", the default) gets the dark chart style.
	const isDay = document.documentElement.getAttribute("data-obc-theme") === "day";
	return isDay ? LIGHT_STYLE_URL : DARK_STYLE_URL;
}

export function MapWidget() {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const map: MapLibreMap = new maplibregl.Map({
			container,
			style: styleUrlForTheme(),
			center: OSLO_FJORD_CENTER,
			zoom: DEFAULT_ZOOM,
			// The style's carto-basemap source is CARTO's free-tier raster
			// basemap, which requires attribution -- compact keeps it small in
			// the tight widget tile.
			attributionControl: { compact: true },
		});
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

		// MapLibre styles can't reference OBC's CSS custom properties, unlike the
		// canvas-drawing widgets (e.g. LidarWidget), so swap between two static
		// style documents instead when the day/night theme changes.
		const themeObserver = new MutationObserver(() => {
			map.setStyle(styleUrlForTheme());
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-obc-theme"],
		});

		// The widget tile is resizable (react-grid-layout); MapLibre doesn't
		// observe its container, so it needs an explicit nudge on resize.
		const resizeObserver = new ResizeObserver(() => {
			map.resize();
		});
		resizeObserver.observe(container);

		return () => {
			themeObserver.disconnect();
			resizeObserver.disconnect();
			map.remove();
		};
	}, []);

	return <div ref={containerRef} className={styles.mapContainer} aria-label="Oslo Fjord chart" />;
}
