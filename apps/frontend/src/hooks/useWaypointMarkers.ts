import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
// Imported for their custom-element registration side effect (customElement(...)); markers
// below create the elements directly rather than mounting a nested React root, since unmounting
// a secondary root synchronously during the parent's own unmount trips a React warning. Same
// technique already used for the own-ship marker.
import "@oicl/openbridge-webcomponents/dist/icons/icon-waypoint-optional-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-waypoint-active-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-waypoint-active-filled.js";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { HazardSummary, Waypoint } from "@revolt/shared-types";
import {
	computeLegPositions,
	computeTurnArcs,
	type LegPositions,
	type TurnArc,
} from "../lib/geo.js";
import { evaluateEncHazards, CORRIDOR_HALF_WIDTH_M, metersToPixels } from "../lib/encValidation.js";
import { OSLO_FJORD_CENTER } from "./useMapLibreInstance.js";
import styles from "../components/widgets/MapWidget.module.css";

const LEGS_SOURCE_ID = "mission-legs";
const LEGS_CORRIDOR_LAYER_ID = "mission-legs-corridor";
const LEGS_CASING_LAYER_ID = "mission-legs-casing";
const LEGS_LINE_LAYER_ID = "mission-legs-line";

// metersToPixels(meters, zoom, lat) is exactly proportional to 2^zoom, so sampling it at two zoom
// levels and letting MapLibre's exponential-base-2 zoom interpolation fill in between reproduces
// the true value at every intermediate zoom, not just an approximation; the standard technique
// for a real-world-sized paint property. Latitude is fixed at the chart's reference point rather
// than per-leg (see evaluateEncHazards, which does use the real per-leg latitude) since Oslo
// Fjord's coverage area spans well under a degree of latitude; the resulting difference is
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
// arbitrary categorical palette; picking a hue too close to the chart's own water/depth fill
// (blues/teals) makes a leg blend into the background it's drawn over. "no_data" (no charted ENC
// coverage at all) is deliberately NOT on that safe-to-danger gradient; it's a grey/neutral,
// matching how real ECDIS/S-52 renders unsurveyed areas distinctly from the safety-tier colors,
// since "unknown" isn't a point on a scale from safe to dangerous.
const HAZARD_LINE_COLOR: [
	"match",
	["get", "severity"],
	"blocked",
	string,
	"warning",
	string,
	"no_data",
	string,
	string,
] = [
	"match",
	["get", "severity"],
	"blocked",
	"#d03b3b",
	"warning",
	"#fab219",
	"no_data",
	"#8a8a8a",
	"#0ca30c",
];

// Local structural types for the legs source's GeoJSON payload; see useVesselTrackLayer's
// TrackFeature comment for why this isn't @types/geojson.
interface LegFeature {
	type: "Feature";
	geometry: { type: "LineString"; coordinates: [number, number][] };
	properties: { severity: HazardSummary["status"] };
}

