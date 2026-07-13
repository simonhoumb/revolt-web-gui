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
import { ObiWaypointEditIec } from "@oicl/openbridge-webcomponents-react/icons/icon-waypoint-edit-iec.js";
import { ObiWaypointAddIec } from "@oicl/openbridge-webcomponents-react/icons/icon-waypoint-add-iec.js";
// Imported for their custom-element registration side effect (customElement(...)) -- markers
// below create the elements directly rather than mounting a nested React root, since unmounting
// a secondary root synchronously during the parent's own unmount trips a React warning. Same
// technique already used for the own-ship marker.
import "@oicl/openbridge-webcomponents/dist/icons/icon-own-ship-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-waypoint-optional-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-waypoint-active-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-waypoint-active-filled.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { useVesselTrack, type TrackPoint } from "../../hooks/useVesselTrack.js";
import { useWaypointDraft } from "../../hooks/useWaypointDraft.js";
import { useMission, type HazardSummary } from "../../context/MissionContext.js";
import {
	computeLegPositions,
	computeTurnArcs,
	type LegPositions,
	type TurnArc,
} from "../../lib/geo.js";
import {
	evaluateEncHazards,
	CORRIDOR_HALF_WIDTH_M,
	metersToPixels,
} from "../../lib/encValidation.js";
import type { Waypoint } from "@revolt/shared-types";
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

const LEGS_SOURCE_ID = "mission-legs";
const LEGS_CORRIDOR_LAYER_ID = "mission-legs-corridor";
const LEGS_CASING_LAYER_ID = "mission-legs-casing";
const LEGS_LINE_LAYER_ID = "mission-legs-line";

// metersToPixels(meters, zoom, lat) is exactly proportional to 2^zoom, so sampling it at two zoom
// levels and letting MapLibre's exponential-base-2 zoom interpolation fill in between reproduces
// the true value at every intermediate zoom, not just an approximation -- the standard technique
// for a real-world-sized paint property. Latitude is fixed at the chart's reference point rather
// than per-leg (see evaluateEncHazards, which does use the real per-leg latitude) since Oslo
// Fjord's coverage area spans well under a degree of latitude -- the resulting difference is
// under 1%, not worth a per-feature "lat" property and a cos() expression to eliminate.
const CORRIDOR_MIN_ZOOM = 0;
const CORRIDOR_MAX_ZOOM = 24;
const LEGS_CORRIDOR_WIDTH: [
	"interpolate",
	["exponential", 2],
	["zoom"],
	number,
	number,
	number,
	number,
] = [
	"interpolate",
	["exponential", 2],
	["zoom"],
	CORRIDOR_MIN_ZOOM,
	metersToPixels(CORRIDOR_HALF_WIDTH_M * 2, CORRIDOR_MIN_ZOOM, OSLO_FJORD_CENTER[1]),
	CORRIDOR_MAX_ZOOM,
	metersToPixels(CORRIDOR_HALF_WIDTH_M * 2, CORRIDOR_MAX_ZOOM, OSLO_FJORD_CENTER[1]),
];

// Status colors match the maritime safe/caution/danger convention (green/amber/red), not an
// arbitrary categorical palette -- picking a hue too close to the chart's own water/depth fill
// (blues/teals) makes a leg blend into the background it's drawn over.
const HAZARD_LINE_COLOR: [
	"match",
	["get", "severity"],
	"blocked",
	string,
	"warning",
	string,
	string,
] = ["match", ["get", "severity"], "blocked", "#d03b3b", "warning", "#fab219", "#0ca30c"];

// Fixed safety contour (m) for the client-side ENC check (Phase 1). ReVolt's shallow draft means a
// mariner-configurable margin isn't needed the way it would be on a deep-draft vessel; Phase 2's
// server-side check will eventually pair this with a proper vessel-beam/safety-margin config.
const SAFETY_CONTOUR_M = 3;

type RotationMode = "H" | "N" | "C"; // HEADING-UP || NORTH-UP || COURSE-UP
type EditMode = "edit" | "add";

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

// Local structural types for the track/legs sources' GeoJSON payloads -- avoids
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

