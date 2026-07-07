import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ObcStepperBox } from "@oicl/openbridge-webcomponents-react/components/stepper-box/stepper-box.js";
import { ObcToggleButtonGroup } from "@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group.js";
import { ObcToggleButtonOption } from "@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option.js";
import { ObcToggleButtonOptionType } from "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import { ObiHeadingHUpProposal } from "@oicl/openbridge-webcomponents-react/icons/icon-heading-h-up-proposal.js";
import { ObiHeadingNUpProposal } from "@oicl/openbridge-webcomponents-react/icons/icon-heading-n-up-proposal.js";
import { ObiHeadingCUpProposal } from "@oicl/openbridge-webcomponents-react/icons/icon-heading-c-up-proposal.js";
import { ObiCenterIec } from "@oicl/openbridge-webcomponents-react/icons/icon-center-iec.js";
import { ObiCenterOffIec } from "@oicl/openbridge-webcomponents-react/icons/icon-center-off-iec.js";
// Imported for its custom-element registration side effect (customElement("obi-own-ship-iec")) --
// the marker below creates the element directly rather than mounting a nested React root, since
// unmounting a secondary root synchronously during the parent's own unmount trips a React warning.
import "@oicl/openbridge-webcomponents/dist/icons/icon-own-ship-iec.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { useVesselTrack, type TrackPoint } from "../../hooks/useVesselTrack.js";
import styles from "./MapWidget.module.css";

const LIGHT_STYLE_URL = "/map-styles/oslo-fjord-light.json";
const DARK_STYLE_URL = "/map-styles/oslo-fjord-dark.json";

// Centre of the DNV ENC delivery's actual coverage area (outer/southern
// Oslofjord around Horten, Tonsberg, Moss and Asgardstrand), not central
// Oslo city -- see infra/enc-pipeline/README.md for the coverage caveat.
const OSLO_FJORD_CENTER: [number, number] = [10.55, 59.38];
const DEFAULT_ZOOM = 11;

const TRACK_SOURCE_ID = "vessel-track";
const TRACK_LINE_LAYER_ID = "vessel-track-line";
const TRACK_POINTS_LAYER_ID = "vessel-track-points";

type RotationMode = "H" | "N" | "C"; // HEADING-UP || NORTH-UP || COURSE-UP

// Rough NM-per-screen approximation from zoom level, matching OpenBridge's own
// ECDIS demo (Ocean-Industries-Concept-Lab/openbridge-webcomponents,
// packages/vue-demo/src/views/ECDIS.vue). Not a navigationally precise chart
// scale -- that also depends on viewport size and latitude -- just the same
// display convention the reference demo uses for the range stepper.
function scaleNmForZoom(zoom: number): number {
	return Math.pow(2, 14 - zoom);
}

function styleUrlForTheme(): string {
	// TopNav toggles data-obc-theme between "day" and "dusk" (see TopNav.tsx's
	// dimming button) -- "day" is the light theme, anything else (currently
	// just "dusk", the default) gets the dark chart style.
	const isDay = document.documentElement.getAttribute("data-obc-theme") === "day";
	return isDay ? LIGHT_STYLE_URL : DARK_STYLE_URL;
}

// Local structural types for the track source's GeoJSON payload -- avoids
// depending on @types/geojson's ambient global, which pnpm's isolated
// node_modules layout doesn't expose to this package. maplibre-gl's own
// source-data types are checked structurally, so this shape is enough.
interface TrackFeature {
	type: "Feature";
	geometry:
		| { type: "LineString"; coordinates: [number, number][] }
		| { type: "Point"; coordinates: [number, number] };
	properties: Record<string, never>;
}

interface TrackFeatureCollection {
	type: "FeatureCollection";
	features: TrackFeature[];
}

function trackToGeoJSON(points: TrackPoint[]): TrackFeatureCollection {
	return {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: points.map((p): [number, number] => [p.longitude, p.latitude]),
				},
				properties: {},
			},
			...points.map(
				(p): TrackFeature => ({
					type: "Feature",
					geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
					properties: {},
				}),
			),
		],
	};
}

