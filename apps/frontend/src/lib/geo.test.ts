import { describe, it, expect } from "vitest";
import type { Waypoint } from "@revolt/shared-types";
import {
	haversineDistanceM,
	bearingDeg,
	computeLegPositions,
	destinationPoint,
	computeTurnArc,
	computeTurnArcs,
} from "./geo.js";

function makeWaypoint(id: string, lat: number, lon: number, switchRadius = 5): Waypoint {
	return {
		id,
		mission_id: "m1",
		sequence_number: 0,
		position: { latitude: lat, longitude: lon },
		target_speed: 5,
		switch_radius: switchRadius,
		heading_mode: 0,
		heading_deg: null,
		validation_status: null,
		reached_at: null,
	};
}

describe("haversineDistanceM", () => {
	it("returns 0 for the same point", () => {
		expect(haversineDistanceM(59.9, 10.7, 59.9, 10.7)).toBe(0);
	});

	it("returns roughly 111.2 km per degree of latitude", () => {
		const d = haversineDistanceM(59.0, 10.0, 60.0, 10.0);
		expect(d).toBeGreaterThan(110_000);
		expect(d).toBeLessThan(112_000);
	});
});

describe("bearingDeg", () => {
	it("is 0 (due north) when moving to higher latitude at the same longitude", () => {
		expect(bearingDeg(59.0, 10.0, 60.0, 10.0)).toBeCloseTo(0, 0);
	});

	it("is 90 (due east) when moving to higher longitude at the equator", () => {
		expect(bearingDeg(0, 10.0, 0, 11.0)).toBeCloseTo(90, 0);
	});

	it("is 180 (due south) when moving to lower latitude at the same longitude", () => {
		expect(bearingDeg(60.0, 10.0, 59.0, 10.0)).toBeCloseTo(180, 0);
	});

	it("is 270 (due west) when moving to lower longitude at the equator", () => {
		expect(bearingDeg(0, 11.0, 0, 10.0)).toBeCloseTo(270, 0);
	});
});

describe("computeLegPositions", () => {
	it("returns no legs for zero or one waypoint", () => {
		expect(computeLegPositions([])).toEqual([]);
		expect(computeLegPositions([makeWaypoint("a", 59, 10)])).toEqual([]);
	});

	it("builds one leg per consecutive waypoint pair", () => {
		const waypoints = [
			makeWaypoint("a", 59, 10),
			makeWaypoint("b", 59.1, 10.1),
			makeWaypoint("c", 59.2, 10.2),
		];
		const legs = computeLegPositions(waypoints);
		expect(legs).toHaveLength(2);
		expect(legs[0]).toEqual({
			toId: "b",
			from: { id: "a", lat: 59, lon: 10 },
			to: { id: "b", lat: 59.1, lon: 10.1 },
		});
		expect(legs[1]?.toId).toBe("c");
	});

	it("substitutes the overridden waypoint's live position in any leg it touches", () => {
		const waypoints = [
			makeWaypoint("a", 59, 10),
			makeWaypoint("b", 59.1, 10.1),
			makeWaypoint("c", 59.2, 10.2),
		];
		const legs = computeLegPositions(waypoints, { id: "b", lat: 61, lon: 12 });
		expect(legs[0]?.to).toEqual({ id: "b", lat: 61, lon: 12 });
		expect(legs[1]?.from).toEqual({ id: "b", lat: 61, lon: 12 });
		// The leg endpoints not involving the overridden waypoint are untouched.
		expect(legs[0]?.from).toEqual({ id: "a", lat: 59, lon: 10 });
		expect(legs[1]?.to).toEqual({ id: "c", lat: 59.2, lon: 10.2 });
	});
});

describe("destinationPoint", () => {
	it("moves due north by the expected distance", () => {
		const dest = destinationPoint(0, 0, 0, 111_320);
		expect(dest.lat).toBeCloseTo(1, 1);
		expect(dest.lon).toBeCloseTo(0, 3);
	});

	it("moves due east by the expected distance at the equator", () => {
		const dest = destinationPoint(0, 0, 90, 111_320);
		expect(dest.lat).toBeCloseTo(0, 3);
		expect(dest.lon).toBeCloseTo(1, 1);
	});

	it("round-trips back to the origin when reversed", () => {
		const dest = destinationPoint(59.4, 10.6, 37, 500);
		const back = destinationPoint(dest.lat, dest.lon, 37 + 180, 500);
		expect(back.lat).toBeCloseTo(59.4, 5);
		expect(back.lon).toBeCloseTo(10.6, 5);
	});
});