interface LegFeature {
	type: "Feature";
	geometry: { type: "LineString"; coordinates: [number, number][] };
	properties: { severity: HazardSummary["status"] };
}

interface LegFeatureCollection {
	type: "FeatureCollection";
	features: LegFeature[];
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

function legsToGeoJSON(
	legs: LegPositions[],
	arcs: TurnArc[],
	legValidation: Record<string, HazardSummary>,
): LegFeatureCollection {
	return {
		type: "FeatureCollection",
		features: [
			...legs.map(
				(leg): LegFeature => ({
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: [
							[leg.from.lon, leg.from.lat],
							[leg.to.lon, leg.to.lat],
						],
					},
					properties: { severity: legValidation[leg.toId]?.status ?? "safe" },
				}),
			),
			// Turn arcs are additional LineString features in the same source, not a separate layer
			// -- the casing/colored-line/corridor layers already style every LineString by its
			// "severity" property, so the arc automatically gets the exact same visual treatment as
			// the straight legs and layers on top of the straight-line corner it replaces, with no
			// change to those layers needed.
			...arcs.map(
				(arc): LegFeature => ({
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: arc.points.map((p): [number, number] => [p.lon, p.lat]),
					},
					properties: { severity: legValidation[arc.waypointId]?.status ?? "safe" },
				}),
			),
		],
	};
}

// A waypoint marker must be explicitly selected (a single click) before it becomes draggable --
// otherwise a click-drag meant to pan the chart could land on an unselected marker and move it
// instead of panning. Selected markers use the "active" icon pair (outline while idle, filled
// while actively being dragged, matching how the own-ship marker uses a distinct look for its
// "current" state); an unselected marker stays the default "optional" outline and ignores drag
// gestures entirely.
function iconTagFor(selected: boolean, dragging: boolean): string {
	if (dragging) return "obi-waypoint-active-filled";
	return selected ? "obi-waypoint-active-iec" : "obi-waypoint-optional-iec";
}

const WAYPOINT_ICON_SELECTOR =
	"obi-waypoint-optional-iec, obi-waypoint-active-iec, obi-waypoint-active-filled";

function createWaypointElement(sequenceNumber: number): { el: HTMLDivElement } {
	const el = document.createElement("div");
	el.className = styles.waypointMarker ?? "";
	const icon = document.createElement(iconTagFor(false, false));
	el.appendChild(icon);
	const label = document.createElement("span");
	label.className = styles.waypointLabel ?? "";
	label.textContent = "W-" + String(sequenceNumber);
	el.appendChild(label);
	return { el };
}

