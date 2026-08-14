import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVesselTrack } from "./useVesselTrack.js";
import { useGnssData } from "./useGnssData.js";
import type { GnssData } from "./useGnssData.js";

vi.mock("./useGnssData.js", () => ({
	useGnssData: vi.fn(),
}));

const mockUseGnssData = useGnssData as Mock;

const baseGnss: GnssData = {
	latitude: null,
	longitude: null,
	altitudeM: null,
	fixStatus: null,
	fixLabel: "No fix",
	speedMs: null,
	headingDeg: null,
	courseDeg: null,
	isSimulation: false,
	stale: false,
};

describe("useVesselTrack", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns no points when there is no fix", () => {
		mockUseGnssData.mockReturnValue({ ...baseGnss });
		const { result } = renderHook(() => useVesselTrack());
		expect(result.current).toEqual([]);
	});

	it("records a point on the first fix", () => {
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.9, longitude: 10.7 });
		const { result } = renderHook(() => useVesselTrack());
		expect(result.current).toEqual([{ latitude: 59.9, longitude: 10.7, timestampMs: 0 }]);
	});

	it("does not sample again before the interval elapses", () => {
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.9, longitude: 10.7 });
		const { result, rerender } = renderHook(() => useVesselTrack());

		vi.setSystemTime(10_000);
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.91, longitude: 10.71 });
		rerender();

		expect(result.current).toHaveLength(1);
	});

	it("samples again once the interval has elapsed", () => {
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.9, longitude: 10.7 });
		const { result, rerender } = renderHook(() => useVesselTrack());

		vi.setSystemTime(30_000);
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.91, longitude: 10.71 });
		rerender();

		expect(result.current).toEqual([
			{ latitude: 59.9, longitude: 10.7, timestampMs: 0 },
			{ latitude: 59.91, longitude: 10.71, timestampMs: 30_000 },
		]);
	});

	it("drops points older than the track window", () => {
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.9, longitude: 10.7 });
		const { result, rerender } = renderHook(() => useVesselTrack());

		vi.setSystemTime(30 * 60_000 + 1);
		mockUseGnssData.mockReturnValue({ ...baseGnss, latitude: 59.95, longitude: 10.75 });
		rerender();

		expect(result.current).toEqual([
			{ latitude: 59.95, longitude: 10.75, timestampMs: 30 * 60_000 + 1 },
		]);
	});
});
