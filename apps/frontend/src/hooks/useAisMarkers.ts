import maplibregl, { type Map as MapLibreMap, type Marker, type Popup } from "maplibre-gl";
// Imported for their custom-element registration side effect (customElement(...)); markers
// below create the elements directly rather than mounting a nested React root, same technique
// already used for the own-ship and waypoint markers. The "nohdgcog" variants render a target
// with no heading/COG marker, for reports where heading isn't available (e.g. base stations).
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-activated-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-activated-nohdgcog-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-sleeping-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-sleeping-nohdgcog-iec.js";
// "-selected-" counterparts, shown for whichever target's popup is currently open.
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-activated-selected-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-activated-nohdgcog-selected-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-sleeping-selected-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-sleeping-nohdgcog-selected-iec.js";
// Same reasoning as the icons above: registers <obc-toggletip>, built imperatively as the click
// popup's content rather than through the React wrapper, since it lives inside a maplibregl.Popup,
// not this component's own React tree.
import "@oicl/openbridge-webcomponents/dist/components/toggletip/toggletip.js";
// Toggletip's own trailing-icon slot is used as the popup's close button (see buildAisPopupContent)
// instead of maplibregl.Popup's own closeButton, so this is the only close affordance rendered.
import "@oicl/openbridge-webcomponents/dist/icons/icon-close-google.js";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { AisTarget } from "./useAisTargets.js";
import { formatLatLon, formatNavStatus } from "../lib/format.js";
import styles from "../components/widgets/MapWidget.module.css";

function iconTagFor(stale: boolean, hasHeading: boolean, selected: boolean): string {
	const base = stale ? "obi-ais-target-sleeping" : "obi-ais-target-activated";
	const hdgcog = hasHeading ? "" : "-nohdgcog";
	const sel = selected ? "-selected" : "";
	return `${base}${hdgcog}${sel}-iec`;
}

const AIS_ICON_SELECTOR = [
	"obi-ais-target-activated-iec",
	"obi-ais-target-activated-nohdgcog-iec",
	"obi-ais-target-sleeping-iec",
	"obi-ais-target-sleeping-nohdgcog-iec",
	"obi-ais-target-activated-selected-iec",
	"obi-ais-target-activated-nohdgcog-selected-iec",
	"obi-ais-target-sleeping-selected-iec",
	"obi-ais-target-sleeping-nohdgcog-selected-iec",
].join(", ");

function createAisElement(target: AisTarget): HTMLDivElement {
	const el = document.createElement("div");
	el.className = styles.aisTargetMarker ?? "";
	// Never pre-selected: a marker can't be selected before it exists to be clicked.
	el.appendChild(
		document.createElement(iconTagFor(target.stale, target.headingDeg !== null, false)),
	);
	return el;
}

// Vessel name/callsign/ship type/dimensions/destination/ETA come from a separate AIS static/
// voyage report (message type 5), broadcast roughly every 6 minutes rather than bundled with the
// position report this popup's other fields come from -- a distinct, larger follow-up (new
// decoder message type, caching by mmsi on a much longer timescale, merging two sources), not an
// extension of this function.
// obc-toggletip's own .wrapper is a hard-coded 400px wide unless overridden via customWidth;
// narrowed to fit this popup's few short rows. Set alongside the Popup's own maxWidth: "none"
// (see below) so the two don't fight over the box's actual width, which also throws off where
// MapLibre thinks the box's horizontal center (and thus the anchor/arrow alignment) is.
const POPUP_WIDTH_PX = 220;

// Vertical gap (px) between the anchor point and the popup's bottom edge/arrow. Without this the
// arrow tip sits exactly on the marker's own lnglat point, overlapping the 22px-tall icon
// (.aisTargetMarker); negative Y moves the popup up and away from the point, per MapLibre's own
// offset convention for a "bottom" anchor.
const POPUP_OFFSET: [number, number] = [0, -20];

// AIS reports turn rate as signed degrees/minute (+right/-left), already resolved to null for
// "not available" by the time this runs (see useAisTargets.ts); this is purely presentation, so
// it stays local to the popup rather than a shared formatter.
function formatTurnRate(turnDegPerMin: number): string {
	if (turnDegPerMin === 0) return "Not turning";
	const direction = turnDegPerMin > 0 ? "right" : "left";
	return `${Math.abs(turnDegPerMin).toFixed(0)}°/min ${direction}`;
}

