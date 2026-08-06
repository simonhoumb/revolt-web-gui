import { describe, it, expect } from "vitest";
import { arcPoints, ringPolygon, toChartBearing } from "./useLightSectors.js";
import { bearingDeg } from "../lib/geo.js";

// Even-odd point-in-polygon test (ray casting), used only to assert the light's own position never
// falls inside a ring polygon -- not re-verifying arcPoints'/destinationPoint's geometry itself.
function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const pi = ring[i];
		const pj = ring[j];
		if (!pi || !pj) continue;
		const [xi, yi] = pi;
		const [xj, yj] = pj;
		const intersect =
			yi > point[1] !== yj > point[1] &&
			point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

const LAT = 59.4;
const LON = 10.6;

describe("toChartBearing", () => {
	it("flips a seaward bearing 180 degrees to a from-the-light bearing", () => {
		expect(toChartBearing(0)).toBe(180);
		expect(toChartBearing(180)).toBe(0);
		expect(toChartBearing(90)).toBe(270);
	});

	it("wraps into [0, 360) rather than returning a negative or >=360 value", () => {
		expect(toChartBearing(270)).toBe(90);
		expect(toChartBearing(359)).toBeCloseTo(179, 5);
	});
});

describe("arcPoints", () => {
	it("sweeps the arc vertices from start to end for a normal (non-wrapping) sector", () => {
		const points = arcPoints(LAT, LON, 45, 90, 250);
		const first = points[0];
		const last = points[points.length - 1];
		expect(first).toBeDefined();
		expect(last).toBeDefined();
		if (!first || !last) throw new Error("unreachable");
		expect(bearingDeg(LAT, LON, first[1], first[0])).toBeCloseTo(45, 0);
		expect(bearingDeg(LAT, LON, last[1], last[0])).toBeCloseTo(90, 0);
	});

	it("sweeps forward across the 0/360 boundary when end is numerically less than start", () => {
		const points = arcPoints(LAT, LON, 350, 10, 250);
		const first = points[0];
		const last = points[points.length - 1];
		if (!first || !last) throw new Error("unreachable");
		expect(bearingDeg(LAT, LON, first[1], first[0])).toBeCloseTo(350, 0);
		expect(bearingDeg(LAT, LON, last[1], last[0])).toBeCloseTo(10, 0);
		// Every vertex must lie within the 20-degree wrap-around sweep (350->360->10), never jump
		// backward into the excluded 10-350 range the naive (end - start) difference would otherwise
		// produce.
		for (const [pLon, pLat] of points) {
			const bearing = bearingDeg(LAT, LON, pLat, pLon);
			// Floating-point round-trip through destinationPoint/bearingDeg can land a hair under 350
			// (e.g. 349.9999999996), so the boundary check needs a small epsilon rather than an exact
			// >= 350 comparison.
			expect(bearing >= 349.99 || bearing <= 10.01).toBe(true);
		}
	});

	it("produces a full-circle sweep rather than a degenerate sliver when start equals end", () => {
		const points = arcPoints(LAT, LON, 120, 120, 250);
		expect(points.length).toBeGreaterThan(90);
	});

	it("places every vertex at approximately the requested radius from the center", () => {
		const points = arcPoints(LAT, LON, 0, 180, 250);
		for (const [pLon, pLat] of points) {
			const dLat = pLat - LAT;
			const dLon = pLon - LON;
			// Rough planar distance check is enough here; this isn't re-verifying destinationPoint's
			// own spherical math (that's geo.test.ts's job), just confirming arcPoints actually used
			// the radius argument rather than a hardcoded value.
			const approxDegrees = Math.sqrt(dLat * dLat + dLon * dLon);
			expect(approxDegrees).toBeGreaterThan(0);
			expect(approxDegrees).toBeLessThan(0.01);
		}
	});
});

describe("ringPolygon", () => {
	// Regression test for a real bug: the inner arc was originally built by calling
	// arcPoints(end, start, ...) intending "the same short span, reversed" -- but arcPoints always
	// sweeps forward-clockwise from its own first argument, so swapping start/end computes the
	// *complementary* arc (360 minus the intended sweep), not its reverse. For a narrow sector this
	// produced a near-360-degree inner arc, which put the light's own position inside the resulting
	// "ring" -- reported live as a solid filled circle sitting inside the sector band. Reproduced here
	// with the exact real S-57 sector data (a light near 59.43518N 10.5766633E) that first surfaced
	// it, including its narrowest (2.5 degree) sector.
	const realSectors: [number, number][] = [
		[341.41, 346.84],
		[346.84, 0.55],
		[0.55, 3.05],
		[3.05, 60.7],
		[60.7, 114.48],
		[114.48, 188.34],
		[188.34, 204.03],
	];

	it.each(realSectors)("never includes the light's own position (raw %s -> %s)", (raw1, raw2) => {
		const start = toChartBearing(raw1);
		const end = toChartBearing(raw2);
		const ring = ringPolygon(LAT, LON, start, end, 50, 70);
		expect(pointInPolygon([LON, LAT], ring)).toBe(false);
	});

	it("produces a vertex count proportional to sweep width, not a near-full-circle inner arc", () => {
		const start = toChartBearing(0.55);
		const end = toChartBearing(3.05);
		const ring = ringPolygon(LAT, LON, start, end, 50, 70);
		// A ~2.5-degree sector should be a handful of vertices (outer + reversed inner + close),
		// nowhere near the ~120 a near-360-degree inner arc bug produced.
		expect(ring.length).toBeLessThan(15);
	});

	it("closes back to its own starting vertex", () => {
		const ring = ringPolygon(LAT, LON, 45, 90, 50, 70);
		expect(ring[0]).toEqual(ring[ring.length - 1]);
	});
});
