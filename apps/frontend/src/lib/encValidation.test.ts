import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { LegPositions } from "./geo.js";
import { evaluateEncHazards } from "./encValidation.js";

const LEG: LegPositions = {
	toId: "wp-2",
	from: { id: "wp-1", lat: 59.0, lon: 10.0 },
	to: { id: "wp-2", lat: 59.1, lon: 10.1 },
};

function makeMap(features: unknown[], missingLayers: string[] = []): MapLibreMap {
	return {
		project: vi.fn(() => ({ x: 0, y: 0 })),
		queryRenderedFeatures: vi.fn(() => features),
		getZoom: vi.fn(() => 12),
		getLayer: vi.fn((id: string) => (missingLayers.includes(id) ? undefined : {})),
	} as unknown as MapLibreMap;
}

describe("evaluateEncHazards", () => {
	it("returns safe when no hazard features are rendered nearby", () => {
		const map = makeMap([]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("safe");
	});

	it("returns blocked when a restricted-area feature is present", () => {
		const map = makeMap([{ layer: { id: "resare" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked when an obstruction feature is present", () => {
		const map = makeMap([{ layer: { id: "obstrn" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked when an underwater rock feature is present", () => {
		const map = makeMap([{ layer: { id: "uwtroc" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked when a leg crosses charted land", () => {
		const map = makeMap([{ layer: { id: "lndare" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns warning when a depth area is shallower than the safety contour", () => {
		const map = makeMap([{ layer: { id: "depare" }, properties: { DRVAL1: 1 } }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("warning");
	});

	it("returns safe when a depth area is at or deeper than the safety contour", () => {
		const map = makeMap([{ layer: { id: "depare" }, properties: { DRVAL1: 10 } }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("safe");
	});

	it("prioritises blocked over warning when both are present", () => {
		const map = makeMap([
			{ layer: { id: "depare" }, properties: { DRVAL1: 1 } },
			{ layer: { id: "resare" }, properties: {} },
		]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("does not throw and skips layers missing from the current style", () => {
		// setStyle() (the day/dusk theme swap) synchronously clears every style-defined layer until
		// "style.load" finishes reloading -- a hazard recompute landing in that window used to throw
		// instead of just finding nothing new.
		const map = makeMap([{ layer: { id: "resare" }, properties: {} }], ["depare"]);
		expect(() => evaluateEncHazards(map, [LEG], 3)).not.toThrow();
		const queryCall = (map.queryRenderedFeatures as Mock).mock.calls[0] as [
			unknown,
			{ layers: string[] },
		];
		expect(queryCall[1].layers).not.toContain("depare");
		expect(queryCall[1].layers).toContain("resare");
	});

	it("evaluates every leg independently, keyed by toId", () => {
		const map = makeMap([{ layer: { id: "resare" }, properties: {} }]);
		const legs: LegPositions[] = [
			LEG,
			{
				toId: "wp-3",
				from: { id: "wp-2", lat: 59.1, lon: 10.1 },
				to: { id: "wp-3", lat: 59.2, lon: 10.2 },
			},
		];
		const result = evaluateEncHazards(map, legs, 3);
		expect(Object.keys(result)).toEqual(["wp-2", "wp-3"]);
	});
});
