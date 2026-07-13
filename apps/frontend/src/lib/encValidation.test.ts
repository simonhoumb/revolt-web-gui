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

// Present in every test's mocked features unless the test is specifically about coverage itself --
// otherwise every other check would be masked by a "no_data" result, since an empty features array
// means "no CATCOV=1 feature found nearby" just as much as it means "no hazard found nearby".
const COVERED = { layer: { id: "m_covr" }, properties: { CATCOV: 1 } };

function makeMap(features: unknown[], missingLayers: string[] = []): MapLibreMap {
	return {
		project: vi.fn(() => ({ x: 0, y: 0 })),
		queryRenderedFeatures: vi.fn(() => features),
		getZoom: vi.fn(() => 12),
		getLayer: vi.fn((id: string) => (missingLayers.includes(id) ? undefined : {})),
	} as unknown as MapLibreMap;
}

describe("evaluateEncHazards", () => {
	it("returns safe when no hazard features are rendered nearby, within charted coverage", () => {
		const map = makeMap([COVERED]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("safe");
	});

	it("returns blocked when a restricted-area feature is present", () => {
		const map = makeMap([COVERED, { layer: { id: "resare" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked when an obstruction feature is present", () => {
		const map = makeMap([COVERED, { layer: { id: "obstrn" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked when an underwater rock feature is present", () => {
		const map = makeMap([COVERED, { layer: { id: "uwtroc" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked when a leg crosses charted land", () => {
		const map = makeMap([COVERED, { layer: { id: "lndare" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns blocked even when the leg also lacks charted coverage", () => {
		// A blocked hazard was actually found, so the area obviously isn't unsurveyed -- blocked
		// must win regardless of whether a separate CATCOV=1 feature happened to be returned.
		const map = makeMap([{ layer: { id: "lndare" }, properties: {} }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns warning when a depth area is shallower than the safety contour", () => {
		const map = makeMap([COVERED, { layer: { id: "depare" }, properties: { DRVAL1: 1 } }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("warning");
	});

	it("returns safe when a depth area is at or deeper than the safety contour", () => {
		const map = makeMap([COVERED, { layer: { id: "depare" }, properties: { DRVAL1: 10 } }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("safe");
	});

	it("prioritises blocked over warning when both are present", () => {
		const map = makeMap([
			COVERED,
			{ layer: { id: "depare" }, properties: { DRVAL1: 1 } },
			{ layer: { id: "resare" }, properties: {} },
		]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("blocked");
	});

	it("returns no_data when no charted coverage feature is found nearby", () => {
		const map = makeMap([]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("no_data");
	});

	it("returns no_data when the only coverage feature found is explicitly CATCOV=2 (no coverage)", () => {
		const map = makeMap([{ layer: { id: "m_covr" }, properties: { CATCOV: 2 } }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("no_data");
	});

	it("prioritises no_data over a depth warning that would otherwise apply", () => {
		const map = makeMap([{ layer: { id: "depare" }, properties: { DRVAL1: 1 } }]);
		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("no_data");
	});

	it("returns no_data when only the far endpoint lacks coverage, not just when both do", () => {
		// Regression test for a real bug: checking "is any covered feature in a box spanning both
		// endpoints" could still find the *near* endpoint's own coverage polygon even when the far
		// endpoint was genuinely outside coverage, so the leg reported "safe" as long as just one
		// end was covered. Call order within evaluateLeg: 1) hazard-layers query over the shared
		// bbox, 2) coverage check at the "from" point, 3) coverage check at the "to" point.
		let call = 0;
		const map = {
			project: vi.fn(() => ({ x: 0, y: 0 })),
			queryRenderedFeatures: vi.fn(() => {
				call += 1;
				if (call === 3) return []; // "to" endpoint: no coverage feature found
				return [COVERED]; // hazard query and "from" endpoint: covered, no hazards
			}),
			getZoom: vi.fn(() => 12),
			getLayer: vi.fn(() => ({})),
		} as unknown as MapLibreMap;

		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("no_data");
	});

	it("returns no_data when only the near endpoint lacks coverage", () => {
		let call = 0;
		const map = {
			project: vi.fn(() => ({ x: 0, y: 0 })),
			queryRenderedFeatures: vi.fn(() => {
				call += 1;
				if (call === 2) return []; // "from" endpoint: no coverage feature found
				return [COVERED];
			}),
			getZoom: vi.fn(() => 12),
			getLayer: vi.fn(() => ({})),
		} as unknown as MapLibreMap;

		const result = evaluateEncHazards(map, [LEG], 3);
		expect(result["wp-2"]?.status).toBe("no_data");
	});

	it("does not throw and skips layers missing from the current style", () => {
		// setStyle() (the day/dusk theme swap) synchronously clears every style-defined layer until
		// "style.load" finishes reloading -- a hazard recompute landing in that window used to throw
		// instead of just finding nothing new.
		const map = makeMap([COVERED, { layer: { id: "resare" }, properties: {} }], ["depare"]);
		expect(() => evaluateEncHazards(map, [LEG], 3)).not.toThrow();
		const queryCall = (map.queryRenderedFeatures as Mock).mock.calls[0] as [
			unknown,
			{ layers: string[] },
		];
		expect(queryCall[1].layers).not.toContain("depare");
		expect(queryCall[1].layers).toContain("resare");
	});

	it("evaluates every leg independently, keyed by toId", () => {
		const map = makeMap([COVERED, { layer: { id: "resare" }, properties: {} }]);
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