export function MapWidget() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const markerRef = useRef<Marker | null>(null);
	const trackRef = useRef<TrackPoint[]>([]);
	const waypointMarkersRef = useRef<Map<string, Marker>>(new Map());
	const [rotationMode, setRotationMode] = useState<RotationMode>("N");
	const [cameraLocked, setCameraLocked] = useState(true);
	const [zoom, setZoom] = useState(DEFAULT_ZOOM);
	const [editMode, setEditMode] = useState<EditMode>("edit");
	// Which waypoint (if any) is currently selected -- only the selected one is draggable. See
	// iconTagFor's comment for why.
	const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);

	const { latitude, longitude, headingDeg, courseDeg } = useGnssData();
	const track = useVesselTrack();
	const { waypoints } = useWaypointDraft();
	const { legValidation, addWaypoint, updateWaypointPosition, setLegValidation } = useMission();

	// Mutable mirrors for state read inside long-lived event handlers registered once at mount
	// (the map click handler) or created once per marker (drag handlers on markers that survive
	// later renders without being recreated) -- same technique already used for trackRef above.
	const editModeRef = useRef(editMode);
	const addWaypointRef = useRef(addWaypoint);
	const waypointsRef = useRef(waypoints);
	const legValidationRef = useRef(legValidation);
	useEffect(() => {
		editModeRef.current = editMode;
	}, [editMode]);
	useEffect(() => {
		addWaypointRef.current = addWaypoint;
	}, [addWaypoint]);
	useEffect(() => {
		waypointsRef.current = waypoints;
	}, [waypoints]);
	useEffect(() => {
		legValidationRef.current = legValidation;
	}, [legValidation]);

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

		const addLegsLayer = () => {
			map.addSource(LEGS_SOURCE_ID, {
				type: "geojson",
				data: legsToGeoJSON(
					computeLegPositions(waypointsRef.current),
					computeTurnArcs(waypointsRef.current),
					legValidationRef.current,
				),
			});
			// A wide, low-opacity band under the leg mirrors the XTD (cross-track distance) safety
			// corridor standard ECDIS route planning shows around the track: a real-world-meters
			// width (CORRIDOR_HALF_WIDTH_M on each side) that renders correctly bigger when zoomed in
			// and smaller when zoomed out, matching what evaluateEncHazards() actually checks for
			// hazards -- not a to-scale XTD/vessel-beam setting (out of scope for a vessel this size),
			// and not a fixed pixel width either (that meant a different real-world margin at every
			// zoom level). Tinted by the same severity color as the centerline so it still reads as a
			// safety cue.
			map.addLayer({
				id: LEGS_CORRIDOR_LAYER_ID,
				type: "line",
				source: LEGS_SOURCE_ID,
				paint: {
					"line-width": LEGS_CORRIDOR_WIDTH,
					"line-color": HAZARD_LINE_COLOR,
					"line-opacity": 0.18,
				},
			});
			// A dark, semi-transparent casing under the colored line keeps the status color legible
			// regardless of what's underneath it on the chart (depth fill, land, hazard shading) --
			// no single hue survives contact with every background color a nautical chart can show,
			// which is exactly the standard technique real chart/route symbology uses for this.
			map.addLayer({
				id: LEGS_CASING_LAYER_ID,
				type: "line",
				source: LEGS_SOURCE_ID,
				paint: {
					"line-width": 6,
					"line-color": "rgba(0, 0, 0, 0.55)",
				},
			});
			map.addLayer({
				id: LEGS_LINE_LAYER_ID,
				type: "line",
				source: LEGS_SOURCE_ID,
				paint: {
					"line-width": 3,
					"line-color": HAZARD_LINE_COLOR,
				},
			});
		};
		map.on("style.load", addLegsLayer);

		const handleZoomEnd = () => {
			setZoom(map.getZoom());
		};
		map.on("zoomend", handleZoomEnd);

		// Route-edit mode gates whether a click places a new waypoint. Otherwise, clicking the chart
		// (not a marker -- a marker's own click handler, registered on the marker sync effect below,
		// stops the click from reaching the map at all since it's a separate DOM element on top of
		// the canvas) deselects whatever waypoint was selected, since you clicked empty water.
		const handleMapClick = (e: { lngLat: { lat: number; lng: number } }) => {
			if (editModeRef.current === "add") {
				void addWaypointRef.current(e.lngLat.lat, e.lngLat.lng);
				return;
			}
			setSelectedWaypointId(null);
		};
		map.on("click", handleMapClick);

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
			map.off("style.load", addLegsLayer);
			map.off("zoomend", handleZoomEnd);
			map.off("click", handleMapClick);
			themeObserver.disconnect();
			resizeObserver.disconnect();
			// waypointMarkersRef holds a plain Map we manage ourselves (not a React-rendered DOM
			// node), so reading .current fresh at cleanup time -- to catch whichever markers exist
			// at unmount, not just the ones from mount -- is exactly the intended behavior.
			// eslint-disable-next-line react-hooks/exhaustive-deps
			for (const wpMarker of waypointMarkersRef.current.values()) {
				wpMarker.remove();
			}
			waypointMarkersRef.current.clear();
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

	// Waypoint markers: diff the active mission's waypoints against the live marker set. New
	// waypoints get a marker (not draggable until explicitly selected -- see iconTagFor's
	// comment); removed ones (delete, or switching to a different mission) get their marker torn
	// down; existing ones just get repositioned/relabelled in place so drag state and the DOM
	// node identity aren't disturbed by unrelated list changes.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const currentIds = new Set(waypoints.map((w) => w.id));
		for (const [id, wpMarker] of waypointMarkersRef.current) {
			if (!currentIds.has(id)) {
				wpMarker.remove();
				waypointMarkersRef.current.delete(id);
			}
		}

		waypoints.forEach((wp: Waypoint, index: number) => {
			const existing = waypointMarkersRef.current.get(wp.id);
			if (!existing) {
				const { el } = createWaypointElement(index + 1);
				const wpMarker = new maplibregl.Marker({ element: el, draggable: false })
					.setLngLat([wp.position.longitude, wp.position.latitude])
					.addTo(map);

				// A newly created marker is never already selected, so a plain click just selects
				// it -- the dedicated selection-sync effect below then makes it draggable. This is
				// what forces select and drag into two separate gestures: a drag starting on an
				// unselected marker (e.g. a click-drag meant to pan the chart that happened to land
				// on it) can't move it, since draggable only flips on in a later render, not
				// synchronously within that same gesture.
				// stopPropagation matters here: the marker element lives inside the same map
				// container MapLibre's own "click" listener is bound to, so without it the click
				// bubbles up and also fires handleMapClick below, which (seeing a non-"add" click)
				// immediately deselects again -- selecting a marker would silently no-op.
				el.addEventListener("click", (e) => {
					e.stopPropagation();
					setSelectedWaypointId(wp.id);
				});

				wpMarker.on("dragstart", () => {
					el.querySelector(WAYPOINT_ICON_SELECTOR)?.replaceWith(
						document.createElement(iconTagFor(true, true)),
					);
				});
				wpMarker.on("drag", () => {
					const ll = wpMarker.getLngLat();
					const override = { id: wp.id, lat: ll.lat, lon: ll.lng };
					const currentWaypoints = waypointsRef.current;
					const allLegs = computeLegPositions(currentWaypoints, override);
					const allArcs = computeTurnArcs(currentWaypoints, override);

					const legsSource = mapRef.current?.getSource<GeoJSONSource>(LEGS_SOURCE_ID);
					legsSource?.setData(legsToGeoJSON(allLegs, allArcs, legValidationRef.current));

					const touchingLegs = allLegs.filter(
						(leg) => leg.from.id === wp.id || leg.to.id === wp.id,
					);
					if (touchingLegs.length > 0 && mapRef.current) {
						const updated = evaluateEncHazards(
							mapRef.current,
							touchingLegs,
							SAFETY_CONTOUR_M,
						);
						setLegValidation({ ...legValidationRef.current, ...updated });
					}
				});
				wpMarker.on("dragend", () => {
					const ll = wpMarker.getLngLat();
					void updateWaypointPosition(wp.id, ll.lat, ll.lng);
					// Still selected -- only the dragging part ends here.
					el.querySelector(WAYPOINT_ICON_SELECTOR)?.replaceWith(
						document.createElement(iconTagFor(true, false)),
					);
				});

				waypointMarkersRef.current.set(wp.id, wpMarker);
			} else {
				const ll = existing.getLngLat();
				if (ll.lat !== wp.position.latitude || ll.lng !== wp.position.longitude) {
					existing.setLngLat([wp.position.longitude, wp.position.latitude]);
				}
				const label = existing.getElement().querySelector(`.${styles.waypointLabel ?? ""}`);
				if (label) label.textContent = "W-" + String(index + 1);
			}
		});
	}, [waypoints, updateWaypointPosition, setLegValidation]);

	// Only the selected waypoint may be dragged. Runs whenever the selection changes (separate
	// from the waypoints-sync effect above, which only reacts to mission data changing, not this
	// local UI selection state) so switching selection immediately updates draggability and icon
	// on both the newly selected and newly deselected markers.
	useEffect(() => {
		for (const [id, wpMarker] of waypointMarkersRef.current) {
			const selected = id === selectedWaypointId;
			wpMarker.setDraggable(selected);
			const el = wpMarker.getElement();
			el.dataset.selected = String(selected);
			el.querySelector(WAYPOINT_ICON_SELECTOR)?.replaceWith(
				document.createElement(iconTagFor(selected, false)),
			);
		}
	}, [selectedWaypointId]);

	// Clears a stale selection -- the selected waypoint was deleted, or a different mission (with
	// no waypoint sharing that id) was switched to.
	useEffect(() => {
		if (selectedWaypointId && !waypoints.some((w) => w.id === selectedWaypointId)) {
			setSelectedWaypointId(null);
		}
	}, [waypoints, selectedWaypointId]);

	// Recompute hazards for the whole route and refresh the legs line layer whenever the
	// persisted waypoint list changes (add/dragend/delete/reorder all flow through here). Live,
	// per-leg feedback during an active drag is handled separately above.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const legPositions = computeLegPositions(waypoints);
		const hazards =
			legPositions.length > 0 ? evaluateEncHazards(map, legPositions, SAFETY_CONTOUR_M) : {};
		setLegValidation(hazards);
		const source = map.getSource<GeoJSONSource>(LEGS_SOURCE_ID);
		source?.setData(legsToGeoJSON(legPositions, computeTurnArcs(waypoints), hazards));
		// setLegValidation is stable; only waypoints should trigger a recompute, not legValidation
		// itself (that would loop).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [waypoints]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.getCanvas().style.cursor = editMode === "add" ? "crosshair" : "";
	}, [editMode]);

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
	// on every fix; "free" hands panning back to the operator. Scroll-zoom follows the same
	// split: MapLibre's default zooms around the cursor, which is the right feel for free
	// camera, but while locked to the vessel that would let the scroll wheel drag the vessel
	// off-center out from under a stationary cursor -- pin the zoom anchor to the map center
	// (i.e. the vessel, since locked mode keeps it centred) instead. scrollZoom.enable() is a
	// no-op if it's already enabled (MapLibre checks isEnabled() and returns early before
	// touching the "around" option) -- it's enabled by default from map creation, so the very
	// first call here would silently do nothing without disabling it first.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.scrollZoom.disable();
		if (cameraLocked) {
			map.dragPan.disable();
			map.scrollZoom.enable({ around: "center" });
		} else {
			map.dragPan.enable();
			map.scrollZoom.enable();
		}
	}, [cameraLocked]);

	// Instant, not eased: this runs on every single fix while locked, and
	// easeTo()'s 500ms default animation would otherwise restart on each new
	// fix before the previous one finishes -- the camera ends up perpetually
	// chasing a moving target, with catch-up speed varying with fix timing
	// jitter. Matches the OpenBridge ECDIS demo's own choice of an instant
	// setCenter() for continuous tracking.
	useEffect(() => {
		const map = mapRef.current;
		if (!cameraLocked || !map || latitude === null || longitude === null) return;
		// GNSS fixes (real receiver noise, or the mock backend's simulated drift) jitter by a tiny
		// amount even when the vessel is essentially stationary. Re-centring on every fix regardless
		// turns that sub-pixel noise into a visible 1-2px shimmer across the whole scene -- every
		// static waypoint marker and leg appears to "jump" even though nothing actually moved.
		// Skipping fixes that wouldn't move the camera by a perceptible amount on screen keeps real
		// vessel movement tracked smoothly (it accumulates past the threshold within a fix or two)
		// while filtering out noise that was never going to be visible as movement anyway.
		const current = map.getCenter();
		const currentPx = map.project([current.lng, current.lat]);
		const nextPx = map.project([longitude, latitude]);
		const movedPx = Math.hypot(nextPx.x - currentPx.x, nextPx.y - currentPx.y);
		if (movedPx < 1) return;
		map.jumpTo({ center: [longitude, latitude] });
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

	const handleEditModeValue = useCallback(
		(e: CustomEvent<{ value: string; previousValue: string }>) => {
			setEditMode(e.detail.value as EditMode);
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
				<ObcToggleButtonGroup
					aria-label="Route edit mode"
					value={editMode}
					type={ObcToggleButtonOptionType.icon}
					onValue={handleEditModeValue}
				>
					<ObcToggleButtonOption value="edit" aria-label="Edit waypoints">
						<ObiWaypointEditIec slot="icon" />
					</ObcToggleButtonOption>
					<ObcToggleButtonOption value="add" aria-label="Add waypoint">
						<ObiWaypointAddIec slot="icon" />
					</ObcToggleButtonOption>
				</ObcToggleButtonGroup>
			</div>
		</div>
	);
}