function buildAisPopupContent(target: AisTarget, onClose: () => void): HTMLElement {
	const toggletip = document.createElement("obc-toggletip");
	toggletip.title = `MMSI ${String(target.mmsi)}`;
	toggletip.hasContent = true;
	toggletip.customWidth = POPUP_WIDTH_PX;
	toggletip.hasTrailingIcon = true;

	const closeIcon = document.createElement("obi-close-google");
	closeIcon.slot = "trailing-icon";
	closeIcon.style.cursor = "pointer";
	closeIcon.addEventListener("click", (e) => {
		e.stopPropagation();
		onClose();
	});
	toggletip.appendChild(closeIcon);

	const content = document.createElement("div");
	content.slot = "content";

	const rows: [string, string][] = [
		["Position", formatLatLon(target.lat, target.lon)],
		["SOG", target.sogKn !== null ? `${target.sogKn.toFixed(1)} kn` : "Unknown"],
		["Heading", target.headingDeg !== null ? `${target.headingDeg.toFixed(0)}°` : "Unknown"],
		["COG", target.cogDeg !== null ? `${target.cogDeg.toFixed(0)}°` : "Unknown"],
		["Turn", target.turnDegPerMin !== null ? formatTurnRate(target.turnDegPerMin) : "Unknown"],
		["Nav status", formatNavStatus(target.navStatus)],
	];
	// "Signal", not "Status" -- nav status above already owns that word for the vessel's own
	// reported state; this row is about the freshness of our own reception instead.
	if (target.stale) rows.push(["Signal", "Sleeping (no recent report)"]);

	for (const [label, value] of rows) {
		const row = document.createElement("div");
		row.textContent = `${label}: ${value}`;
		content.appendChild(row);
	}

	toggletip.appendChild(content);
	return toggletip;
}

// True if two targets would render identically, i.e. nothing a marker/popup rebuild would
// actually change. useAisTargets() rebuilds its returned array (and every target object in it)
// on every call, including on renders where nothing about a given target actually changed, so
// effects keyed on that array run far more often than the underlying data does -- comparing
// fields here, rather than unconditionally rebuilding DOM on every run, is what keeps a live
// high-frequency feed from tearing down and recreating icon/popup elements out from under the
// user mid-click (the icon or popup close button could get replaced between mousedown and
// mouseup, which some browsers won't dispatch a "click" through).
function targetRenderEquals(a: AisTarget, b: AisTarget): boolean {
	return (
		a.lat === b.lat &&
		a.lon === b.lon &&
		a.sogKn === b.sogKn &&
		a.headingDeg === b.headingDeg &&
		a.cogDeg === b.cogDeg &&
		a.turnDegPerMin === b.turnDegPerMin &&
		a.navStatus === b.navStatus &&
		a.stale === b.stale
	);
}

/**
 * Owns the AIS target markers: one per mmsi, created/updated/removed as reports arrive, expire,
 * or go stale. Must be called after useMapLibreInstance in the same component so mapRef.current
 * is already set by the time this hook's own effect runs. Pass an empty array to hide all
 * markers without unmounting the hook (used for the show/hide toolbar toggle).
 */
