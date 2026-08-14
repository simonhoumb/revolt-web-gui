import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, type RefObject } from "react";
import type { TrackPoint } from "./useVesselTrack.js";
import { s52Color, type ChartPalette } from "../lib/s52Colors.js";

const TRACK_SOURCE_ID = "vessel-track";
const TRACK_LINE_LAYER_ID = "vessel-track-line";
const TRACK_POINTS_LAYER_ID = "vessel-track-points";

// Local structural types for the track source's GeoJSON payload; avoids depending on
// @types/geojson's ambient global, which pnpm's isolated node_modules layout doesn't expose to
// this package. maplibre-gl's own source-data types are checked structurally, so this shape is
// enough.
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

/**
 * Registers the past-track (breadcrumb trail) source/layers on the map and keeps them in sync
 * with `track`. Style-bound sources/layers are wiped out whenever setStyle() runs (a palette/
 * symbolStyle/safetyContourM change in useMapLibreInstance), so they're (re)added on "style.load",
 * which fires both on the initial load and after every subsequent setStyle call -- since a palette
 * change is exactly one of the things that triggers that reload, reading paletteRef.current inside
 * addTrackLayers (rather than closing over the palette argument directly) picks up the new S-52
 * SHIPS color on the same reload, with no separate paint-property update needed. Must be called
 * after useMapLibreInstance in the same component so mapRef.current is already set by the time this
 * hook's own mount effect runs.
 */
export function useVesselTrackLayer(
	mapRef: RefObject<MapLibreMap | null>,
	track: TrackPoint[],
	palette: ChartPalette,
): void {
	const trackRef = useRef<TrackPoint[]>(track);
	const paletteRef = useRef<ChartPalette>(palette);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const addTrackLayers = () => {
			const trackColor = s52Color(paletteRef.current, "ships");
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
					"line-color": trackColor,
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
					"circle-color": trackColor,
				},
			});
		};
		map.on("style.load", addTrackLayers);

		return () => {
			map.off("style.load", addTrackLayers);
		};
	}, [mapRef]);

	useEffect(() => {
		trackRef.current = track;
		const source = mapRef.current?.getSource<GeoJSONSource>(TRACK_SOURCE_ID);
		source?.setData(trackToGeoJSON(track));
	}, [track, mapRef]);

	useEffect(() => {
		paletteRef.current = palette;
	}, [palette]);
}