export function MapWidget() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const markerRef = useRef<Marker | null>(null);
	const trackRef = useRef<TrackPoint[]>([]);
	const [rotationMode, setRotationMode] = useState<RotationMode>("N");
	const [cameraLocked, setCameraLocked] = useState(true);
	const [zoom, setZoom] = useState(DEFAULT_ZOOM);

	const { latitude, longitude, headingDeg, courseDeg } = useGnssData();
	const track = useVesselTrack();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const map: MapLibreMap = new maplibregl.Map({
			container,
			style: styleUrlForTheme(),
			center: OSLO_FJORD_CENTER,
			zoom: DEFAULT_ZOOM,
			// Chart bearing is driven by the H/N/C control below, not free
			// rotation gestures -- matches the OpenBridge ECDIS demo.
			dragRotate: false,
			// The style's carto-basemap source is CARTO's free-tier raster
			// basemap, which requires attribution -- compact keeps it small in
			// the tight widget tile.
			attributionControl: { compact: true },
		});
		mapRef.current = map;
		map.touchZoomRotate.disableRotation();

		// DOM marker (not a symbol layer) since the own-ship icon is an OBC
		// React/Lit component, not a sprite. Hidden until the first GNSS fix
		// arrives so it doesn't sit at the chart centre before a real position
		// is known.
		const vesselEl = document.createElement("div");
		vesselEl.className = styles.vesselMarker ?? "";
		vesselEl.style.visibility = "hidden";
		vesselEl.appendChild(document.createElement("obi-own-ship-iec"));
		const marker = new maplibregl.Marker({ element: vesselEl, rotationAlignment: "map" })
			.setLngLat(OSLO_FJORD_CENTER)
			.addTo(map);
		markerRef.current = marker;

		// GeoJSON sources/layers are style-bound and get wiped out whenever
		// setStyle() runs (used below for the day/dusk theme swap), so
		// (re)add them on "style.load" -- it fires both on the initial load
		// and after every subsequent setStyle call.
		const addTrackLayers = () => {
			map.addSource(TRACK_SOURCE_ID, {
				type: "geojson",
				data: trackToGeoJSON(trackRef.current),
			});
			map.addLayer({
				id: TRACK_LINE_LAYER_ID,
				type: "line",
				source: TRACK_SOURCE_ID,
				filter: ["==", ["geometry-type"], "LineString"],
				paint: {
					"line-color": "#8aa0b8",
					"line-width": 2,
					"line-dasharray": [2, 2],
				},
			});
			map.addLayer({
				id: TRACK_POINTS_LAYER_ID,
				type: "circle",
				source: TRACK_SOURCE_ID,
				filter: ["==", ["geometry-type"], "Point"],
				paint: {
					"circle-radius": 3,
					"circle-color": "#8aa0b8",
				},
			});
		};
		map.on("style.load", addTrackLayers);

		const handleZoomEnd = () => {
			setZoom(map.getZoom());
		};
		map.on("zoomend", handleZoomEnd);

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
			map.off("style.load", addTrackLayers);
			map.off("zoomend", handleZoomEnd);
			themeObserver.disconnect();
			resizeObserver.disconnect();
			marker.remove();
			map.remove();
			mapRef.current = null;
			markerRef.current = null;
		};
	}, []);

	useEffect(() => {
		const marker = markerRef.current;
		if (!marker || latitude === null || longitude === null) return;
		marker.setLngLat([longitude, latitude]);
		marker.getElement().style.visibility = "visible";
	}, [latitude, longitude]);

	useEffect(() => {
		const marker = markerRef.current;
		if (!marker || headingDeg === null) return;
		marker.setRotation(headingDeg);
	}, [headingDeg]);

	useEffect(() => {
		trackRef.current = track;
		const source = mapRef.current?.getSource<GeoJSONSource>(TRACK_SOURCE_ID);
		source?.setData(trackToGeoJSON(track));
	}, [track]);

	// H/N/C chart orientation: bearing follows true heading, course over
	// ground, or stays fixed at true north depending on the selected mode.
	// dragRotate/touch rotation are disabled above, so this is the only way
	// the chart's bearing changes. Skip the update while the operator is
	// actively dragging -- same guard the OpenBridge ECDIS demo uses --
	// otherwise every heading/course tick fights the pan gesture and the drag
	// feels like it keeps getting cancelled. eased (not snapped) so the
	// rotation itself isn't jarring once it does apply.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || map.dragPan.isActive()) return;
		const bearing =
			rotationMode === "H" ? (headingDeg ?? 0) : rotationMode === "C" ? (courseDeg ?? 0) : 0;
		map.easeTo({ bearing, duration: 300 });
	}, [rotationMode, headingDeg, courseDeg]);

	// Camera lock: while locked, dragging is disabled and the chart recentres
	// on every fix; "free" hands panning back to the operator.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (cameraLocked) {
			map.dragPan.disable();
		} else {
			map.dragPan.enable();
		}
	}, [cameraLocked]);

	// Instant, not eased: this runs on every single fix while locked, and
	// easeTo()'s 500ms default animation would otherwise restart on each new
	// fix before the previous one finishes -- the camera ends up perpetually
	// chasing a moving target, with catch-up speed varying with fix timing
	// jitter. Matches the OpenBridge ECDIS demo's own choice of an instant
	// setCenter() for continuous tracking.
	useEffect(() => {
		if (!cameraLocked || latitude === null || longitude === null) return;
		mapRef.current?.jumpTo({ center: [longitude, latitude] });
	}, [cameraLocked, latitude, longitude]);

	const handleRotationValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setRotationMode(e.detail.value as RotationMode);
		},
		[],
	);

	const handleCameraLockValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setCameraLocked(e.detail.value === "locked");
		},
		[],
	);

	const handleZoomIn = useCallback(() => {
		mapRef.current?.zoomIn();
	}, []);

	const handleZoomOut = useCallback(() => {
		mapRef.current?.zoomOut();
	}, []);

	return (
		<div className={styles.mapWrapper}>
			<div ref={containerRef} className={styles.mapContainer} aria-label="Oslo Fjord chart" />
			<div className={styles.toolbar}>
				<ObcStepperBox aria-label="Chart range" onUp={handleZoomIn} onDown={handleZoomOut}>
					<div>{scaleNmForZoom(zoom).toFixed(1)}</div>
					<div slot="unit">NM</div>
				</ObcStepperBox>
				<ObcToggleButtonGroup
					aria-label="Chart orientation"
					value={rotationMode}
					type={ObcToggleButtonOptionType.icon}
					onValue={handleRotationValue}
				>
					<ObcToggleButtonOption value="H" aria-label="Heading up">
						<ObiHeadingHUpProposal slot="icon" />
					</ObcToggleButtonOption>
					<ObcToggleButtonOption value="N" aria-label="North up">
						<ObiHeadingNUpProposal slot="icon" />
					</ObcToggleButtonOption>
					<ObcToggleButtonOption value="C" aria-label="Course up">
						<ObiHeadingCUpProposal slot="icon" />
					</ObcToggleButtonOption>
				</ObcToggleButtonGroup>
				<ObcToggleButtonGroup
					aria-label="Camera lock"
					value={cameraLocked ? "locked" : "free"}
					type={ObcToggleButtonOptionType.icon}
					onValue={handleCameraLockValue}
				>
					<ObcToggleButtonOption value="locked" aria-label="Lock camera on vessel">
						<ObiCenterIec slot="icon" />
					</ObcToggleButtonOption>
					<ObcToggleButtonOption value="free" aria-label="Free camera">
						<ObiCenterOffIec slot="icon" />
					</ObcToggleButtonOption>
				</ObcToggleButtonGroup>
			</div>
		</div>
	);
}
