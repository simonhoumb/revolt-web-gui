import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapWidget } from "./MapWidget.js";

interface MockMapOptions {
	style: string;
}

const mapInstances: {
	options: MockMapOptions;
	setStyle: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
}[] = [];

vi.mock("maplibre-gl", () => {
	class MockMap {
		options: MockMapOptions;
		setStyle = vi.fn();
		remove = vi.fn();
		addControl = vi.fn();
		resize = vi.fn();

		constructor(options: MockMapOptions) {
			this.options = options;
			mapInstances.push(this);
		}
	}

	return { default: { Map: MockMap, NavigationControl: vi.fn() } };
});

afterEach(() => {
	cleanup();
	mapInstances.length = 0;
	document.documentElement.removeAttribute("data-obc-theme");
});

describe("MapWidget", () => {
	// index.html ships data-obc-theme="dusk" by default (TopNav's dimming
	// button toggles it to "day"); with no attribute at all -- the jsdom test
	// environment's starting state -- the widget should also fall back to the
	// dark style, since "day" is the only value that means light.
	it("initializes with the dark style by default (no theme attribute)", () => {
		render(<MapWidget />);
		expect(mapInstances[0]?.options.style).toBe("/map-styles/oslo-fjord-dark.json");
	});

	it("initializes with the light style when the theme is already day", () => {
		document.documentElement.setAttribute("data-obc-theme", "day");
		render(<MapWidget />);
		expect(mapInstances[0]?.options.style).toBe("/map-styles/oslo-fjord-light.json");
	});

	it("swaps to the light style when data-obc-theme changes to day", async () => {
		document.documentElement.setAttribute("data-obc-theme", "dusk");
		render(<MapWidget />);
		document.documentElement.setAttribute("data-obc-theme", "day");

		await vi.waitFor(() => {
			expect(mapInstances[0]?.setStyle).toHaveBeenCalledWith("/map-styles/oslo-fjord-light.json");
		});
	});

	it("removes the map instance on unmount", () => {
		const { unmount } = render(<MapWidget />);
		unmount();
		expect(mapInstances[0]?.remove).toHaveBeenCalled();
	});
});
