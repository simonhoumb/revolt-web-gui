import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
// Imported for its custom-element registration side effect (customElement(...)) -- the marker
// below creates the element directly rather than mounting a nested React root, since unmounting a
// secondary root synchronously during the parent's own unmount trips a React warning.
import "@oicl/openbridge-webcomponents/dist/icons/icon-own-ship-iec.js";
import { useEffect, useRef, type RefObject } from "react";
import { OSLO_FJORD_CENTER } from "./useMapLibreInstance.js";
import styles from "../components/widgets/MapWidget.module.css";

export interface OwnShipPosition {
	latitude: number | null;
	longitude: number | null;
	headingDeg: number | null;
}

/**
 * Creates and owns the own-ship marker: a DOM marker (not a symbol layer, since the icon is an
 * OBC React/Lit component, not a sprite), hidden until the first GNSS fix arrives so it doesn't
 * sit at the chart centre before a real position is known. Must be called after
 * useMapLibreInstance in the same component so mapRef.current is already set by the time this
 * hook's own mount effect runs.
 */
export function useOwnShipMarker(
	mapRef: RefObject<MapLibreMap | null>,
	{ latitude, longitude, headingDeg }: OwnShipPosition,
): void {
	const markerRef = useRef<Marker | null>(null);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const vesselEl = document.createElement("div");
		vesselEl.className = styles.vesselMarker ?? "";
		vesselEl.style.visibility = "hidden";
		vesselEl.appendChild(document.createElement("obi-own-ship-iec"));
		const marker = new maplibregl.Marker({ element: vesselEl, rotationAlignment: "map" })
			.setLngLat(OSLO_FJORD_CENTER)
			.addTo(map);
		markerRef.current = marker;

		return () => {
			marker.remove();
			markerRef.current = null;
		};
	}, [mapRef]);

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
}
