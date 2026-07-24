import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
// Imported for their custom-element registration side effect (customElement(...)); markers
// below create the elements directly rather than mounting a nested React root, same technique
// already used for the own-ship and waypoint markers. The "nohdgcog" variants render a target
// with no heading/COG marker, for reports where heading isn't available (e.g. base stations).
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-activated-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-activated-nohdgcog-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-sleeping-iec.js";
import "@oicl/openbridge-webcomponents/dist/icons/icon-ais-target-sleeping-nohdgcog-iec.js";
import { useEffect, useRef, type RefObject } from "react";
import type { AisTarget } from "./useAisTargets.js";
import styles from "../components/widgets/MapWidget.module.css";

function iconTagFor(stale: boolean, hasHeading: boolean): string {
	if (stale)
		return hasHeading ? "obi-ais-target-sleeping-iec" : "obi-ais-target-sleeping-nohdgcog-iec";
	return hasHeading ? "obi-ais-target-activated-iec" : "obi-ais-target-activated-nohdgcog-iec";
}

const AIS_ICON_SELECTOR =
	"obi-ais-target-activated-iec, obi-ais-target-activated-nohdgcog-iec, obi-ais-target-sleeping-iec, obi-ais-target-sleeping-nohdgcog-iec";

function createAisElement(target: AisTarget): HTMLDivElement {
	const el = document.createElement("div");
	el.className = styles.aisTargetMarker ?? "";
	el.appendChild(document.createElement(iconTagFor(target.stale, target.headingDeg !== null)));
	return el;
}

/**
 * Owns the AIS target markers: one per mmsi, created/updated/removed as reports arrive, expire,
 * or go stale. Must be called after useMapLibreInstance in the same component so mapRef.current
 * is already set by the time this hook's own effect runs. Pass an empty array to hide all
 * markers without unmounting the hook (used for the show/hide toolbar toggle).
 */
export function useAisMarkers(mapRef: RefObject<MapLibreMap | null>, targets: AisTarget[]): void {
	const markersRef = useRef<Map<number, Marker>>(new Map());

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
				const marker = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
					.setLngLat([target.lon, target.lat])
					.addTo(map);
				if (target.headingDeg !== null) marker.setRotation(target.headingDeg);
				markersRef.current.set(target.mmsi, marker);
				continue;
			}
			existing.setLngLat([target.lon, target.lat]);
			if (target.headingDeg !== null) existing.setRotation(target.headingDeg);
			existing
				.getElement()
				.querySelector(AIS_ICON_SELECTOR)
				?.replaceWith(
					document.createElement(iconTagFor(target.stale, target.headingDeg !== null)),
				);
		}
	}, [mapRef, targets]);

	useEffect(
		() => () => {
			for (const marker of markersRef.current.values()) {
				marker.remove();
			}
			markersRef.current.clear();
		},
		[],
	);
}
