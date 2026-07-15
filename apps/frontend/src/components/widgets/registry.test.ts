import { describe, it, expect } from "vitest";
import { ALL_WIDGET_IDS, WIDGET_REGISTRY } from "./registry.js";

describe("WIDGET_REGISTRY", () => {
	it("has an entry for every id in ALL_WIDGET_IDS, and no extras", () => {
		const registryIds = Object.keys(WIDGET_REGISTRY).sort();
		const allIds = [...ALL_WIDGET_IDS].sort();
		expect(registryIds).toEqual(allIds);
	});

	it("each entry's own id matches the key it's registered under", () => {
		for (const [key, def] of Object.entries(WIDGET_REGISTRY)) {
			expect(def.id).toBe(key);
		}
	});

	it("each entry has a non-empty label, a component, an icon, and positive default dimensions", () => {
		for (const def of Object.values(WIDGET_REGISTRY)) {
			expect(def.label.length).toBeGreaterThan(0);
			expect(def.component).toBeDefined();
			expect(def.icon).toBeDefined();
			expect(def.defaultW).toBeGreaterThan(0);
			expect(def.defaultH).toBeGreaterThan(0);
		}
	});

	it("min dimensions, where set, never exceed the default dimensions", () => {
		for (const def of Object.values(WIDGET_REGISTRY)) {
			if (def.minW !== undefined) expect(def.minW).toBeLessThanOrEqual(def.defaultW);
			if (def.minH !== undefined) expect(def.minH).toBeLessThanOrEqual(def.defaultH);
		}
	});

	it("ALL_WIDGET_IDS has no duplicate entries", () => {
		expect(new Set(ALL_WIDGET_IDS).size).toBe(ALL_WIDGET_IDS.length);
	});
});