describe("computeTurnArc", () => {
	// prev -> turn heads due east; turn -> next heads due north -- a clean 90 degree turn, easy to
	// reason about tangent directions and arc extent.
	const prev = { lat: 0, lon: 0 };
	const turn = { lat: 0, lon: 0.001 };
	const next = { lat: 0.001, lon: 0.001 };

	it("returns null for a zero or negative radius", () => {
		expect(computeTurnArc(prev, turn, next, 0)).toBeNull();
		expect(computeTurnArc(prev, turn, next, -5)).toBeNull();
	});

	it("returns null for a negligible turn (near-collinear waypoints)", () => {
		const straightNext = { lat: 0, lon: 0.002 };
		expect(computeTurnArc(prev, turn, straightNext, 20)).toBeNull();
	});

	it("builds an arc tangent to both legs for a real turn", () => {
		const points = computeTurnArc(prev, turn, next, 20);
		expect(points).not.toBeNull();
		if (!points) return;
		expect(points.length).toBeGreaterThan(2);

		// The arc's start should sit on the inbound leg (same latitude as prev/turn, since that
		// leg runs due east), short of turn itself.
		const start = points[0];
		expect(start).toBeDefined();
		if (!start) return;
		expect(start.lat).toBeCloseTo(0, 4);
		expect(start.lon).toBeLessThan(turn.lon);
		expect(start.lon).toBeGreaterThan(prev.lon);

		// The arc's end should sit on the outbound leg (same longitude as turn/next, since that leg
		// runs due north), short of next itself.
		const end = points[points.length - 1];
		expect(end).toBeDefined();
		if (!end) return;
		expect(end.lon).toBeCloseTo(turn.lon, 4);
		expect(end.lat).toBeLessThan(next.lat);
		expect(end.lat).toBeGreaterThan(turn.lat);
	});

	it("clamps the tangent length so it never overshoots a short adjacent leg", () => {
		// A huge radius relative to very short legs -- without clamping, the tangent length formula
		// would place the arc's start/end well past prev/next.
		const shortNext = { lat: 0.0001, lon: 0.001 };
		const points = computeTurnArc(prev, turn, shortNext, 500);
		expect(points).not.toBeNull();
		if (!points) return;
		const start = points[0];
		expect(start).toBeDefined();
		if (!start) return;
		// Clamped to at most 45% of the (very short) inbound leg -- still strictly between prev and
		// turn, never at or past prev.
		expect(start.lon).toBeGreaterThan(prev.lon);
		expect(start.lon).toBeLessThan(turn.lon);
	});
});

describe("computeTurnArcs", () => {
	it("returns no arcs when there are fewer than three waypoints", () => {
		expect(computeTurnArcs([])).toEqual([]);
		expect(computeTurnArcs([makeWaypoint("a", 0, 0)])).toEqual([]);
		expect(computeTurnArcs([makeWaypoint("a", 0, 0), makeWaypoint("b", 0, 0.001)])).toEqual([]);
	});

	it("returns one arc per interior waypoint with a real turn", () => {
		const waypoints = [
			makeWaypoint("a", 0, 0),
			makeWaypoint("b", 0, 0.001),
			makeWaypoint("c", 0.001, 0.001),
			makeWaypoint("d", 0.001, 0.002),
		];
		const arcs = computeTurnArcs(waypoints);
		expect(arcs.map((a) => a.waypointId)).toEqual(["b", "c"]);
	});

	it("skips a waypoint with switch_radius 0", () => {
		const waypoints = [
			makeWaypoint("a", 0, 0),
			makeWaypoint("b", 0, 0.001, 0),
			makeWaypoint("c", 0.001, 0.001),
		];
		expect(computeTurnArcs(waypoints)).toEqual([]);
	});

	it("uses the overridden waypoint's live position when computing its arc", () => {
		const waypoints = [
			makeWaypoint("a", 0, 0),
			makeWaypoint("b", 0, 0.001),
			makeWaypoint("c", 0.001, 0.001),
		];
		const withoutOverride = computeTurnArcs(waypoints);
		const withOverride = computeTurnArcs(waypoints, { id: "c", lat: 0, lon: 0.002 });
		// Overriding "c" to be due east of "b" instead of due north changes the turn geometry, so
		// the resulting arc points differ from the un-overridden version.
		expect(withOverride[0]?.points).not.toEqual(withoutOverride[0]?.points);
	});
});