interface LegFeatureCollection {
	type: "FeatureCollection";
	features: LegFeature[];
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
			//; the casing/colored-line/corridor layers already style every LineString by its
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

// A waypoint marker must be explicitly selected (a single click) before it becomes draggable;
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

// evaluateEncHazards() only sees whatever the map's vector tiles have actually rendered so far
// (queryRenderedFeatures), not what will be there once loading finishes; calling this before the
// relevant tiles have loaded (e.g. right after the mission's waypoints first arrive from the API,
// which can easily race the map's own initial tile fetch on a fresh page load) sees empty results
// everywhere, which the coverage check reads as "no charted data" for every leg. Shared by the
// waypoints-driven recompute below and the map's own "idle" event (fires once the map has actually
// finished loading/rendering), so a first evaluation that ran too early gets silently corrected
// once real tile data is available, without needing a waypoint change to trigger it.
function recomputeLegHazards(
	map: MapLibreMap,
	waypoints: Waypoint[],
	safetyContourM: number,
	setLegValidation: (result: Record<string, HazardSummary>) => void,
): void {
	const legPositions = computeLegPositions(waypoints);
	const hazards =
		legPositions.length > 0 ? evaluateEncHazards(map, legPositions, safetyContourM) : {};
	setLegValidation(hazards);
	const source = map.getSource<GeoJSONSource>(LEGS_SOURCE_ID);
	source?.setData(legsToGeoJSON(legPositions, computeTurnArcs(waypoints), hazards));
}

export interface UseWaypointMarkersOptions {
	waypoints: Waypoint[];
	legValidation: Record<string, HazardSummary>;
	editMode: "edit" | "add";
	addWaypoint: (latitude: number, longitude: number) => Promise<void>;
	updateWaypointPosition: (
		waypointId: string,
		latitude: number,
		longitude: number,
	) => Promise<void>;
	setLegValidation: (result: Record<string, HazardSummary>) => void;
	/** Mariner's configured safety depth (m), from ChartSettingsContext; drives both the client-side
	 * ENC hazard check below and the chart's own safety-contour visual highlight (chartStyle.ts). */
	safetyContourM: number;
}

/**
 * Owns the mission route visualization and waypoint-editing interactions: the legs/corridor
 * source and layers, map-click-to-add-waypoint (or click-to-deselect), waypoint marker
 * create/update/remove, select-then-drag editing, and both the live per-drag hazard preview and
 * the persisted-state-driven hazard recompute. Must be called after useMapLibreInstance in the
 * same component so mapRef.current is already set by the time this hook's own mount effect runs.
 */
export function useWaypointMarkers(
	mapRef: RefObject<MapLibreMap | null>,
	{
		waypoints,
		legValidation,
		editMode,
		addWaypoint,
		updateWaypointPosition,
		setLegValidation,
		safetyContourM,
	}: UseWaypointMarkersOptions,
): void {
	const waypointMarkersRef = useRef<Map<string, Marker>>(new Map());
	// Mutable mirrors for state read inside long-lived closures registered once at mount (the
	// legs-layer style.load handler, the "idle" handler) or created once per marker (drag
	// handlers on markers that survive later renders without being recreated, so drag
	// state/DOM identity aren't disturbed by unrelated list changes).
	const waypointsRef = useRef(waypoints);
	const legValidationRef = useRef(legValidation);
	const safetyContourMRef = useRef(safetyContourM);
	useEffect(() => {
		waypointsRef.current = waypoints;
	}, [waypoints]);
	useEffect(() => {
		legValidationRef.current = legValidation;
	}, [legValidation]);
	useEffect(() => {
		safetyContourMRef.current = safetyContourM;
	}, [safetyContourM]);

	// Which waypoint (if any) is currently selected; only the selected one is draggable. See
	// iconTagFor's comment for why. Fully internal: MapWidget's own render doesn't need to know
	// the current selection.
	const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

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
			// hazards; not a to-scale XTD/vessel-beam setting (out of scope for a vessel this size),
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
			// regardless of what's underneath it on the chart (depth fill, land, hazard shading);
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

		// See recomputeLegHazards' comment: a waypoints-driven evaluation can run before the map's
		// vector tiles have actually loaded (most commonly right on initial page load), and "idle"
		// is exactly the event that fires once loading/rendering has genuinely settled; catches
		// and corrects that case without needing a waypoint change to trigger a recompute.
		const handleIdle = () => {
			recomputeLegHazards(
				map,
				waypointsRef.current,
				safetyContourMRef.current,
				setLegValidation,
			);
		};
		map.on("idle", handleIdle);

		return () => {
			map.off("style.load", addLegsLayer);
			map.off("idle", handleIdle);
			// waypointMarkersRef holds a plain Map we manage ourselves (not a React-rendered DOM
			// node), so reading .current fresh at cleanup time; to catch whichever markers exist
			// at unmount, not just the ones from mount; is exactly the intended behavior.
			// eslint-disable-next-line react-hooks/exhaustive-deps
			for (const wpMarker of waypointMarkersRef.current.values()) {
				wpMarker.remove();
			}
			waypointMarkersRef.current.clear();
		};
	}, [mapRef, setLegValidation]);

	// Route-edit mode gates whether a click places a new waypoint. Otherwise, clicking the chart
	// (not a marker; a marker's own click handler, registered in the marker-sync effect below,
	// stops the click from reaching the map at all since it's a separate DOM element on top of
	// the canvas) deselects whatever waypoint was selected, since you clicked empty water.
	// Re-registers whenever editMode/addWaypoint change, rather than reading them via a ref;
	// infrequent (only on an explicit mode toggle or mission switch), so there's no need for the
	// mount-once-and-mirror-via-ref pattern the other long-lived handlers in this hook still need.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const handleMapClick = (e: { lngLat: { lat: number; lng: number } }) => {
			if (editMode === "add") {
				void addWaypoint(e.lngLat.lat, e.lngLat.lng);
				return;
			}
			setSelectedWaypointId(null);
		};
		map.on("click", handleMapClick);

		return () => {
			map.off("click", handleMapClick);
		};
	}, [mapRef, editMode, addWaypoint]);

	// Waypoint markers: diff the active mission's waypoints against the live marker set. New
	// waypoints get a marker (not draggable until explicitly selected; see iconTagFor's
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
				// it; the dedicated selection-sync effect below then makes it draggable. This is
				// what forces select and drag into two separate gestures: a drag starting on an
				// unselected marker (e.g. a click-drag meant to pan the chart that happened to land
				// on it) can't move it, since draggable only flips on in a later render, not
				// synchronously within that same gesture.
				// stopPropagation matters here: the marker element lives inside the same map
				// container MapLibre's own "click" listener is bound to, so without it the click
				// bubbles up and also fires handleMapClick above, which (seeing a non-"add" click)
				// immediately deselects again; selecting a marker would silently no-op.
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
							safetyContourMRef.current,
						);
						setLegValidation({ ...legValidationRef.current, ...updated });
					}
				});
				wpMarker.on("dragend", () => {
					const ll = wpMarker.getLngLat();
					void updateWaypointPosition(wp.id, ll.lat, ll.lng);
					// Still selected; only the dragging part ends here.
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
	}, [mapRef, waypoints, updateWaypointPosition, setLegValidation]);

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

	// Clears a stale selection; the selected waypoint was deleted, or a different mission (with
	// no waypoint sharing that id) was switched to.
	useEffect(() => {
		if (selectedWaypointId && !waypoints.some((w) => w.id === selectedWaypointId)) {
			setSelectedWaypointId(null);
		}
	}, [waypoints, selectedWaypointId]);

	// Recompute hazards for the whole route and refresh the legs line layer whenever the
	// persisted waypoint list changes (add/dragend/delete/reorder all flow through here), or when
	// the mariner changes the safety-contour depth itself. Live, per-leg feedback during an active
	// drag is handled separately above. The map's own "idle" event (registered at mount, see
	// recomputeLegHazards' comment) covers the case where this runs before the map's tiles have
	// actually loaded.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		recomputeLegHazards(map, waypoints, safetyContourM, setLegValidation);
		// setLegValidation is stable; only waypoints/safetyContourM should trigger a recompute, not
		// legValidation itself (that would loop).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [waypoints, safetyContourM, mapRef]);
}
