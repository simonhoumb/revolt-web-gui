import { describe, it, expect } from "vitest";
import { isStale } from "./staleness.js";
import { SENSOR_STALE_MS } from "./thresholds.js";

describe("isStale", () => {
	it("is true when the timestamp is null", () => {
		expect(isStale(null, 1_000_000)).toBe(true);
	});

	it("is true when the timestamp is undefined", () => {
		expect(isStale(undefined, 1_000_000)).toBe(true);
	});

	it("is false for a reading within the staleness window", () => {
		expect(isStale(1_000_000, 1_000_000 + SENSOR_STALE_MS - 1)).toBe(false);
	});

	it("is true for a reading past the staleness window", () => {
		expect(isStale(1_000_000, 1_000_000 + SENSOR_STALE_MS + 1)).toBe(true);
	});
});