export function useAisMarkers(mapRef: RefObject<MapLibreMap | null>, targets: AisTarget[]): void {
	const markersRef = useRef<Map<number, Marker>>(new Map());
	const popupRef = useRef<Popup | null>(null);
	// Last target snapshot actually rendered into the open popup's content, so repeated effect
	// runs with unchanged data (see targetRenderEquals) skip rebuilding it.
	const popupTargetRef = useRef<AisTarget | null>(null);
	// Which target's detail popup is open, if any. Fully internal, same as
	// useWaypointMarkers' selectedWaypointId -- MapWidget's own render doesn't need to know it.
	const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const currentMmsis = new Set(targets.map((t) => t.mmsi));
		for (const [mmsi, marker] of markersRef.current) {
			if (!currentMmsis.has(mmsi)) {
				marker.remove();
				markersRef.current.delete(mmsi);
			}
		}

		for (const target of targets) {
			const existing = markersRef.current.get(target.mmsi);
			if (!existing) {
				const el = createAisElement(target);
				// stopPropagation matters here: the marker element lives inside the same map
				// container MapLibre's own "click" listener is bound to (see useWaypointMarkers'
				// own marker click handler for the same reasoning), so without it the click would
				// also reach useWaypointMarkers' handleMapClick (deselecting a waypoint, or placing
				// a new one in "add" mode).
				el.addEventListener("click", (e) => {
					e.stopPropagation();
					setSelectedMmsi(target.mmsi);
				});
				const marker = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
					.setLngLat([target.lon, target.lat])
					.addTo(map);
				if (target.headingDeg !== null) marker.setRotation(target.headingDeg);
				markersRef.current.set(target.mmsi, marker);
				continue;
			}
			existing.setLngLat([target.lon, target.lat]);
			if (target.headingDeg !== null) existing.setRotation(target.headingDeg);
			const desiredIconTag = iconTagFor(
				target.stale,
				target.headingDeg !== null,
				target.mmsi === selectedMmsi,
			);
			const currentIcon = existing.getElement().querySelector(AIS_ICON_SELECTOR);
			if (currentIcon && currentIcon.tagName.toLowerCase() !== desiredIconTag) {
				currentIcon.replaceWith(document.createElement(desiredIconTag));
			}
		}
		// selectedMmsi is included so the selected marker's icon swaps immediately on click/close,
		// not just whenever targets next happens to change for an unrelated reason.
	}, [mapRef, targets, selectedMmsi]);

	// Opens/updates/closes the selected target's detail popup. Reuses maplibregl.Popup rather
	// than a hand-rolled portal (as Tooltip.tsx uses for hover tooltips anchored to a React
	// element) since this popup is anchored to a map coordinate instead, which Popup already
	// repositions correctly through every pan/zoom/rotate, and already closes itself on an
	// outside click (closeOnClick below) or the toggletip's own trailing-icon close button (see
	// buildAisPopupContent) -- both wired back into selectedMmsi via the "close" event/onClose
	// callback, so there's no separate dismissal handler to write.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		if (selectedMmsi === null) {
			popupRef.current?.remove();
			popupRef.current = null;
			popupTargetRef.current = null;
			return;
		}

		const target = targets.find((t) => t.mmsi === selectedMmsi);
		if (!target) {
			// Selected target expired or was removed while its popup was open; the next effect
			// run (selectedMmsi === null) tears the popup down.
			setSelectedMmsi(null);
			return;
		}

		if (!popupRef.current) {
			const popup = new maplibregl.Popup({
				// obc-toggletip's own trailing-icon slot is the close affordance (see
				// buildAisPopupContent) instead of MapLibre's own button, so only one shows.
				closeButton: false,
				closeOnClick: true,
				anchor: "bottom",
				offset: POPUP_OFFSET,
				// MapLibre's own 240px default would otherwise clash with the toggletip's own
				// customWidth (see buildAisPopupContent) and skew where MapLibre thinks the box's
				// center (and thus the anchor/arrow) actually is.
				maxWidth: "none",
				className: styles.aisPopup ?? "",
			})
				.setLngLat([target.lon, target.lat])
				.setDOMContent(
					buildAisPopupContent(target, () => {
						setSelectedMmsi(null);
					}),
				)
				.addTo(map);
			popup.on("close", () => {
				setSelectedMmsi(null);
			});
			popupRef.current = popup;
			popupTargetRef.current = target;
			return;
		}

		popupRef.current.setLngLat([target.lon, target.lat]);
		if (!popupTargetRef.current || !targetRenderEquals(popupTargetRef.current, target)) {
			popupRef.current.setDOMContent(
				buildAisPopupContent(target, () => {
					setSelectedMmsi(null);
				}),
			);
			popupTargetRef.current = target;
		}
	}, [mapRef, selectedMmsi, targets]);

	useEffect(
		() => () => {
			for (const marker of markersRef.current.values()) {
				marker.remove();
			}
			markersRef.current.clear();
			popupRef.current?.remove();
			popupRef.current = null;
		},
		[],
	);
}
