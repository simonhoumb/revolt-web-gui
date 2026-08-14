import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { BrillianceMenu } from "./BrillianceMenu.js";
import { useChartSettings } from "../../context/useChartSettings.js";

vi.mock("../../context/useChartSettings.js", () => ({
	useChartSettings: vi.fn(),
}));

const mockUseChartSettings = useChartSettings as Mock;

const setPalette = vi.fn();
const setBrightness = vi.fn();

function setChartSettings() {
	mockUseChartSettings.mockReturnValue({
		palette: "dusk",
		setPalette,
		symbolStyle: "simplified",
		setSymbolStyle: vi.fn(),
		safetyContourM: 3,
		setSafetyContourM: vi.fn(),
		brightness: 50,
		setBrightness,
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("BrillianceMenu", () => {
	it("renders the palette and brightness from chart settings", () => {
		setChartSettings();
		render(<BrillianceMenu />);
		const menu = document.querySelector("obc-brilliance-menu") as HTMLElement & {
			palette: string;
			brightness: number;
		};
		expect(menu).not.toBeNull();
		expect(menu.palette).toBe("dusk");
		expect(menu.brightness).toBe(50);
	});

	it("calls setPalette when the menu fires palette-changed", () => {
		setChartSettings();
		render(<BrillianceMenu />);
		act(() => {
			document
				.querySelector("obc-brilliance-menu")
				?.dispatchEvent(new CustomEvent("palette-changed", { detail: { value: "night" } }));
		});
		expect(setPalette).toHaveBeenCalledWith("night");
	});

	it("calls setBrightness when the menu fires brightness-changed", () => {
		setChartSettings();
		render(<BrillianceMenu />);
		act(() => {
			document
				.querySelector("obc-brilliance-menu")
				?.dispatchEvent(new CustomEvent("brightness-changed", { detail: { value: 80 } }));
		});
		expect(setBrightness).toHaveBeenCalledWith(80);
	});
});
