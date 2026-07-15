import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutProvider, useLayout } from "./LayoutContext.js";
import { ALL_WIDGET_IDS, WIDGET_REGISTRY } from "../components/widgets/registry.js";

const LAYOUT_KEY = "revolt-dashboard-layout";
const TEMPLATES_KEY = "revolt-dashboard-templates";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

function renderLayout() {
	return renderHook(() => useLayout(), { wrapper: LayoutProvider });
}

describe("LayoutProvider", () => {
	it("falls back to the default layout when nothing is stored", () => {
		const { result } = renderLayout();
		expect(result.current.config.tiles.length).toBeGreaterThan(0);
		expect(result.current.config.hiddenWidgets).toEqual([]);
	});

	it("falls back to the default layout when the stored value is corrupted JSON", () => {
		localStorage.setItem(LAYOUT_KEY, "{not valid json");
		const { result } = renderLayout();
		expect(result.current.config.tiles.length).toBeGreaterThan(0);
	});

	it("loads a previously stored layout verbatim", () => {
		const stored = {
			tiles: [{ i: "battery", x: 1, y: 2, w: 3, h: 4 }],
			hiddenWidgets: ALL_WIDGET_IDS.filter((id) => id !== "battery"),
		};
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(stored));
		const { result } = renderLayout();
		expect(result.current.config.tiles).toEqual([{ i: "battery", x: 1, y: 2, w: 3, h: 4 }]);
		expect(result.current.config.hiddenWidgets).toEqual(stored.hiddenWidgets);
	});

	it("filters out unknown widget ids from a stored layout", () => {
		const stored = {
			tiles: [
				{ i: "battery", x: 0, y: 0, w: 3, h: 5 },
				{ i: "no-longer-exists", x: 3, y: 0, w: 3, h: 5 },
			],
			hiddenWidgets: ["also-gone", ...ALL_WIDGET_IDS.filter((id) => id !== "battery")],
		};
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(stored));
		const { result } = renderLayout();
		expect(result.current.config.tiles.map((t) => t.i)).toEqual(["battery"]);
		expect(result.current.config.hiddenWidgets).not.toContain("also-gone");
	});

	it("backfills a widget id missing from both tiles and hiddenWidgets at a computed position", () => {
		// Simulates a widget added to the registry after this layout was saved: every id except
		// "gnss" is accounted for, so gnss should be backfilled into tiles using its own
		// registry-defined default width/height, not silently dropped.
		const stored = {
			tiles: ALL_WIDGET_IDS.filter((id) => id !== "gnss").map((id, i) => ({
				i: id,
				x: i,
				y: 0,
				w: 1,
				h: 1,
			})),
			hiddenWidgets: [],
		};
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(stored));
		const { result } = renderLayout();

		const backfilled = result.current.config.tiles.find((t) => t.i === "gnss");
		expect(backfilled).toBeDefined();
		expect(backfilled?.w).toBe(WIDGET_REGISTRY.gnss.defaultW);
		expect(backfilled?.h).toBe(WIDGET_REGISTRY.gnss.defaultH);
	});

	it("persists layout changes to localStorage", async () => {
		const { result } = renderLayout();
		act(() => {
			result.current.updateLayout([{ i: "battery", x: 5, y: 5, w: 3, h: 5 }]);
		});
		await vi.waitFor(() => {
			const raw = localStorage.getItem(LAYOUT_KEY);
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw ?? "{}") as { tiles: unknown };
			expect(parsed.tiles).toEqual([{ i: "battery", x: 5, y: 5, w: 3, h: 5 }]);
		});
	});

	it("addWidget places a new tile below the lowest existing one and unhides it", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.updateLayout([{ i: "battery", x: 0, y: 0, w: 3, h: 5 }]);
		});
		act(() => {
			result.current.removeWidget("gnss");
		});
		act(() => {
			result.current.addWidget("gnss");
		});
		const tile = result.current.config.tiles.find((t) => t.i === "gnss");
		expect(tile).toEqual({
			x: 0,
			y: 5,
			i: "gnss",
			w: WIDGET_REGISTRY.gnss.defaultW,
			h: WIDGET_REGISTRY.gnss.defaultH,
		});
		expect(result.current.config.hiddenWidgets).not.toContain("gnss");
	});

	it("removeWidget drops the tile and hides the widget", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.removeWidget("battery");
		});
		expect(result.current.config.tiles.some((t) => t.i === "battery")).toBe(false);
		expect(result.current.config.hiddenWidgets).toContain("battery");
	});

	it("resetLayout restores the built-in default config", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.removeWidget("battery");
		});
		expect(result.current.config.hiddenWidgets).toContain("battery");

		act(() => {
			result.current.resetLayout();
		});
		expect(result.current.config.hiddenWidgets).toEqual([]);
	});

	it("always includes the built-in templates, even with no saved user templates", () => {
		const { result } = renderLayout();
		const names = result.current.templates.map((t) => t.name);
		expect(names).toContain("Default");
		expect(names).toContain("Instruments only");
	});

	it("saveTemplate adds a new user template, and replaces one with the same name", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.updateLayout([{ i: "battery", x: 0, y: 0, w: 3, h: 5 }]);
		});
		act(() => {
			result.current.saveTemplate("My layout");
		});
		expect(result.current.templates.map((t) => t.name)).toContain("My layout");
		const firstSave = result.current.templates.find((t) => t.name === "My layout");
		expect(firstSave?.savedAt).toBeGreaterThan(0);

		act(() => {
			result.current.updateLayout([{ i: "gnss", x: 0, y: 0, w: 3, h: 5 }]);
		});
		act(() => {
			result.current.saveTemplate("My layout");
		});
		const templatesNamed = result.current.templates.filter((t) => t.name === "My layout");
		expect(templatesNamed).toHaveLength(1);
		expect(templatesNamed[0]?.tiles).toEqual([{ i: "gnss", x: 0, y: 0, w: 3, h: 5 }]);
	});

	it("loadTemplate applies a built-in template's tiles and hidden widgets", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.loadTemplate("Instruments only");
		});
		expect(result.current.config.hiddenWidgets).toContain("map");
		expect(result.current.config.tiles.map((t) => t.i)).toContain("thruster");
	});

	it("loadTemplate applies a user-saved template", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.updateLayout([{ i: "camera", x: 0, y: 0, w: 4, h: 8 }]);
		});
		act(() => {
			result.current.saveTemplate("Camera only");
		});
		act(() => {
			result.current.resetLayout();
		});
		expect(result.current.config.tiles.map((t) => t.i)).not.toEqual(["camera"]);

		act(() => {
			result.current.loadTemplate("Camera only");
		});
		expect(result.current.config.tiles).toEqual([{ i: "camera", x: 0, y: 0, w: 4, h: 8 }]);
	});

	it("loadTemplate is a no-op for a name that matches nothing", () => {
		const { result } = renderLayout();
		const before = result.current.config;
		act(() => {
			result.current.loadTemplate("does not exist");
		});
		expect(result.current.config).toBe(before);
	});

	it("deleteTemplate removes a user template but cannot remove a built-in one", () => {
		const { result } = renderLayout();
		act(() => {
			result.current.saveTemplate("Deletable");
		});
		expect(result.current.templates.map((t) => t.name)).toContain("Deletable");

		act(() => {
			result.current.deleteTemplate("Deletable");
		});
		expect(result.current.templates.map((t) => t.name)).not.toContain("Deletable");

		act(() => {
			result.current.deleteTemplate("Default");
		});
		expect(result.current.templates.map((t) => t.name)).toContain("Default");
	});

	it("persists user templates to localStorage", async () => {
		const { result } = renderLayout();
		act(() => {
			result.current.saveTemplate("Persisted");
		});
		await vi.waitFor(() => {
			const raw = localStorage.getItem(TEMPLATES_KEY);
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw ?? "[]") as { name: string }[];
			expect(parsed.some((t) => t.name === "Persisted")).toBe(true);
		});
	});

	it("toggleEditMode flips editMode on each call", () => {
		const { result } = renderLayout();
		expect(result.current.editMode).toBe(false);
		act(() => {
			result.current.toggleEditMode();
		});
		expect(result.current.editMode).toBe(true);
		act(() => {
			result.current.toggleEditMode();
		});
		expect(result.current.editMode).toBe(false);
	});
});
