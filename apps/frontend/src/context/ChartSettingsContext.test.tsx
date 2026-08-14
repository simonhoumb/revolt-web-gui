import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChartSettingsProvider } from "./ChartSettingsContext.js";
import { useChartSettings } from "./useChartSettings.js";

const CHART_SETTINGS_KEY = "revolt-chart-settings";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

function renderChartSettings() {
	return renderHook(() => useChartSettings(), { wrapper: ChartSettingsProvider });
}

describe("ChartSettingsProvider", () => {
	it("falls back to defaults when nothing is stored", () => {
		const { result } = renderChartSettings();
		expect(result.current.palette).toBe("dusk");
		expect(result.current.symbolStyle).toBe("simplified");
		expect(result.current.safetyContourM).toBe(3);
		expect(result.current.brightness).toBe(50);
	});

	it("falls back to defaults when the stored value is corrupted JSON", () => {
		localStorage.setItem(CHART_SETTINGS_KEY, "{not valid json");
		const { result } = renderChartSettings();
		expect(result.current.palette).toBe("dusk");
	});

	it("loads a previously stored value verbatim", () => {
		localStorage.setItem(
			CHART_SETTINGS_KEY,
			JSON.stringify({
				palette: "night",
				symbolStyle: "traditional",
				safetyContourM: 10,
				brightness: 80,
			}),
		);
		const { result } = renderChartSettings();
		expect(result.current.palette).toBe("night");
		expect(result.current.symbolStyle).toBe("traditional");
		expect(result.current.safetyContourM).toBe(10);
		expect(result.current.brightness).toBe(80);
	});

	it("backfills only the malformed field, not the whole stored object", () => {
		localStorage.setItem(
			CHART_SETTINGS_KEY,
			JSON.stringify({
				palette: "not-a-real-palette",
				symbolStyle: "traditional",
				safetyContourM: 10,
				brightness: 80,
			}),
		);
		const { result } = renderChartSettings();
		expect(result.current.palette).toBe("dusk");
		expect(result.current.symbolStyle).toBe("traditional");
		expect(result.current.safetyContourM).toBe(10);
		expect(result.current.brightness).toBe(80);
	});

	it("rejects a non-positive safety contour and falls back to the default", () => {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ safetyContourM: -1 }));
		const { result } = renderChartSettings();
		expect(result.current.safetyContourM).toBe(3);
	});

	it("setPalette/setSymbolStyle/setSafetyContourM/setBrightness update state and persist", () => {
		const { result } = renderChartSettings();
		act(() => {
			result.current.setPalette("night");
			result.current.setSymbolStyle("traditional");
			result.current.setSafetyContourM(5);
			result.current.setBrightness(75);
		});
		expect(result.current.palette).toBe("night");
		expect(result.current.symbolStyle).toBe("traditional");
		expect(result.current.safetyContourM).toBe(5);
		expect(result.current.brightness).toBe(75);

		const stored = JSON.parse(localStorage.getItem(CHART_SETTINGS_KEY) ?? "{}") as unknown;
		expect(stored).toEqual({
			palette: "night",
			symbolStyle: "traditional",
			safetyContourM: 5,
			brightness: 75,
		});
	});

	it("useChartSettings throws when used outside a ChartSettingsProvider", () => {
		expect(() => renderHook(() => useChartSettings())).toThrow(
			"useChartSettings must be used within ChartSettingsProvider",
		);
	});
});
